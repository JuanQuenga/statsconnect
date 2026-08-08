import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { gameIdValidator } from "../schema";

const resourceValidator = v.union(v.literal("summary"), v.literal("stats"));
const sourceValidator = v.union(v.literal("direct"), v.literal("service"), v.literal("stub"));

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

/**
 * Upserts every affected resource for one (game, playerTag) in a single
 * transaction, so summary and stats can never diverge (spec §6). Any duplicate
 * rows left behind by an older write are collapsed onto the newest row.
 */
export const put = internalMutation({
  args: {
    game: gameIdValidator,
    playerTag: v.string(),
    rows: v.array(v.object({ resource: resourceValidator, payload: v.string() })),
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
