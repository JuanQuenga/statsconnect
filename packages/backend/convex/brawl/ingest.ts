import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { recordPlayerSightings, type PlayerSighting } from "./players";
import { optionalBattleText } from "./ingestPolicy";
import { trophyBucketFromTrophies } from "./stats";
import {
  createBrawlUpstreamIntake,
  normalizeBrawlTag as normalizedTag,
} from "./upstreamIntake";

type BattlePlayer = {
  tag?: string;
  name?: string;
  brawler?: { id?: number; name?: string; power?: number; trophies?: number };
};

type BattleLogItem = {
  battleTime?: string;
  event?: { id?: number; mode?: string; map?: unknown };
  battle?: {
    mode?: string;
    type?: string;
    result?: string;
    rank?: number;
    trophyChange?: number;
    starPlayer?: { tag?: string; brawler?: { id?: number } };
    teams?: BattlePlayer[][];
    players?: BattlePlayer[];
  };
};

const upstreamIntake = createBrawlUpstreamIntake();

function participants(battle: BattleLogItem["battle"]): Array<BattlePlayer & { teamIndex: number }> {
  if (!battle) return [];
  if (Array.isArray(battle.teams)) {
    return battle.teams.flatMap((team, teamIndex) =>
      (team || []).map((player) => ({ ...player, teamIndex })),
    );
  }
  if (Array.isArray(battle.players)) {
    return battle.players.map((player) => ({ ...player, teamIndex: 0 }));
  }
  return [];
}

function teamHash(ids: number[]) {
  return [...ids].sort((a, b) => a - b).join("-");
}

function battleTimestamp(value?: string): number | null {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  const timestamp = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function utcDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function personalResult(battle: BattleLogItem["battle"]): "victory" | "defeat" | "draw" | "unknown" {
  if (battle?.result === "victory" || battle?.result === "defeat" || battle?.result === "draw") return battle.result;
  if (battle?.rank === 1) return "victory";
  if (typeof battle?.rank === "number" && battle.rank > 1) return "defeat";
  return "unknown";
}

type StatDelta = {
  picks: number;
  wins: number;
  losses: number;
  starPlayer: number;
  firstBattleAt?: number;
  lastBattleAt?: number;
};

type TeamStatDelta = StatDelta & {
  brawlerIds: number[];
};

function newDelta(won: boolean | null, isStar: boolean, observedAt?: number): StatDelta {
  return {
    picks: 1,
    wins: won === true ? 1 : 0,
    losses: won === false ? 1 : 0,
    starPlayer: isStar ? 1 : 0,
    ...(observedAt !== undefined
      ? { firstBattleAt: observedAt, lastBattleAt: observedAt }
      : {}),
  };
}

function newTeamDelta(won: boolean | null, brawlerIds: number[]): TeamStatDelta {
  return {
    ...newDelta(won, false),
    brawlerIds: [...brawlerIds],
  };
}

function foldDelta<T extends StatDelta>(map: Map<string, T>, key: string, delta: T): void {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, delta);
    return;
  }
  existing.picks += delta.picks;
  existing.wins += delta.wins;
  existing.losses += delta.losses;
  existing.starPlayer += delta.starPlayer;
  if (delta.firstBattleAt !== undefined) {
    existing.firstBattleAt = Math.min(existing.firstBattleAt ?? delta.firstBattleAt, delta.firstBattleAt);
  }
  if (delta.lastBattleAt !== undefined) {
    existing.lastBattleAt = Math.max(existing.lastBattleAt ?? delta.lastBattleAt, delta.lastBattleAt);
  }
}

export const ingestBattleLogItems = internalMutation({
  args: {
    items: v.array(v.any()),
    focusTag: v.optional(v.string()),
  },
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, args): Promise<{ inserted: number }> => {
    let inserted = 0;
    const focus = normalizedTag(args.focusTag || null);
    const sightings: PlayerSighting[] = [];
    const brawlerDeltas = new Map<string, StatDelta>();
    const dailyBrawlerDeltas = new Map<string, StatDelta>();
    const teamDeltas = new Map<string, TeamStatDelta>();
    const matchupDeltas = new Map<string, StatDelta>();
    const dailyMatchupDeltas = new Map<string, StatDelta>();

    for (const raw of args.items as BattleLogItem[]) {
      if (focus) {
        const focusPlayer = participants(raw.battle).find((person) => normalizedTag(person.tag || null) === focus);
        const timestamp = battleTimestamp(raw.battleTime);
        if (focusPlayer && timestamp !== null && raw.battleTime) {
          const playerTag = focus.slice(1);
          const mode = String(raw.event?.mode || raw.battle?.mode || "unknown");
          const dedupeKey = `${raw.battleTime}|${mode}|${focusPlayer.brawler?.id ?? 0}`;
          const existingPlayerBattle = await ctx.db
            .query("playerBattles")
            .withIndex("by_player_and_dedupe", (q) => q.eq("playerTag", playerTag).eq("dedupeKey", dedupeKey))
            .unique();
          if (!existingPlayerBattle) {
            const mapId = Number(raw.event?.id);
            const rank = Number(raw.battle?.rank);
            const trophyChange = Number(raw.battle?.trophyChange);
            const brawlerId = Number(focusPlayer.brawler?.id);
            const brawlerPower = Number(focusPlayer.brawler?.power);
            const brawlerTrophies = Number(focusPlayer.brawler?.trophies);
            await ctx.db.insert("playerBattles", {
              playerTag,
              dedupeKey,
              battleTime: raw.battleTime,
              battleTimestamp: timestamp,
              ingestedAt: Date.now(),
              mapId: Number.isFinite(mapId) && mapId > 0 ? mapId : undefined,
              mapName: optionalBattleText(raw.event?.map),
              mode,
              battleType: raw.battle?.type,
              result: personalResult(raw.battle),
              rank: Number.isFinite(rank) && rank > 0 ? rank : undefined,
              trophyChange: Number.isFinite(trophyChange) ? trophyChange : undefined,
              brawlerId: Number.isFinite(brawlerId) && brawlerId > 0 ? brawlerId : undefined,
              brawlerName: focusPlayer.brawler?.name,
              brawlerPower: Number.isFinite(brawlerPower) && brawlerPower > 0 ? brawlerPower : undefined,
              brawlerTrophies: Number.isFinite(brawlerTrophies) ? brawlerTrophies : undefined,
              starPlayer: normalizedTag(raw.battle?.starPlayer?.tag || null) === focus,
            });
          }
        }
      }

      const mapId = Number(raw.event?.id);
      if (!Number.isFinite(mapId) || mapId <= 0) continue;

      const people = participants(raw.battle);
      const tags = people
        .map((p) => normalizedTag(p.tag || null))
        .filter((tag): tag is string => Boolean(tag))
        .sort();
      const battleTime = String(raw.battleTime || "");
      if (!battleTime || tags.length === 0) continue;
      const observedAt = battleTimestamp(battleTime);
      const trendDay = observedAt === null ? null : utcDayStart(observedAt);

      const dedupeKey = `${battleTime}|${tags.join(",")}`;
      const existing = await ctx.db
        .query("brawlSeenBattles")
        .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
        .unique();
      if (existing) continue;

      for (const person of people) {
        const tag = normalizedTag(person.tag || null);
        const name = person.name?.trim();
        if (tag && name) sightings.push({ tag, name });
      }

      const brawlerIds = people
        .map((p) => Number(p.brawler?.id))
        .filter((id) => Number.isFinite(id) && id > 0);

      const focusPlayer = focus ? people.find((p) => normalizedTag(p.tag || null) === focus) : people[0];
      const focusTrophies = Number(focusPlayer?.brawler?.trophies || 0);
      const bucket = trophyBucketFromTrophies(focusTrophies);
      const starBrawlerId = Number(raw.battle?.starPlayer?.brawler?.id) || undefined;
      const result = raw.battle?.result;
      const mode = String(raw.event?.mode || raw.battle?.mode || "unknown");

      await ctx.db.insert("brawlSeenBattles", {
        dedupeKey,
        mapId,
        mode,
        battleType: raw.battle?.type,
        result,
        trophyBucket: bucket,
        brawlerIds,
        starBrawlerId,
        battleTime,
        ingestedAt: Date.now(),
      });
      inserted += 1;

      const focusTeamIndex = focusPlayer?.teamIndex ?? 0;
      const focusResult = result === "victory" || result === "defeat" ? result : null;

      for (const person of people) {
        const brawlerId = Number(person.brawler?.id);
        if (!Number.isFinite(brawlerId) || brawlerId <= 0) continue;
        const personBucket = trophyBucketFromTrophies(Number(person.brawler?.trophies || 0));
        let won: boolean | null = null;
        if (focusResult && Array.isArray(raw.battle?.teams)) {
          const focusWon = focusResult === "victory";
          won = person.teamIndex === focusTeamIndex ? focusWon : !focusWon;
        } else if (focusResult && focus && normalizedTag(person.tag || null) === focus) {
          won = focusResult === "victory";
        }
        const isStar = starBrawlerId === brawlerId;

        for (const trophyBucket of ["all", personBucket] as const) {
          foldDelta(
            brawlerDeltas,
            `${mapId}|${brawlerId}|${trophyBucket}`,
            newDelta(won, isStar, trendDay !== null && observedAt !== null ? observedAt : undefined),
          );
          if (trendDay !== null && observedAt !== null) {
            foldDelta(
              dailyBrawlerDeltas,
              `${mapId}|${brawlerId}|${trophyBucket}|${trendDay}`,
              newDelta(won, isStar, observedAt),
            );
          }
        }
      }

      if (Array.isArray(raw.battle?.teams) && focusResult) {
        const focusWon = focusResult === "victory";
        for (const [teamIndex, team] of raw.battle.teams.entries()) {
          const ids = (team || [])
            .map((p) => Number(p.brawler?.id))
            .filter((id) => Number.isFinite(id) && id > 0)
            .sort((a, b) => a - b);
          if (ids.length < 2) continue;
          const hash = teamHash(ids);
          const teamWon = teamIndex === focusTeamIndex ? focusWon : !focusWon;
          const avgTrophies =
            (team || []).reduce((sum, p) => sum + Number(p.brawler?.trophies || 0), 0) / Math.max(1, team?.length || 1);
          const personBucket = trophyBucketFromTrophies(avgTrophies);
          for (const trophyBucket of ["all", personBucket] as const) {
            foldDelta(teamDeltas, `${mapId}|${trophyBucket}|${hash}`, newTeamDelta(teamWon, ids));
          }
        }
      }

      const focusOutcome = result === "victory" ? true : result === "defeat" ? false : result === "draw" ? null : undefined;
      if (Array.isArray(raw.battle?.teams) && raw.battle.teams.length >= 2 && focusOutcome !== undefined) {
        for (const [teamIndex, team] of raw.battle.teams.entries()) {
          const teamWon = focusOutcome === null ? null : teamIndex === focusTeamIndex ? focusOutcome : !focusOutcome;
          const opponents = raw.battle.teams
            .filter((_, opponentTeamIndex) => opponentTeamIndex !== teamIndex)
            .flatMap((opponentTeam) => opponentTeam || [])
            .map((opponent) => Number(opponent.brawler?.id))
            .filter((id) => Number.isFinite(id) && id > 0);
          if (!opponents.length) continue;
          for (const person of team || []) {
            const brawlerId = Number(person.brawler?.id);
            if (!Number.isFinite(brawlerId) || brawlerId <= 0) continue;
            const personBucket = trophyBucketFromTrophies(Number(person.brawler?.trophies || 0));
            for (const opponentBrawlerId of opponents) {
              for (const trophyBucket of ["all", personBucket] as const) {
                foldDelta(
                  matchupDeltas,
                  `${mapId}|${trophyBucket}|${brawlerId}|${opponentBrawlerId}`,
                  newDelta(teamWon, false),
                );
                if (trendDay !== null && observedAt !== null) {
                  foldDelta(
                    dailyMatchupDeltas,
                    `${mapId}|${trophyBucket}|${brawlerId}|${opponentBrawlerId}|${trendDay}`,
                    newDelta(teamWon, false, observedAt),
                  );
                }
              }
            }
          }
        }
      }
    }

    await flushMapBrawlerStats(ctx, brawlerDeltas);
    await flushDailyBrawlerStats(ctx, dailyBrawlerDeltas);
    await flushTeamStats(ctx, teamDeltas);
    await flushMatchupStats(ctx, matchupDeltas);
    await flushDailyMatchupStats(ctx, dailyMatchupDeltas);

    await recordPlayerSightings(ctx, sightings);

    return { inserted };
  },
});

/**
 * Applies folded per-key deltas with one read + one write per distinct key
 * instead of one round-trip per battle statistic, keeping ingest transactions
 * well inside Convex limits for full battle logs.
 */
async function flushMapBrawlerStats(ctx: MutationCtx, deltas: Map<string, StatDelta>): Promise<void> {
  for (const [key, delta] of deltas) {
    const [rawMapId, rawBrawlerId, trophyBucket] = key.split("|");
    const mapId = Number(rawMapId);
    const brawlerId = Number(rawBrawlerId);
    const existing = await ctx.db
      .query("mapBrawlerStats")
      .withIndex("by_map_brawler_bucket", (q) =>
        q.eq("mapId", mapId).eq("brawlerId", brawlerId).eq("trophyBucket", trophyBucket),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        picks: existing.picks + delta.picks,
        wins: existing.wins + delta.wins,
        losses: existing.losses + delta.losses,
        starPlayer: existing.starPlayer + delta.starPlayer,
      });
      continue;
    }
    await ctx.db.insert("mapBrawlerStats", {
      mapId,
      brawlerId,
      trophyBucket,
      picks: delta.picks,
      wins: delta.wins,
      losses: delta.losses,
      starPlayer: delta.starPlayer,
    });
  }
}

async function flushDailyBrawlerStats(ctx: MutationCtx, deltas: Map<string, StatDelta>): Promise<void> {
  for (const [key, delta] of deltas) {
    const [rawMapId, rawBrawlerId, trophyBucket, rawDay] = key.split("|");
    const mapId = Number(rawMapId);
    const brawlerId = Number(rawBrawlerId);
    const day = Number(rawDay);
    const existing = await ctx.db
      .query("dailyMapBrawlerStats")
      .withIndex("by_map_brawler_bucket_and_day", (q) =>
        q.eq("mapId", mapId).eq("brawlerId", brawlerId).eq("trophyBucket", trophyBucket).eq("day", day),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        picks: existing.picks + delta.picks,
        wins: existing.wins + delta.wins,
        losses: existing.losses + delta.losses,
        starPlayer: existing.starPlayer + delta.starPlayer,
        firstBattleAt: Math.min(existing.firstBattleAt, delta.firstBattleAt ?? existing.firstBattleAt),
        lastBattleAt: Math.max(existing.lastBattleAt, delta.lastBattleAt ?? existing.lastBattleAt),
      });
      continue;
    }
    await ctx.db.insert("dailyMapBrawlerStats", {
      day,
      mapId,
      brawlerId,
      trophyBucket,
      picks: delta.picks,
      wins: delta.wins,
      losses: delta.losses,
      starPlayer: delta.starPlayer,
      firstBattleAt: delta.firstBattleAt ?? 0,
      lastBattleAt: delta.lastBattleAt ?? 0,
    });
  }
}

async function flushTeamStats(ctx: MutationCtx, deltas: Map<string, TeamStatDelta>): Promise<void> {
  for (const [key, delta] of deltas) {
    const [rawMapId, trophyBucket, teamHash] = key.split("|");
    const mapId = Number(rawMapId);
    const existing = await ctx.db
      .query("mapTeamStats")
      .withIndex("by_map_bucket_hash", (q) =>
        q.eq("mapId", mapId).eq("trophyBucket", trophyBucket).eq("teamHash", teamHash),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        picks: existing.picks + delta.picks,
        wins: existing.wins + delta.wins,
        losses: existing.losses + delta.losses,
      });
      continue;
    }
    await ctx.db.insert("mapTeamStats", {
      mapId,
      teamHash,
      brawlerIds: delta.brawlerIds,
      trophyBucket,
      picks: delta.picks,
      wins: delta.wins,
      losses: delta.losses,
    });
  }
}

async function flushMatchupStats(ctx: MutationCtx, deltas: Map<string, StatDelta>): Promise<void> {
  for (const [key, delta] of deltas) {
    const [rawMapId, trophyBucket, rawBrawlerId, rawOpponentId] = key.split("|");
    const mapId = Number(rawMapId);
    const brawlerId = Number(rawBrawlerId);
    const opponentBrawlerId = Number(rawOpponentId);
    const existing = await ctx.db
      .query("mapBrawlerMatchups")
      .withIndex("by_map_bucket_brawler_opponent", (q) =>
        q
          .eq("mapId", mapId)
          .eq("trophyBucket", trophyBucket)
          .eq("brawlerId", brawlerId)
          .eq("opponentBrawlerId", opponentBrawlerId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        picks: existing.picks + delta.picks,
        wins: existing.wins + delta.wins,
        losses: existing.losses + delta.losses,
      });
      continue;
    }
    await ctx.db.insert("mapBrawlerMatchups", {
      mapId,
      trophyBucket,
      brawlerId,
      opponentBrawlerId,
      picks: delta.picks,
      wins: delta.wins,
      losses: delta.losses,
    });
  }
}

async function flushDailyMatchupStats(ctx: MutationCtx, deltas: Map<string, StatDelta>): Promise<void> {
  for (const [key, delta] of deltas) {
    const [rawMapId, trophyBucket, rawBrawlerId, rawOpponentId, rawDay] = key.split("|");
    const mapId = Number(rawMapId);
    const brawlerId = Number(rawBrawlerId);
    const opponentBrawlerId = Number(rawOpponentId);
    const day = Number(rawDay);
    const existing = await ctx.db
      .query("dailyBrawlerMatchups")
      .withIndex("by_map_bucket_brawler_opponent_and_day", (q) =>
        q
          .eq("mapId", mapId)
          .eq("trophyBucket", trophyBucket)
          .eq("brawlerId", brawlerId)
          .eq("opponentBrawlerId", opponentBrawlerId)
          .eq("day", day),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        picks: existing.picks + delta.picks,
        wins: existing.wins + delta.wins,
        losses: existing.losses + delta.losses,
        firstBattleAt: Math.min(existing.firstBattleAt, delta.firstBattleAt ?? existing.firstBattleAt),
        lastBattleAt: Math.max(existing.lastBattleAt, delta.lastBattleAt ?? existing.lastBattleAt),
      });
      continue;
    }
    await ctx.db.insert("dailyBrawlerMatchups", {
      day,
      mapId,
      trophyBucket,
      brawlerId,
      opponentBrawlerId,
      picks: delta.picks,
      wins: delta.wins,
      losses: delta.losses,
      firstBattleAt: delta.firstBattleAt ?? 0,
      lastBattleAt: delta.lastBattleAt ?? 0,
    });
  }
}

export const ingestFromPlayerTag = internalAction({
  args: { tag: v.string() },
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, args): Promise<{ inserted: number }> => {
    const tag = normalizedTag(args.tag);
    if (!tag) return { inserted: 0 };
    const result = await upstreamIntake.official.battleLog(tag);
    if (!result.ok) throw new Error(result.error.message);
    return await ctx.runMutation(internal.brawl.ingest.ingestBattleLogItems, {
      items: result.value.items,
      focusTag: tag,
    });
  },
});

export const seedFromRankings = internalAction({
  args: {},
  returns: v.object({ processed: v.number() }),
  handler: async (ctx): Promise<{ processed: number }> => {
    if (!upstreamIntake.official.isConfigured()) {
      console.log("Skipping meta seed: BRAWL_STARS_API_TOKEN not set");
      return { processed: 0 };
    }

    const cursor = await ctx.runQuery(internal.brawl.stats.getCursor, { key: "rankings-global-players" });
    const offset = cursor?.offset || 0;
    const batchSize = 5;

    const rankings = await upstreamIntake.official.rankings({
      country: "global",
      kind: "players",
      limit: 50,
    });
    if (!rankings.ok) throw new Error(rankings.error.message);
    const tags = rankings.value.tags;

    if (!tags.length) return { processed: 0 };

    const start = offset % tags.length;
    const slice = [...tags, ...tags].slice(start, start + batchSize);
    let processed = 0;

    for (const tag of slice) {
      try {
        await ctx.runAction(internal.brawl.ingest.ingestFromPlayerTag, { tag });
        processed += 1;
      } catch (error) {
        console.error("Failed to ingest battle log for", tag, error);
      }
    }

    await ctx.runMutation(internal.brawl.stats.setCursor, {
      key: "rankings-global-players",
      offset: (start + batchSize) % tags.length,
    });

    return { processed };
  },
});

export const ingestBattleLog = internalAction({
  args: {
    items: v.array(v.any()),
    focusTag: v.optional(v.string()),
  },
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, args): Promise<{ inserted: number }> => {
    return await ctx.runMutation(internal.brawl.ingest.ingestBattleLogItems, args);
  },
});
