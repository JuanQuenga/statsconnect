import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
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
import { lookupExpiresAt } from "./scheduling";

declare const process: { env: Record<string, string | undefined> };

type Resource = "summary" | "stats";
type Source = "direct" | "service" | "stub";

const REFRESH_BUDGET = 10;
const PRUNE_BUDGET = 200;

function envEnabled(value: string | undefined, fallback = true): boolean {
  if (value === undefined) return fallback;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), minimum), maximum);
}

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
 * rewriting the connected-profile snapshot on a plain read (spec §5).
 */
export type ReadThroughResult<T> = {
  result: AdapterResult<T>;
  synced: boolean;
  writtenResources: number;
};

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
  const cached = await ctx.runQuery(internal.hub.internal.profileCache.get, {
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
      writtenResources: 0,
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
    await ctx.runMutation(internal.hub.internal.profileCache.put, {
      game: options.game,
      playerTag: options.playerTag,
      rows: rows.map((row) => ({ resource: row.resource, payload: JSON.stringify(row.data) })),
      source: sourceFor(options.game, fresh.cache.state),
      fetchedAt: fresh.cache.fetchedAt,
      expiresAt: fresh.cache.expiresAt,
      staleUntil: lookupExpiresAt(
        `${options.game}:${options.playerTag}:${options.resource}`,
        fresh.cache.expiresAt,
      ),
    });
    return {
      result: { data: fresh.data, cache: fresh.cache },
      synced: true,
      writtenResources: rows.length,
    };
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
        writtenResources: 0,
      };
    }
    return publicError(error);
  }
}

async function refreshStats(
  ctx: ActionCtx,
  candidate: { game: GameId; playerTag: string },
): Promise<ReadThroughResult<ProfileStats>> {
  const adapter = getAdapter(candidate.game);
  return readThrough(ctx, {
    ...candidate,
    resource: "stats",
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
    if (!envEnabled(process.env.HUB_PROFILE_REFRESH_ENABLED)) {
      return {
        attemptedProfiles: 0,
        refreshedResources: 0,
        failedResources: 0,
      };
    }
    const candidates = await ctx.runMutation(internal.hub.internal.watchTargets.claimDuePlayerTargets, {
      now: Date.now(),
      limit: boundedInteger(
        process.env.HUB_PROFILE_REFRESH_BATCH,
        REFRESH_BUDGET,
        0,
        20,
      ),
      dailyLimit: boundedInteger(
        process.env.HUB_PROFILE_REFRESH_MAX_TARGETS_PER_DAY,
        480,
        0,
        20_000,
      ),
    });
    let refreshedResources = 0;
    let failedResources = 0;

    for (const candidate of candidates) {
      const attemptedAt = Date.now();
      let succeeded = false;
      try {
        // Every adapter primes summary from the same stats load. In particular,
        // Clash fetches its player document once instead of once per resource.
        const refreshed = await refreshStats(ctx, candidate);
        refreshedResources += refreshed.writtenResources;
        succeeded = refreshed.result.cache.state !== "stale";
        if (!succeeded) failedResources += 1;
      } catch (error) {
        failedResources += 1;
        console.warn("Background profile cache refresh failed", {
          game: candidate.game,
          playerTag: candidate.playerTag,
          resource: "stats+summary",
          error,
        });
      } finally {
        await ctx.runMutation(internal.hub.internal.watchTargets.recordPoll, {
          targetKey: candidate.targetKey,
          attemptedAt,
          succeeded,
        });
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
    refreshBudgetRows: v.number(),
    failedBranches: v.number(),
  }),
  handler: async (ctx): Promise<{
    profileCacheRows: number;
    connectThrottleRows: number;
    refreshBudgetRows: number;
    failedBranches: number;
  }> => {
    const now = Date.now();
    let profileCacheRows = 0;
    let connectThrottleRows = 0;
    let refreshBudgetRows = 0;
    let failedBranches = 0;

    try {
      profileCacheRows = await ctx.runMutation(internal.hub.internal.profileCache.pruneExpired, {
        now,
        limit: PRUNE_BUDGET,
      });
    } catch (error) {
      failedBranches += 1;
      console.warn("Background profile cache pruning failed", { error });
    }

    try {
      connectThrottleRows = await ctx.runMutation(internal.hub.internal.connectThrottle.pruneExpired, {
        now,
        limit: PRUNE_BUDGET,
      });
    } catch (error) {
      failedBranches += 1;
      console.warn("Background connect throttle pruning failed", { error });
    }

    try {
      refreshBudgetRows = await ctx.runMutation(
        internal.hub.internal.watchTargets.pruneRefreshBudgets,
        { now, limit: 32 },
      );
    } catch (error) {
      failedBranches += 1;
      console.warn("Hub refresh budget pruning failed", { error });
    }

    return {
      profileCacheRows,
      connectThrottleRows,
      refreshBudgetRows,
      failedBranches,
    };
  },
});
