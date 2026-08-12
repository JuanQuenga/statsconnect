import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "../_generated/server";

export const MIN_META_PICKS = 25;
const MAX_MAP_MATCHUPS = 1_000;

export function trophyBucketFromTrophies(trophies: number): "0-499" | "500-999" | "1000+" {
  if (trophies >= 1000) return "1000+";
  if (trophies >= 500) return "500-999";
  return "0-499";
}

export const getMapStats = query({
  args: {
    mapId: v.number(),
    trophyBucket: v.optional(v.string()),
  },
  returns: v.object({
    stats: v.array(v.object({
      brawlerId: v.number(),
      wins: v.number(),
      losses: v.number(),
      picks: v.number(),
      starPlayer: v.number(),
      winRate: v.number(),
      useRate: v.number(),
      trophyBucket: v.string(),
    })),
    teams: v.array(v.object({
      brawlerIds: v.array(v.number()),
      wins: v.number(),
      losses: v.number(),
      picks: v.number(),
      winRate: v.number(),
      trophyBucket: v.string(),
    })),
    matchups: v.array(v.object({
      brawlerId: v.number(),
      opponentBrawlerId: v.number(),
      wins: v.number(),
      losses: v.number(),
      picks: v.number(),
      winRate: v.number(),
      trophyBucket: v.string(),
    })),
    sampleSize: v.number(),
    minPicks: v.number(),
  }),
  handler: async (ctx, args) => {
    const trophyBucket = args.trophyBucket || "all";
    const [rows, teamRows, matchupRows] = await Promise.all([
      ctx.db
        .query("mapBrawlerStats")
        .withIndex("by_map_bucket", (q) => q.eq("mapId", args.mapId).eq("trophyBucket", trophyBucket))
        .take(200),
      ctx.db
        .query("mapTeamStats")
        .withIndex("by_map_bucket_hash", (q) => q.eq("mapId", args.mapId).eq("trophyBucket", trophyBucket))
        .take(200),
      ctx.db
        .query("mapBrawlerMatchups")
        .withIndex("by_map_bucket_brawler_opponent", (q) =>
          q.eq("mapId", args.mapId).eq("trophyBucket", trophyBucket),
        )
        .take(MAX_MAP_MATCHUPS),
    ]);

    const sampleSize = rows.reduce((sum, row) => sum + row.picks, 0);
    const stats = rows
      .map((row) => {
        const decided = row.wins + row.losses;
        return {
          brawlerId: row.brawlerId,
          wins: row.wins,
          losses: row.losses,
          picks: row.picks,
          starPlayer: row.starPlayer,
          winRate: decided ? (row.wins / decided) * 100 : 0,
          useRate: sampleSize ? (row.picks / sampleSize) * 100 : 0,
          trophyBucket: row.trophyBucket,
        };
      })
      .sort((a, b) => b.winRate - a.winRate || b.picks - a.picks);

    const teams = teamRows
      .map((row) => {
        const decided = row.wins + row.losses;
        return {
          brawlerIds: row.brawlerIds,
          wins: row.wins,
          losses: row.losses,
          picks: row.picks,
          winRate: decided ? (row.wins / decided) * 100 : 0,
          trophyBucket: row.trophyBucket,
        };
      })
      .sort((a, b) => b.picks - a.picks || b.winRate - a.winRate);

    const matchups = matchupRows
      .map((row) => {
        const decided = row.wins + row.losses;
        return {
          brawlerId: row.brawlerId,
          opponentBrawlerId: row.opponentBrawlerId,
          wins: row.wins,
          losses: row.losses,
          picks: row.picks,
          winRate: decided ? (row.wins / decided) * 100 : 0,
          trophyBucket: row.trophyBucket,
        };
      })
      .sort((a, b) => b.picks - a.picks || b.winRate - a.winRate);

    return { stats, teams, matchups, sampleSize, minPicks: MIN_META_PICKS };
  },
});

export const getCursor = internalQuery({
  args: { key: v.string() },
  returns: v.union(
    v.object({ offset: v.number(), updatedAt: v.number() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const cursor = await ctx.db
      .query("ingestCursors")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    return cursor ? { offset: cursor.offset, updatedAt: cursor.updatedAt } : null;
  },
});

export const setCursor = internalMutation({
  args: {
    key: v.string(),
    offset: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ingestCursors")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { offset: args.offset, updatedAt: Date.now() });
      return null;
    }
    await ctx.db.insert("ingestCursors", {
      key: args.key,
      offset: args.offset,
      updatedAt: Date.now(),
    });
    return null;
  },
});
