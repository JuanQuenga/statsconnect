import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { isProfileStats, isProfileSummary } from "./adapters/guards";
import {
  AdapterError,
  type AdapterLoadResult,
  type AdapterResult,
  type GameId,
} from "./adapters/types";

type Resource = "summary" | "stats";
type Source = "direct" | "service" | "stub";

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

export async function readThrough<T>(
  ctx: ActionCtx,
  options: {
    game: GameId;
    playerTag: string;
    resource: Resource;
    guard: (value: unknown) => value is T;
    load: () => Promise<AdapterLoadResult<T>>;
  },
): Promise<AdapterResult<T>> {
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
      data: parsed,
      cache: { state: cached.source === "stub" ? "stub" : "hit", fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
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
      await ctx.runMutation(internal.internal.profileCache.put, {
        game: options.game,
        playerTag: options.playerTag,
        resource: row.resource,
        payload: JSON.stringify(row.data),
        source: sourceFor(options.game, fresh.cache.state),
        fetchedAt: fresh.cache.fetchedAt,
        expiresAt: fresh.cache.expiresAt,
        staleUntil: fresh.cache.expiresAt + 86_400_000,
      });
    }
    return { data: fresh.data, cache: fresh.cache };
  } catch (error) {
    if (cached && parsed && cached.staleUntil > now) {
      return {
        data: parsed,
        cache: { state: "stale", fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
      };
    }
    return publicError(error);
  }
}
