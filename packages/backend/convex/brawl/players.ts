import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { hourBucket } from "./controls";

export type PlayerSighting = {
  tag: string;
  name: string;
  clubTag?: string;
  clubName?: string;
  trophies?: number;
  iconId?: number;
};

const sighting = v.object({
  tag: v.string(),
  name: v.string(),
  clubTag: v.optional(v.string()),
  clubName: v.optional(v.string()),
  trophies: v.optional(v.number()),
  iconId: v.optional(v.number()),
});

const equipment = v.object({ id: v.number(), name: v.string() });
const ownedBrawler = v.object({
  id: v.number(),
  name: v.string(),
  power: v.number(),
  rank: v.number(),
  trophies: v.number(),
  highestTrophies: v.number(),
  gadgets: v.array(equipment),
  starPowers: v.array(equipment),
  gears: v.array(equipment),
  hypercharges: v.array(equipment),
});

const profileSnapshot = v.object({
  tag: v.string(),
  name: v.string(),
  trophies: v.number(),
  highestTrophies: v.number(),
  expLevel: v.number(),
  victory3v3: v.number(),
  soloVictories: v.number(),
  duoVictories: v.number(),
  clubTag: v.optional(v.string()),
  clubName: v.optional(v.string()),
  iconId: v.optional(v.number()),
  brawlerCount: v.number(),
  power11Count: v.number(),
  rankedCurrent: v.optional(v.number()),
  rankedCurrentName: v.optional(v.string()),
  rankedSeasonBest: v.optional(v.number()),
  rankedSeasonBestName: v.optional(v.string()),
  rankedBest: v.optional(v.number()),
  rankedBestName: v.optional(v.string()),
  brawlers: v.optional(v.array(ownedBrawler)),
});

const directoryResult = v.object({
  tag: v.string(),
  name: v.string(),
  clubTag: v.optional(v.string()),
  clubName: v.optional(v.string()),
  trophies: v.optional(v.number()),
  iconId: v.optional(v.number()),
  sightings: v.number(),
  updatedAt: v.number(),
});

const historyResult = v.object({
  day: v.number(),
  recordedAt: v.number(),
  name: v.string(),
  trophies: v.number(),
  highestTrophies: v.number(),
  expLevel: v.number(),
  victory3v3: v.number(),
  soloVictories: v.number(),
  duoVictories: v.number(),
  clubTag: v.optional(v.string()),
  clubName: v.optional(v.string()),
  iconId: v.optional(v.number()),
  brawlerCount: v.number(),
  power11Count: v.number(),
  rankedCurrent: v.optional(v.number()),
  rankedCurrentName: v.optional(v.string()),
  rankedSeasonBest: v.optional(v.number()),
  rankedSeasonBestName: v.optional(v.string()),
  rankedBest: v.optional(v.number()),
  rankedBestName: v.optional(v.string()),
  brawlers: v.optional(v.array(ownedBrawler)),
});

const battleResult = v.union(v.literal("victory"), v.literal("defeat"), v.literal("draw"), v.literal("unknown"));
const playerBattleResult = v.object({
  battleTime: v.string(),
  battleTimestamp: v.number(),
  mapId: v.optional(v.number()),
  mapName: v.optional(v.string()),
  mode: v.string(),
  battleType: v.optional(v.string()),
  result: battleResult,
  rank: v.optional(v.number()),
  trophyChange: v.optional(v.number()),
  brawlerId: v.optional(v.number()),
  brawlerName: v.optional(v.string()),
  brawlerPower: v.optional(v.number()),
  brawlerTrophies: v.optional(v.number()),
  starPlayer: v.boolean(),
});

const aggregateResult = v.object({
  days: v.number(),
  battles: v.number(),
  wins: v.number(),
  losses: v.number(),
  draws: v.number(),
  unknown: v.number(),
  winRate: v.number(),
  netTrophies: v.number(),
  starPlayerRate: v.number(),
});

function cleanTag(value: string): string | null {
  const tag = value.trim().toUpperCase().replace(/^#/, "");
  return /^[0289PYLQGRJCUV]{3,15}$/.test(tag) ? tag : null;
}

function utcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

export const recordSightings = internalMutation({
  args: { players: v.array(sighting) },
  returns: v.object({ recorded: v.number() }),
  handler: async (ctx, args) => {
    return await recordPlayerSightings(ctx, args.players);
  },
});

export async function recordPlayerSightings(
  ctx: MutationCtx,
  players: PlayerSighting[],
): Promise<{ recorded: number }> {
    const now = Date.now();
    let recorded = 0;
    const byTag = new Map<string, PlayerSighting>();
    for (const player of players.slice(0, 500)) {
      const tag = cleanTag(player.tag);
      const name = player.name.trim();
      if (!tag || !name) continue;
      const previous = byTag.get(tag);
      byTag.set(tag, {
        ...previous,
        ...player,
        tag,
        name,
        clubTag: player.clubTag ? cleanTag(player.clubTag) ?? undefined : previous?.clubTag,
      });
    }

    for (const player of byTag.values()) {
      const existing = await ctx.db
        .query("brawlPlayerDirectory")
        .withIndex("by_tag", (q) => q.eq("tag", player.tag))
        .unique();
      const values = {
        name: player.name,
        nameLower: player.name.toLocaleLowerCase(),
        clubTag: player.clubTag ?? existing?.clubTag,
        clubName: player.clubName ?? existing?.clubName,
        trophies: player.trophies ?? existing?.trophies,
        iconId: player.iconId ?? existing?.iconId,
        updatedAt: now,
      };
      if (existing) {
        const changed =
          existing.name !== values.name ||
          existing.nameLower !== values.nameLower ||
          existing.clubTag !== values.clubTag ||
          existing.clubName !== values.clubName ||
          existing.trophies !== values.trophies ||
          existing.iconId !== values.iconId;
        if (!changed) continue;
        await ctx.db.patch(existing._id, { ...values, sightings: existing.sightings + 1 });
      } else {
        await ctx.db.insert("brawlPlayerDirectory", {
          tag: player.tag,
          ...values,
          sightings: 1,
        });
      }
      recorded += 1;
    }

    return { recorded };
}

export const recordProfile = internalMutation({
  args: profileSnapshot,
  returns: v.object({ createdSnapshot: v.boolean() }),
  handler: async (ctx, args) => {
    const tag = cleanTag(args.tag);
    if (!tag) return { createdSnapshot: false };

    const now = Date.now();
    const existingPlayer = await ctx.db
      .query("brawlPlayerDirectory")
      .withIndex("by_tag", (q) => q.eq("tag", tag))
      .unique();
    const directoryValues = {
      name: args.name.trim(),
      nameLower: args.name.trim().toLocaleLowerCase(),
      clubTag: args.clubTag ? cleanTag(args.clubTag) ?? undefined : undefined,
      clubName: args.clubName,
      trophies: args.trophies,
      iconId: args.iconId,
      updatedAt: now,
    };
    if (existingPlayer) {
      const changed =
        existingPlayer.name !== directoryValues.name ||
        existingPlayer.nameLower !== directoryValues.nameLower ||
        existingPlayer.clubTag !== directoryValues.clubTag ||
        existingPlayer.clubName !== directoryValues.clubName ||
        existingPlayer.trophies !== directoryValues.trophies ||
        existingPlayer.iconId !== directoryValues.iconId;
      if (changed) {
        await ctx.db.patch(existingPlayer._id, {
          ...directoryValues,
          sightings: existingPlayer.sightings + 1,
        });
      }
    } else {
      await ctx.db.insert("brawlPlayerDirectory", {
        tag,
        ...directoryValues,
        sightings: 1,
      });
    }

    const day = utcDay(now);
    const existingSnapshot = await ctx.db
      .query("playerSnapshots")
      .withIndex("by_tag_and_day", (q) => q.eq("tag", tag).eq("day", day))
      .unique();
    const snapshot = {
      recordedAt: now,
      name: args.name.trim(),
      trophies: args.trophies,
      highestTrophies: args.highestTrophies,
      expLevel: args.expLevel,
      victory3v3: args.victory3v3,
      soloVictories: args.soloVictories,
      duoVictories: args.duoVictories,
      clubTag: args.clubTag ? cleanTag(args.clubTag) ?? undefined : undefined,
      clubName: args.clubName,
      iconId: args.iconId,
      brawlerCount: args.brawlerCount,
      power11Count: args.power11Count,
      rankedCurrent: args.rankedCurrent,
      rankedCurrentName: args.rankedCurrentName,
      rankedSeasonBest: args.rankedSeasonBest,
      rankedSeasonBestName: args.rankedSeasonBestName,
      rankedBest: args.rankedBest,
      rankedBestName: args.rankedBestName,
      brawlers: args.brawlers,
    };
    if (existingSnapshot) {
      const unchanged =
        existingSnapshot.name === snapshot.name &&
        existingSnapshot.trophies === snapshot.trophies &&
        existingSnapshot.highestTrophies === snapshot.highestTrophies &&
        existingSnapshot.expLevel === snapshot.expLevel &&
        existingSnapshot.victory3v3 === snapshot.victory3v3 &&
        existingSnapshot.soloVictories === snapshot.soloVictories &&
        existingSnapshot.duoVictories === snapshot.duoVictories &&
        existingSnapshot.clubTag === snapshot.clubTag &&
        existingSnapshot.clubName === snapshot.clubName &&
        existingSnapshot.iconId === snapshot.iconId &&
        existingSnapshot.brawlerCount === snapshot.brawlerCount &&
        existingSnapshot.power11Count === snapshot.power11Count &&
        existingSnapshot.rankedCurrent === snapshot.rankedCurrent &&
        existingSnapshot.rankedCurrentName === snapshot.rankedCurrentName &&
        existingSnapshot.rankedSeasonBest === snapshot.rankedSeasonBest &&
        existingSnapshot.rankedSeasonBestName === snapshot.rankedSeasonBestName &&
        existingSnapshot.rankedBest === snapshot.rankedBest &&
        existingSnapshot.rankedBestName === snapshot.rankedBestName &&
        JSON.stringify(existingSnapshot.brawlers ?? []) === JSON.stringify(snapshot.brawlers ?? []);
      if (unchanged) return { createdSnapshot: false };
      await ctx.db.patch(existingSnapshot._id, snapshot);
      return { createdSnapshot: false };
    }
    await ctx.db.insert("playerSnapshots", { tag, day, ...snapshot });
    return { createdSnapshot: true };
  },
});

export const search = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  returns: v.object({
    possibleTag: v.optional(v.string()),
    players: v.array(directoryResult),
  }),
  handler: async (ctx, args) => {
    const raw = args.query.trim();
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 12), 1), 25);
    if (!raw) return { players: [] };

    const possibleTag = cleanTag(raw) ?? undefined;
    const exactName = raw.toLocaleLowerCase();
    const [tagMatch, exactMatches, fuzzyMatches] = await Promise.all([
      possibleTag
        ? ctx.db.query("brawlPlayerDirectory").withIndex("by_tag", (q) => q.eq("tag", possibleTag)).unique()
        : null,
      ctx.db
        .query("brawlPlayerDirectory")
        .withIndex("by_name_lower", (q) => q.eq("nameLower", exactName))
        .take(limit),
      raw.length >= 2
        ? ctx.db.query("brawlPlayerDirectory").withSearchIndex("search_name", (q) => q.search("name", raw)).take(limit)
        : [],
    ]);

    const unique = new Map<string, NonNullable<typeof tagMatch>>();
    if (tagMatch) unique.set(tagMatch.tag, tagMatch);
    for (const player of [...exactMatches, ...fuzzyMatches]) unique.set(player.tag, player);
    const players = [...unique.values()]
      .sort((a, b) => {
        const exactA = a.nameLower === exactName ? 1 : 0;
        const exactB = b.nameLower === exactName ? 1 : 0;
        return exactB - exactA || b.sightings - a.sightings || (b.trophies ?? 0) - (a.trophies ?? 0);
      })
      .slice(0, limit)
      .map(({ tag, name, clubTag, clubName, trophies, iconId, sightings, updatedAt }) => ({
        tag,
        name,
        clubTag,
        clubName,
        trophies,
        iconId,
        sightings,
        updatedAt,
      }));

    return { possibleTag, players };
  },
});

export const history = query({
  args: { tag: v.string(), limit: v.optional(v.number()) },
  returns: v.array(historyResult),
  handler: async (ctx, args) => {
    const tag = cleanTag(args.tag);
    if (!tag) return [];
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 90), 1), 365);
    const rows = await ctx.db
      .query("playerSnapshots")
      .withIndex("by_tag_and_day", (q) => q.eq("tag", tag))
      .order("desc")
      .take(limit);
    return rows.map(({ day, recordedAt, name, trophies, highestTrophies, expLevel, victory3v3, soloVictories, duoVictories, clubTag, clubName, iconId, brawlerCount, power11Count, rankedCurrent, rankedCurrentName, rankedSeasonBest, rankedSeasonBestName, rankedBest, rankedBestName, brawlers }) => ({
      day,
      recordedAt,
      name,
      trophies,
      highestTrophies,
      expLevel,
      victory3v3,
      soloVictories,
      duoVictories,
      clubTag,
      clubName,
      iconId,
      brawlerCount,
      power11Count,
      rankedCurrent,
      rankedCurrentName,
      rankedSeasonBest,
      rankedSeasonBestName,
      rankedBest,
      rankedBestName,
      brawlers,
    }));
  },
});

type PlayerBattle = {
  battleTime: string;
  battleTimestamp: number;
  mapId?: number;
  mapName?: string;
  mode: string;
  battleType?: string;
  result: "victory" | "defeat" | "draw" | "unknown";
  rank?: number;
  trophyChange?: number;
  brawlerId?: number;
  brawlerName?: string;
  brawlerPower?: number;
  brawlerTrophies?: number;
  starPlayer: boolean;
};

function summarize(rows: PlayerBattle[], days: number) {
  const cutoff = Date.now() - days * 86_400_000;
  const scoped = rows.filter((row) => row.battleTimestamp >= cutoff);
  const wins = scoped.filter((row) => row.result === "victory").length;
  const losses = scoped.filter((row) => row.result === "defeat").length;
  const draws = scoped.filter((row) => row.result === "draw").length;
  const decided = wins + losses;
  return {
    days,
    battles: scoped.length,
    wins,
    losses,
    draws,
    unknown: scoped.length - wins - losses - draws,
    winRate: decided ? (wins / decided) * 100 : 0,
    netTrophies: scoped.reduce((sum, row) => sum + (row.trophyChange ?? 0), 0),
    starPlayerRate: scoped.length ? (scoped.filter((row) => row.starPlayer).length / scoped.length) * 100 : 0,
  };
}

function battleView(row: PlayerBattle): PlayerBattle {
  return {
    battleTime: row.battleTime,
    battleTimestamp: row.battleTimestamp,
    mapId: row.mapId,
    mapName: row.mapName,
    mode: row.mode,
    battleType: row.battleType,
    result: row.result,
    rank: row.rank,
    trophyChange: row.trophyChange,
    brawlerId: row.brawlerId,
    brawlerName: row.brawlerName,
    brawlerPower: row.brawlerPower,
    brawlerTrophies: row.brawlerTrophies,
    starPlayer: row.starPlayer,
  };
}

export const analytics = query({
  args: {
    tag: v.string(),
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
  },
  returns: v.object({
    battles: v.array(playerBattleResult),
    nextCursor: v.optional(v.number()),
    hasMore: v.boolean(),
    capped: v.boolean(),
    summaries: v.array(aggregateResult),
    streaks: v.object({ current: v.number(), currentResult: battleResult, longestWin: v.number() }),
    activity: v.array(v.object({ day: v.string(), battles: v.number(), wins: v.number() })),
    modes: v.array(v.object({ mode: v.string(), ...aggregateResult.fields })),
    brawlers: v.array(v.object({ brawlerId: v.number(), brawlerName: v.string(), ...aggregateResult.fields })),
  }),
  handler: async (ctx, args) => {
    const tag = cleanTag(args.tag);
    if (!tag) return { battles: [], hasMore: false, capped: false, summaries: [], streaks: { current: 0, currentResult: "unknown" as const, longestWin: 0 }, activity: [], modes: [], brawlers: [] };
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 50), 1), 100);
    const cutoff = Date.now() - 90 * 86_400_000;
    const [page, recentProbe] = await Promise.all([
      ctx.db.query("playerBattles").withIndex("by_player_and_battle_time", (q) =>
        args.before ? q.eq("playerTag", tag).lt("battleTimestamp", args.before) : q.eq("playerTag", tag),
      ).order("desc").take(limit + 1),
      ctx.db.query("playerBattles").withIndex("by_player_and_battle_time", (q) =>
        q.eq("playerTag", tag).gte("battleTimestamp", cutoff),
      ).order("desc").take(1_001),
    ]);
    const hasMore = page.length > limit;
    const battles = page.slice(0, limit).map(battleView);
    const recent = recentProbe.slice(0, 1_000).map(battleView);
    const currentResult = recent[0]?.result ?? "unknown";
    let current = 0;
    for (const row of recent) {
      if (row.result !== currentResult) break;
      current += 1;
    }
    let longestWin = 0;
    let winRun = 0;
    for (const row of [...recent].reverse()) {
      winRun = row.result === "victory" ? winRun + 1 : 0;
      longestWin = Math.max(longestWin, winRun);
    }
    const activityMap = new Map<string, { battles: number; wins: number }>();
    const modeMap = new Map<string, PlayerBattle[]>();
    const brawlerMap = new Map<string, PlayerBattle[]>();
    for (const row of recent) {
      const day = new Date(row.battleTimestamp).toISOString().slice(0, 10);
      const activity = activityMap.get(day) ?? { battles: 0, wins: 0 };
      activity.battles += 1;
      activity.wins += row.result === "victory" ? 1 : 0;
      activityMap.set(day, activity);
      modeMap.set(row.mode, [...(modeMap.get(row.mode) ?? []), row]);
      if (row.brawlerId) {
        const key = `${row.brawlerId}|${row.brawlerName ?? "Unknown"}`;
        brawlerMap.set(key, [...(brawlerMap.get(key) ?? []), row]);
      }
    }
    return {
      battles,
      nextCursor: hasMore ? battles.at(-1)?.battleTimestamp : undefined,
      hasMore,
      capped: recentProbe.length > 1_000,
      summaries: [7, 30, 90].map((days) => summarize(recent, days)),
      streaks: { current, currentResult, longestWin },
      activity: [...activityMap].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, ...value })),
      modes: [...modeMap].map(([mode, rows]) => ({ mode, ...summarize(rows, 90) })).sort((a, b) => b.battles - a.battles),
      brawlers: [...brawlerMap].map(([key, rows]) => {
        const [id, name] = key.split("|");
        return { brawlerId: Number(id), brawlerName: name, ...summarize(rows, 90) };
      }).sort((a, b) => b.battles - a.battles),
    };
  },
});

export const directorySize = query({
  args: {},
  returns: v.object({ count: v.number(), capped: v.boolean() }),
  handler: async (ctx) => {
    const rows = await ctx.db.query("brawlPlayerDirectory").take(10_001);
    return { count: Math.min(rows.length, 10_000), capped: rows.length > 10_000 };
  },
});

const cacheClaim = v.object({
  profileJson: v.optional(v.string()),
  battleLogJson: v.optional(v.string()),
  fetchProfile: v.boolean(),
  fetchBattleLog: v.boolean(),
  limited: v.boolean(),
  inFlight: v.boolean(),
});

export const claimPlayerCache = internalMutation({
  args: {
    tag: v.string(),
    profileTtlMs: v.number(),
    battleLogTtlMs: v.number(),
    leaseMs: v.number(),
    budgetLimit: v.number(),
    upstreamEnabled: v.boolean(),
  },
  returns: cacheClaim,
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("brawlPlayerCache")
      .withIndex("by_tag", (q) => q.eq("tag", args.tag))
      .unique();
    const profileFresh = Boolean(
      existing?.profileJson &&
      existing.profileFetchedAt !== undefined &&
      existing.profileFetchedAt > now - Math.max(0, args.profileTtlMs),
    );
    const battleLogFresh = Boolean(
      existing?.battleLogJson &&
      existing.battleLogFetchedAt !== undefined &&
      existing.battleLogFetchedAt > now - Math.max(0, args.battleLogTtlMs),
    );
    const profileInFlight = (existing?.profileLeaseUntil ?? 0) > now;
    const battleLogInFlight = (existing?.battleLogLeaseUntil ?? 0) > now;
    const wantsProfile = args.upstreamEnabled && !profileFresh && !profileInFlight;
    const wantsBattleLog = args.upstreamEnabled && !battleLogFresh && !battleLogInFlight;
    const requested = Number(wantsProfile) + Number(wantsBattleLog);

    const bucketStartedAt = hourBucket(now);
    const budgetKey = `public:${bucketStartedAt}`;
    const budget = requested > 0
      ? await ctx.db.query("brawlApiBudgets").withIndex("by_key", (q) => q.eq("key", budgetKey)).unique()
      : null;
    let remaining = Math.max(0, Math.floor(args.budgetLimit) - (budget?.reserved ?? 0));

    const fetchProfile = wantsProfile && remaining > 0;
    if (fetchProfile) remaining -= 1;
    const fetchBattleLog = wantsBattleLog && remaining > 0;
    const reserved = Number(fetchProfile) + Number(fetchBattleLog);

    if (reserved > 0) {
      if (budget) {
        await ctx.db.patch(budget._id, { reserved: budget.reserved + reserved, updatedAt: now });
      } else {
        await ctx.db.insert("brawlApiBudgets", {
          key: budgetKey,
          scope: "public",
          bucketStartedAt,
          reserved,
          updatedAt: now,
        });
      }

      const leases = {
        profileLeaseUntil: fetchProfile ? now + args.leaseMs : existing?.profileLeaseUntil,
        battleLogLeaseUntil: fetchBattleLog ? now + args.leaseMs : existing?.battleLogLeaseUntil,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, leases);
      } else {
        await ctx.db.insert("brawlPlayerCache", { tag: args.tag, ...leases });
      }
    }

    return {
      profileJson: existing?.profileJson,
      battleLogJson: existing?.battleLogJson,
      fetchProfile,
      fetchBattleLog,
      limited: requested > reserved,
      inFlight: profileInFlight || battleLogInFlight,
    };
  },
});

export const completePlayerCache = internalMutation({
  args: {
    tag: v.string(),
    profileAttempted: v.boolean(),
    battleLogAttempted: v.boolean(),
    profileJson: v.optional(v.string()),
    battleLogJson: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("brawlPlayerCache")
      .withIndex("by_tag", (q) => q.eq("tag", args.tag))
      .unique();
    if (!existing) return null;
    const now = Date.now();
    await ctx.db.patch(existing._id, {
      profileJson: args.profileJson ?? existing.profileJson,
      profileFetchedAt: args.profileJson === undefined ? existing.profileFetchedAt : now,
      profileLeaseUntil: args.profileAttempted ? undefined : existing.profileLeaseUntil,
      battleLogJson: args.battleLogJson ?? existing.battleLogJson,
      battleLogFetchedAt: args.battleLogJson === undefined ? existing.battleLogFetchedAt : now,
      battleLogLeaseUntil: args.battleLogAttempted ? undefined : existing.battleLogLeaseUntil,
      updatedAt: now,
    });
    return null;
  },
});
