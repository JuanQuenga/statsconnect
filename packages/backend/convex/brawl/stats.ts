import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "../_generated/server";

export const MIN_META_PICKS = 25;
const META_ROW_LIMIT = 10_000;
const TEAM_ROW_LIMIT = 5_000;
const MAX_MAP_MATCHUPS = 1_000;
const trophyBucketValidator = v.union(
  v.literal("all"),
  v.literal("0-499"),
  v.literal("500-999"),
  v.literal("1000+"),
);

const statResult = v.object({
  mapId: v.number(),
  brawlerId: v.number(),
  wins: v.number(),
  losses: v.number(),
  picks: v.number(),
  starPlayer: v.number(),
  winRate: v.number(),
  starRate: v.number(),
  trophyBucket: v.string(),
});

const teamResult = v.object({
  mapId: v.number(),
  brawlerIds: v.array(v.number()),
  wins: v.number(),
  losses: v.number(),
  picks: v.number(),
  winRate: v.number(),
  trophyBucket: v.string(),
});

function toStatResult(row: {
  mapId: number;
  brawlerId: number;
  wins: number;
  losses: number;
  picks: number;
  starPlayer: number;
  trophyBucket: string;
}) {
  const decided = row.wins + row.losses;
  return {
    mapId: row.mapId,
    brawlerId: row.brawlerId,
    wins: row.wins,
    losses: row.losses,
    picks: row.picks,
    starPlayer: row.starPlayer,
    winRate: decided ? (row.wins / decided) * 100 : 0,
    starRate: row.picks ? (row.starPlayer / row.picks) * 100 : 0,
    trophyBucket: row.trophyBucket,
  };
}

function toTeamResult(row: {
  mapId: number;
  brawlerIds: number[];
  wins: number;
  losses: number;
  picks: number;
  trophyBucket: string;
}) {
  const decided = row.wins + row.losses;
  return {
    mapId: row.mapId,
    brawlerIds: row.brawlerIds,
    wins: row.wins,
    losses: row.losses,
    picks: row.picks,
    winRate: decided ? (row.wins / decided) * 100 : 0,
    trophyBucket: row.trophyBucket,
  };
}

export function trophyBucketFromTrophies(trophies: number): "0-499" | "500-999" | "1000+" {
  if (trophies >= 1000) return "1000+";
  if (trophies >= 500) return "500-999";
  return "0-499";
}

export const getMapStats = query({
  args: {
    mapId: v.number(),
    trophyBucket: v.optional(trophyBucketValidator),
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

export const getBrawlerStats = query({
  args: {
    brawlerId: v.number(),
    trophyBucket: v.optional(trophyBucketValidator),
  },
  returns: v.object({
    stats: v.array(statResult),
    teams: v.array(teamResult),
    totals: v.object({
      wins: v.number(),
      losses: v.number(),
      picks: v.number(),
      starPlayer: v.number(),
      winRate: v.number(),
      starRate: v.number(),
    }),
    minPicks: v.number(),
    limitations: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const trophyBucket = args.trophyBucket || "all";
    const [rows, teamRows] = await Promise.all([
      ctx.db
        .query("mapBrawlerStats")
        .withIndex("by_brawler_and_bucket", (q) =>
          q.eq("brawlerId", args.brawlerId).eq("trophyBucket", trophyBucket),
        )
        .take(1_000),
      ctx.db
        .query("mapTeamStats")
        .withIndex("by_trophy_bucket", (q) => q.eq("trophyBucket", trophyBucket))
        .take(TEAM_ROW_LIMIT),
    ]);

    const stats = rows.map(toStatResult).sort((a, b) => b.picks - a.picks);
    const teams = teamRows
      .filter((row) => row.brawlerIds.includes(args.brawlerId))
      .map(toTeamResult)
      .sort((a, b) => b.picks - a.picks || b.winRate - a.winRate)
      .slice(0, 100);
    const totals = rows.reduce(
      (result, row) => ({
        wins: result.wins + row.wins,
        losses: result.losses + row.losses,
        picks: result.picks + row.picks,
        starPlayer: result.starPlayer + row.starPlayer,
      }),
      { wins: 0, losses: 0, picks: 0, starPlayer: 0 },
    );
    const decided = totals.wins + totals.losses;

    return {
      stats,
      teams,
      totals: {
        ...totals,
        winRate: decided ? (totals.wins / decided) * 100 : 0,
        starRate: totals.picks ? (totals.starPlayer / totals.picks) * 100 : 0,
      },
      minPicks: MIN_META_PICKS,
      limitations: [
        "Build choices are not present in official battle logs, so build win rates are not inferred.",
        "Historical battle rows do not retain team sides, so counter claims are not published.",
      ],
    };
  },
});

export const getMetaResearch = query({
  args: { trophyBucket: v.optional(trophyBucketValidator) },
  returns: v.object({
    stats: v.array(statResult),
    sampleSize: v.number(),
    minPicks: v.number(),
    capped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const trophyBucket = args.trophyBucket || "all";
    const rows = await ctx.db
      .query("mapBrawlerStats")
      .withIndex("by_trophy_bucket", (q) => q.eq("trophyBucket", trophyBucket))
      .take(META_ROW_LIMIT + 1);
    const capped = rows.length > META_ROW_LIMIT;
    const visibleRows = rows.slice(0, META_ROW_LIMIT);
    return {
      stats: visibleRows.map(toStatResult),
      sampleSize: visibleRows.reduce((sum, row) => sum + row.picks, 0),
      minPicks: MIN_META_PICKS,
      capped,
    };
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
