import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import { isProfileStats, isProfileSummary } from "./adapters/guards";
import { getAdapter } from "./adapters/registry";
import {
  AdapterError,
  type AdapterLoadResult,
  type AdapterResult,
  type GameId,
  type ProfileStats,
  type ProfileSummary,
} from "./adapters/types";

type Resource = "summary" | "stats";
type Source = "direct" | "service" | "stub";

const REFRESH_BUDGET = 10;
const PRUNE_BUDGET = 200;

function publicError(error: unknown): never {
  if (error instanceof AdapterError) {
    throw new ConvexError({ code: error.code, message: error.message });
  }
  throw new ConvexError({
    code: "UPSTREAM_UNAVAILABLE",
    message: "StatsConnect could not refresh this profile. Try again shortly.",
  });
}

function sourceFor(game: GameId, resultState: AdapterResult<unknown>["cache"]["state"]): Source {
  if (resultState === "stub") return "stub";
  return game === "clash-royale" ? "direct" : "service";
}

/**
 * `synced` is true only when this call actually reached the adapter and stored
 * fresh data. Cache hits and stale fallbacks report false, so callers can avoid
 * rewriting the connected-profile snapshot on a plain read (spec §6).
 */
export type ReadThroughResult<T> = { result: AdapterResult<T>; synced: boolean };

export async function readThrough<T>(
  ctx: ActionCtx,
  options: {
    game: GameId;
    playerTag: string;
    resource: Resource;
    guard: (value: unknown) => value is T;
    load: () => Promise<AdapterLoadResult<T>>;
  },
): Promise<ReadThroughResult<T>> {
  const cached = await ctx.runQuery(internal.internal.profileCache.get, {
    game: options.game,
    playerTag: options.playerTag,
    resource: options.resource,
  });
  const now = Date.now();
  let parsed: T | null = null;
  if (cached?.schemaVersion === 1) {
    try {
      const value = JSON.parse(cached.payload) as unknown;
      parsed = options.guard(value) ? value : null;
    } catch {
      parsed = null;
    }
  }
  if (cached && parsed && cached.expiresAt > now) {
    return {
      result: {
        data: parsed,
        cache: { state: cached.source === "stub" ? "stub" : "hit", fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
      },
      synced: false,
    };
  }

  try {
    const fresh = await options.load();
    if (!options.guard(fresh.data)) {
      throw new AdapterError("BAD_UPSTREAM_RESPONSE", "The game service returned an unexpected profile shape.");
    }
    const rows = [
      { resource: options.resource, data: fresh.data },
      ...(fresh.primed ?? []),
    ];
    for (const row of rows) {
      const valid = row.resource === "summary"
        ? isProfileSummary(row.data)
        : isProfileStats(row.data);
      if (!valid) {
        throw new AdapterError("BAD_UPSTREAM_RESPONSE", "The game service returned unexpected cached statistics.");
      }
    }
    await ctx.runMutation(internal.internal.profileCache.put, {
      game: options.game,
      playerTag: options.playerTag,
      rows: rows.map((row) => ({ resource: row.resource, payload: JSON.stringify(row.data) })),
      source: sourceFor(options.game, fresh.cache.state),
      fetchedAt: fresh.cache.fetchedAt,
      expiresAt: fresh.cache.expiresAt,
      staleUntil: fresh.cache.expiresAt + 86_400_000,
    });
    return { result: { data: fresh.data, cache: fresh.cache }, synced: true };
  } catch (error) {
    if (cached && parsed && cached.staleUntil > now) {
      return {
        result: {
          data: parsed,
          // A stub-written row keeps its stub provenance even when it goes stale,
          // so the UI never labels sample data as real cached statistics.
          cache: { state: cached.source === "stub" ? "stub" : "stale", fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
        },
        synced: false,
      };
    }
    return publicError(error);
  }
}

async function refreshResource(
  ctx: ActionCtx,
  candidate: { game: GameId; playerTag: string },
  resource: Resource,
): Promise<ReadThroughResult<ProfileSummary | ProfileStats>> {
  const adapter = getAdapter(candidate.game);
  if (resource === "summary") {
    return readThrough(ctx, {
      ...candidate,
      resource,
      guard: isProfileSummary,
      load: () => adapter.getProfileSummary(candidate.playerTag),
    });
  }
  return readThrough(ctx, {
    ...candidate,
    resource,
    guard: isProfileStats,
    load: () => adapter.getStats(candidate.playerTag),
  });
}

export const refreshExpiredConnected = internalAction({
  args: {},
  returns: v.object({
    attemptedProfiles: v.number(),
    refreshedResources: v.number(),
    failedResources: v.number(),
  }),
  handler: async (ctx): Promise<{
    attemptedProfiles: number;
    refreshedResources: number;
    failedResources: number;
  }> => {
    const candidates = await ctx.runQuery(internal.internal.profileCache.listExpiredConnected, {
      now: Date.now(),
      limit: REFRESH_BUDGET,
    });
    let refreshedResources = 0;
    let failedResources = 0;

    for (const candidate of candidates) {
      for (const resource of ["summary", "stats"] as const) {
        try {
          const refreshed = await refreshResource(ctx, candidate, resource);
          if (refreshed.synced) refreshedResources += 1;
          else if (refreshed.result.cache.state === "stale") failedResources += 1;
        } catch (error) {
          failedResources += 1;
          console.warn("Background profile cache refresh failed", {
            game: candidate.game,
            playerTag: candidate.playerTag,
            resource,
            error,
          });
        }
      }
    }

    return {
      attemptedProfiles: candidates.length,
      refreshedResources,
      failedResources,
    };
  },
});

export const pruneExpired = internalAction({
  args: {},
  returns: v.object({
    profileCacheRows: v.number(),
    connectThrottleRows: v.number(),
    failedBranches: v.number(),
  }),
  handler: async (ctx): Promise<{
    profileCacheRows: number;
    connectThrottleRows: number;
    failedBranches: number;
  }> => {
    const now = Date.now();
    let profileCacheRows = 0;
    let connectThrottleRows = 0;
    let failedBranches = 0;

    try {
      profileCacheRows = await ctx.runMutation(internal.internal.profileCache.pruneExpired, {
        now,
        limit: PRUNE_BUDGET,
      });
    } catch (error) {
      failedBranches += 1;
      console.warn("Background profile cache pruning failed", { error });
    }

    try {
      connectThrottleRows = await ctx.runMutation(internal.internal.connectThrottle.pruneExpired, {
        now,
        limit: PRUNE_BUDGET,
      });
    } catch (error) {
      failedBranches += 1;
      console.warn("Background connect throttle pruning failed", { error });
    }

    return { profileCacheRows, connectThrottleRows, failedBranches };
  },
});
