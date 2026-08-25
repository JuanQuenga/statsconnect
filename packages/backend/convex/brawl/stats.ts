import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "../_generated/server";

export const MIN_META_PICKS = 25;
const META_ROW_LIMIT = 10_000;
const TEAM_ROW_LIMIT = 5_000;
const MAX_MAP_MATCHUPS = 1_000;
const DAILY_META_ROW_LIMIT = 7_000;
const DAILY_BRAWLER_ROW_LIMIT = 3_500;
const DAILY_MATCHUP_ROW_LIMIT = 1_500;
const DAY_MS = 86_400_000;
const trophyBucketValidator = v.union(
  v.literal("all"),
  v.literal("0-499"),
  v.literal("500-999"),
  v.literal("1000+"),
);
const trendWindowValidator = v.union(
  v.literal("7"),
  v.literal("30"),
  v.literal("90"),
  v.literal("all"),
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

const matchupResult = v.object({
  mapId: v.number(),
  brawlerId: v.number(),
  opponentBrawlerId: v.number(),
  wins: v.number(),
  losses: v.number(),
  picks: v.number(),
  winRate: v.number(),
  trophyBucket: v.string(),
});

const dailyPointResult = v.object({
  day: v.number(),
  wins: v.number(),
  losses: v.number(),
  picks: v.number(),
  starPlayer: v.number(),
  winRate: v.number(),
  starRate: v.number(),
});

const trendPeriodResult = v.object({
  stats: v.array(statResult),
  days: v.array(dailyPointResult),
  sampleSize: v.number(),
  startAt: v.number(),
  endAt: v.number(),
  capped: v.boolean(),
});

type DailyStatRow = {
  day: number;
  mapId: number;
  brawlerId: number;
  trophyBucket: string;
  wins: number;
  losses: number;
  picks: number;
  starPlayer: number;
};

type DailyMatchupRow = {
  mapId: number;
  trophyBucket: string;
  brawlerId: number;
  opponentBrawlerId: number;
  wins: number;
  losses: number;
  picks: number;
};

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

function utcDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function buildTrendPeriod(
  rows: DailyStatRow[],
  startAt: number,
  endAt: number,
  capped: boolean,
) {
  const grouped = new Map<string, DailyStatRow>();
  const days = new Map<number, { day: number; wins: number; losses: number; picks: number; starPlayer: number }>();
  for (const row of rows) {
    const key = `${row.mapId}:${row.brawlerId}`;
    const aggregate = grouped.get(key) || {
      day: row.day,
      mapId: row.mapId,
      brawlerId: row.brawlerId,
      trophyBucket: row.trophyBucket,
      wins: 0,
      losses: 0,
      picks: 0,
      starPlayer: 0,
    };
    aggregate.wins += row.wins;
    aggregate.losses += row.losses;
    aggregate.picks += row.picks;
    aggregate.starPlayer += row.starPlayer;
    grouped.set(key, aggregate);

    const day = days.get(row.day) || { day: row.day, wins: 0, losses: 0, picks: 0, starPlayer: 0 };
    day.wins += row.wins;
    day.losses += row.losses;
    day.picks += row.picks;
    day.starPlayer += row.starPlayer;
    days.set(row.day, day);
  }
  const stats = [...grouped.values()].map(toStatResult);
  const dailyPoints = [...days.values()]
    .sort((a, b) => a.day - b.day)
    .map((day) => {
      const decided = day.wins + day.losses;
      return {
        ...day,
        winRate: decided ? (day.wins / decided) * 100 : 0,
        starRate: day.picks ? (day.starPlayer / day.picks) * 100 : 0,
      };
    });
  return {
    stats,
    days: dailyPoints,
    sampleSize: rows.reduce((sum, row) => sum + row.picks, 0),
    startAt,
    endAt,
    capped,
  };
}

function buildTrendMatchups(rows: DailyMatchupRow[]) {
  const grouped = new Map<string, DailyMatchupRow>();
  for (const row of rows) {
    const key = `${row.mapId}:${row.brawlerId}:${row.opponentBrawlerId}`;
    const aggregate = grouped.get(key) || {
      mapId: row.mapId,
      trophyBucket: row.trophyBucket,
      brawlerId: row.brawlerId,
      opponentBrawlerId: row.opponentBrawlerId,
      wins: 0,
      losses: 0,
      picks: 0,
    };
    aggregate.wins += row.wins;
    aggregate.losses += row.losses;
    aggregate.picks += row.picks;
    grouped.set(key, aggregate);
  }
  return [...grouped.values()].map((row) => {
    const decided = row.wins + row.losses;
    return { ...row, winRate: decided ? (row.wins / decided) * 100 : 0 };
  });
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
    matchups: v.array(matchupResult),
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
    const [rows, teamRows, matchupRows] = await Promise.all([
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
      ctx.db
        .query("mapBrawlerMatchups")
        .withIndex("by_brawler_and_bucket", (q) =>
          q.eq("brawlerId", args.brawlerId).eq("trophyBucket", trophyBucket),
        )
        .take(2_000),
    ]);

    const stats = rows.map(toStatResult).sort((a, b) => b.picks - a.picks);
    const teams = teamRows
      .filter((row) => row.brawlerIds.includes(args.brawlerId))
      .map(toTeamResult)
      .sort((a, b) => b.picks - a.picks || b.winRate - a.winRate)
      .slice(0, 100);
    const matchups = matchupRows
      .map((row) => {
        const decided = row.wins + row.losses;
        return {
          mapId: row.mapId,
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
      matchups,
      totals: {
        ...totals,
        winRate: decided ? (totals.wins / decided) * 100 : 0,
        starRate: totals.picks ? (totals.starPlayer / totals.picks) * 100 : 0,
      },
      minPicks: MIN_META_PICKS,
      limitations: [
        "Build choices are not present in official battle logs, so build win rates are not inferred.",
        "Counter evidence begins prospectively; the official API cannot backfill matches from before tracking started.",
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

export const getMetaTrends = internalQuery({
  args: {
    trophyBucket: v.optional(trophyBucketValidator),
    window: trendWindowValidator,
    brawlerId: v.optional(v.number()),
    now: v.optional(v.number()),
  },
  returns: v.object({
    window: trendWindowValidator,
    windowDays: v.union(v.number(), v.null()),
    coverageStartAt: v.union(v.number(), v.null()),
    current: trendPeriodResult,
    previous: v.union(trendPeriodResult, v.null()),
    currentMatchups: v.array(matchupResult),
    previousMatchups: v.union(v.array(matchupResult), v.null()),
    matchupCapped: v.boolean(),
    comparisonReady: v.boolean(),
    currentCoverageComplete: v.boolean(),
    minPicks: v.number(),
    rowLimit: v.number(),
    matchupRowLimit: v.number(),
  }),
  handler: async (ctx, args) => {
    const trophyBucket = args.trophyBucket || "all";
    // Caller-supplied time keeps the query deterministic for caching.
    const today = utcDayStart(Math.min(args.now ?? Date.now(), Date.now()));
    const windowDays = args.window === "all" ? null : Number(args.window);
    const rowLimit = args.brawlerId ? DAILY_BRAWLER_ROW_LIMIT : DAILY_META_ROW_LIMIT;
    const firstRow = args.brawlerId
      ? await ctx.db
          .query("dailyMapBrawlerStats")
          .withIndex("by_brawler_bucket_and_day", (q) =>
            q.eq("brawlerId", args.brawlerId!).eq("trophyBucket", trophyBucket),
          )
          .order("asc")
          .first()
      : await ctx.db
          .query("dailyMapBrawlerStats")
          .withIndex("by_bucket_and_day", (q) => q.eq("trophyBucket", trophyBucket))
          .order("asc")
          .first();
    const coverageStartAt = firstRow?.day ?? null;
    const currentStart = windowDays === null
      ? coverageStartAt ?? today
      : today - (windowDays - 1) * DAY_MS;
    const currentEnd = today;

    const currentRowsWithOverflow = args.brawlerId
      ? await ctx.db
          .query("dailyMapBrawlerStats")
          .withIndex("by_brawler_bucket_and_day", (q) =>
            q
              .eq("brawlerId", args.brawlerId!)
              .eq("trophyBucket", trophyBucket)
              .gte("day", currentStart)
              .lte("day", currentEnd),
          )
          .take(rowLimit + 1)
      : await ctx.db
          .query("dailyMapBrawlerStats")
          .withIndex("by_bucket_and_day", (q) =>
            q.eq("trophyBucket", trophyBucket).gte("day", currentStart).lte("day", currentEnd),
          )
          .take(rowLimit + 1);
    const currentCapped = currentRowsWithOverflow.length > rowLimit;
    const current = buildTrendPeriod(
      currentRowsWithOverflow.slice(0, rowLimit),
      currentStart,
      currentEnd,
      currentCapped,
    );
    const currentMatchupRowsWithOverflow = args.brawlerId
      ? await ctx.db
          .query("dailyBrawlerMatchups")
          .withIndex("by_brawler_bucket_and_day", (q) =>
            q
              .eq("brawlerId", args.brawlerId!)
              .eq("trophyBucket", trophyBucket)
              .gte("day", currentStart)
              .lte("day", currentEnd),
          )
          .take(DAILY_MATCHUP_ROW_LIMIT + 1)
      : [];
    const currentMatchupCapped = currentMatchupRowsWithOverflow.length > DAILY_MATCHUP_ROW_LIMIT;
    const currentMatchups = buildTrendMatchups(currentMatchupRowsWithOverflow.slice(0, DAILY_MATCHUP_ROW_LIMIT));

    if (windowDays === null) {
      return {
        window: args.window,
        windowDays,
        coverageStartAt,
        current,
        previous: null,
        currentMatchups,
        previousMatchups: null,
        matchupCapped: currentMatchupCapped,
        comparisonReady: false,
        currentCoverageComplete: coverageStartAt !== null && !currentCapped,
        minPicks: MIN_META_PICKS,
        rowLimit,
        matchupRowLimit: DAILY_MATCHUP_ROW_LIMIT,
      };
    }

    const previousEnd = currentStart - DAY_MS;
    const previousStart = previousEnd - (windowDays - 1) * DAY_MS;
    const previousRowsWithOverflow = args.brawlerId
      ? await ctx.db
          .query("dailyMapBrawlerStats")
          .withIndex("by_brawler_bucket_and_day", (q) =>
            q
              .eq("brawlerId", args.brawlerId!)
              .eq("trophyBucket", trophyBucket)
              .gte("day", previousStart)
              .lte("day", previousEnd),
          )
          .take(rowLimit + 1)
      : await ctx.db
          .query("dailyMapBrawlerStats")
          .withIndex("by_bucket_and_day", (q) =>
            q.eq("trophyBucket", trophyBucket).gte("day", previousStart).lte("day", previousEnd),
          )
          .take(rowLimit + 1);
    const previousCapped = previousRowsWithOverflow.length > rowLimit;
    const previous = buildTrendPeriod(
      previousRowsWithOverflow.slice(0, rowLimit),
      previousStart,
      previousEnd,
      previousCapped,
    );
    const previousMatchupRowsWithOverflow = args.brawlerId
      ? await ctx.db
          .query("dailyBrawlerMatchups")
          .withIndex("by_brawler_bucket_and_day", (q) =>
            q
              .eq("brawlerId", args.brawlerId!)
              .eq("trophyBucket", trophyBucket)
              .gte("day", previousStart)
              .lte("day", previousEnd),
          )
          .take(DAILY_MATCHUP_ROW_LIMIT + 1)
      : [];
    const previousMatchupCapped = previousMatchupRowsWithOverflow.length > DAILY_MATCHUP_ROW_LIMIT;
    const previousMatchups = buildTrendMatchups(previousMatchupRowsWithOverflow.slice(0, DAILY_MATCHUP_ROW_LIMIT));
    const comparisonReady =
      coverageStartAt !== null &&
      coverageStartAt <= previousStart &&
      !currentCapped &&
      !previousCapped &&
      current.sampleSize > 0 &&
      previous.sampleSize > 0;
    return {
      window: args.window,
      windowDays,
      coverageStartAt,
      current,
      previous,
      currentMatchups,
      previousMatchups,
      matchupCapped: currentMatchupCapped || previousMatchupCapped,
      comparisonReady,
      currentCoverageComplete: coverageStartAt !== null && coverageStartAt <= currentStart && !currentCapped,
      minPicks: MIN_META_PICKS,
      rowLimit,
      matchupRowLimit: DAILY_MATCHUP_ROW_LIMIT,
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
