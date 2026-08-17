import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";
import { gameIdValidator } from "../schema";

const resourceValidator = v.union(v.literal("summary"), v.literal("stats"));
const writableResourceValidator = v.literal("summary");
const sourceValidator = v.union(v.literal("direct"), v.literal("service"), v.literal("stub"));
const refreshCandidateValidator = v.object({
  game: gameIdValidator,
  playerTag: v.string(),
});

const MAX_CANDIDATE_SCAN = 500;
const MAX_REFRESH_CANDIDATES = 10;
const MAX_PRUNE_ROWS = 200;
const MAX_PRUNE_SCAN = 1_000;

const cacheRowValidator = v.object({
  _id: v.id("profileCache"),
  game: gameIdValidator,
  playerTag: v.string(),
  resource: resourceValidator,
  payload: v.string(),
  schemaVersion: v.number(),
  source: sourceValidator,
  fetchedAt: v.number(),
  expiresAt: v.number(),
  staleUntil: v.number(),
});

export const get = internalQuery({
  args: { game: gameIdValidator, playerTag: v.string(), resource: resourceValidator },
  returns: v.union(cacheRowValidator, v.null()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("profileCache")
      .withIndex("by_game_and_player_tag_and_resource", (query) =>
        query.eq("game", args.game).eq("playerTag", args.playerTag).eq("resource", args.resource))
      .order("desc")
      .take(1);
    const row = rows[0];
    if (!row) return null;
    return {
      _id: row._id,
      game: row.game,
      playerTag: row.playerTag,
      resource: row.resource,
      payload: row.payload,
      schemaVersion: row.schemaVersion,
      source: row.source,
      fetchedAt: row.fetchedAt,
      expiresAt: row.expiresAt,
      staleUntil: row.staleUntil,
    };
  },
});

export const listExpiredConnected = internalQuery({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(refreshCandidateValidator),
  handler: async (ctx, args) => {
    const limit = Math.max(0, Math.min(Math.floor(args.limit), MAX_REFRESH_CANDIDATES));
    if (limit === 0) return [];

    const expired = await ctx.db
      .query("profileCache")
      .withIndex("by_expires_at", (query) => query.lte("expiresAt", args.now))
      .order("asc")
      .take(MAX_CANDIDATE_SCAN);
    const candidates: Array<{ game: typeof expired[number]["game"]; playerTag: string }> = [];
    const seen = new Set<string>();

    for (const row of expired) {
      const key = `${row.game}:${row.playerTag}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const connected = await ctx.db
        .query("savedProfiles")
        .withIndex("by_game_and_player_tag", (query) =>
          query.eq("game", row.game).eq("playerTag", row.playerTag))
        .take(1);
      if (connected.length === 0) continue;

      candidates.push({ game: row.game, playerTag: row.playerTag });
      if (candidates.length === limit) break;
    }

    return candidates;
  },
});

/** Upserts the Hub-owned profile summary and collapses any duplicate rows. */
export const put = internalMutation({
  args: {
    game: gameIdValidator,
    playerTag: v.string(),
    rows: v.array(v.object({ resource: writableResourceValidator, payload: v.string() })),
    source: sourceValidator,
    fetchedAt: v.number(),
    expiresAt: v.number(),
    staleUntil: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("profileCache")
        .withIndex("by_game_and_player_tag_and_resource", (query) =>
          query.eq("game", args.game).eq("playerTag", args.playerTag).eq("resource", row.resource))
        .order("desc")
        .take(25);
      const value = {
        game: args.game,
        playerTag: args.playerTag,
        resource: row.resource,
        payload: row.payload,
        schemaVersion: 1,
        source: args.source,
        fetchedAt: args.fetchedAt,
        expiresAt: args.expiresAt,
        staleUntil: args.staleUntil,
      };
      const current = existing[0];
      if (current) await ctx.db.replace(current._id, value);
      else await ctx.db.insert("profileCache", value);
      for (const duplicate of existing.slice(1)) await ctx.db.delete(duplicate._id);
    }
    return null;
  },
});

export const pruneExpired = internalMutation({
  args: { now: v.number(), limit: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const limit = Math.max(0, Math.min(Math.floor(args.limit), MAX_PRUNE_ROWS));
    if (limit === 0) return 0;

    const expired = await ctx.db
      .query("profileCache")
      .withIndex("by_stale_until", (query) => query.lte("staleUntil", args.now))
      .order("asc")
      .take(MAX_PRUNE_SCAN);
    let deleted = 0;

    for (const row of expired) {
      // Statistics were previously cached for Hub dashboards. They no longer
      // have a reader, so expired legacy rows can be removed even when their
      // profile remains connected.
      if (row.resource === "stats") {
        await ctx.db.delete(row._id);
        deleted += 1;
        if (deleted === limit) break;
        continue;
      }
      const connected = await ctx.db
        .query("savedProfiles")
        .withIndex("by_game_and_player_tag", (query) =>
          query.eq("game", row.game).eq("playerTag", row.playerTag))
        .take(1);
      if (connected.length > 0) continue;

      await ctx.db.delete(row._id);
      deleted += 1;
      if (deleted === limit) break;
    }

    return deleted;
  },
});
