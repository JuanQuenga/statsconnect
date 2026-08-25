import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import { isProfileSummary } from "./adapters/guards";
import { getAdapter } from "./adapters/registry";
import {
  AdapterError,
  type AdapterResult,
  type GameId,
  type ProfileSummary,
} from "./adapters/types";

type Resource = "summary";
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

/** Reports whether this call fetched and stored fresh data. */
export type ReadThroughResult<T> = { result: AdapterResult<T>; synced: boolean };

export async function readThrough<T>(
  ctx: ActionCtx,
  options: {
    game: GameId;
    playerTag: string;
    resource: Resource;
    guard: (value: unknown) => value is T;
    load: () => Promise<AdapterResult<T>>;
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
    };
  }

  try {
    const fresh = await options.load();
    if (!options.guard(fresh.data)) {
      throw new AdapterError("BAD_UPSTREAM_RESPONSE", "The game service returned an unexpected profile shape.");
    }
    await ctx.runMutation(internal.hub.internal.profileCache.put, {
      game: options.game,
      playerTag: options.playerTag,
      rows: [{ resource: options.resource, payload: JSON.stringify(fresh.data) }],
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
): Promise<ReadThroughResult<ProfileSummary>> {
  const adapter = getAdapter(candidate.game);
  return readThrough(ctx, {
    ...candidate,
    resource: "summary",
    guard: isProfileSummary,
    load: () => adapter.getProfileSummary(candidate.playerTag),
  });
}

const WATCH_POLL_BATCH = 20;
const WATCH_DAILY_LIMIT = 500;

/**
 * Polls due premium/connected watch targets. claimDuePlayerTargets leases the
 * batch and advances the shared daily budget; every attempt is settled through
 * recordPoll so cadence and failure counters stay accurate.
 */
export const refreshDueWatchTargets = internalAction({
  args: {},
  returns: v.object({
    attemptedTargets: v.number(),
    refreshedTargets: v.number(),
    failedTargets: v.number(),
  }),
  handler: async (ctx): Promise<{
    attemptedTargets: number;
    refreshedTargets: number;
    failedTargets: number;
  }> => {
    const now = Date.now();
    const targets = await ctx.runMutation(internal.hub.internal.watchTargets.claimDuePlayerTargets, {
      now,
      limit: WATCH_POLL_BATCH,
      dailyLimit: WATCH_DAILY_LIMIT,
    });
    let refreshedTargets = 0;
    let failedTargets = 0;

    for (const target of targets) {
      let succeeded = false;
      try {
        const refreshed = await refreshResource(ctx, { game: target.game, playerTag: target.playerTag });
        succeeded = refreshed.synced || refreshed.result.cache.state === "hit";
        if (refreshed.synced) refreshedTargets += 1;
        else failedTargets += 1;
      } catch (error) {
        failedTargets += 1;
        console.warn("Watch target refresh failed", {
          game: target.game,
          playerTag: target.playerTag,
          error,
        });
      } finally {
        await ctx.runMutation(internal.hub.internal.watchTargets.recordPoll, {
          targetKey: target.targetKey,
          attemptedAt: Date.now(),
          succeeded,
        });
      }
    }

    return {
      attemptedTargets: targets.length,
      refreshedTargets,
      failedTargets,
    };
  },
});

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
    const candidates = await ctx.runQuery(internal.hub.internal.profileCache.listExpiredConnected, {
      now: Date.now(),
      limit: REFRESH_BUDGET,
    });
    let refreshedResources = 0;
    let failedResources = 0;

    for (const candidate of candidates) {
      try {
        const refreshed = await refreshResource(ctx, candidate);
        if (refreshed.synced) refreshedResources += 1;
        else if (refreshed.result.cache.state === "stale") failedResources += 1;
      } catch (error) {
        failedResources += 1;
        console.warn("Background profile cache refresh failed", {
          game: candidate.game,
          playerTag: candidate.playerTag,
          resource: "summary",
          error,
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
      refreshBudgetRows = await ctx.runMutation(internal.hub.internal.watchTargets.pruneRefreshBudgets, {
        now,
        limit: 32,
      });
    } catch (error) {
      failedBranches += 1;
      console.warn("Background refresh budget pruning failed", { error });
    }

    return { profileCacheRows, connectThrottleRows, refreshBudgetRows, failedBranches };
  },
});
