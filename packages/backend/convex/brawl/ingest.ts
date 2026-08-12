import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalAction, internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { recordPlayerSightings, type PlayerSighting } from "./players";
import { trophyBucketFromTrophies } from "./stats";

declare const process: { env: Record<string, string | undefined> };

type BattlePlayer = {
  tag?: string;
  name?: string;
  brawler?: { id?: number; name?: string; power?: number; trophies?: number };
};

type BattleLogItem = {
  battleTime?: string;
  event?: { id?: number; mode?: string; map?: string };
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

function normalizedTag(value?: string | null) {
  if (!value) return null;
  const tag = value.trim().toUpperCase().replace(/^#/, "");
  return /^[0289PYLQGRJCUV]{3,15}$/.test(tag) ? `#${tag}` : null;
}

function apiToken(): string | null {
  return process.env.BRAWL_STARS_API_TOKEN?.trim() || null;
}

function apiBaseUrl(): string {
  return (process.env.BRAWL_STARS_API_BASE_URL || "https://api.brawlstars.com/v1").replace(/\/$/, "");
}

async function fetchUpstream(path: string): Promise<unknown> {
  const token = apiToken();
  if (!token) throw new Error("API_NOT_CONFIGURED");
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Upstream ${response.status}`);
  }
  return await response.json();
}

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

function personalResult(battle: BattleLogItem["battle"]): "victory" | "defeat" | "draw" | "unknown" {
  if (battle?.result === "victory" || battle?.result === "defeat" || battle?.result === "draw") return battle.result;
  if (battle?.rank === 1) return "victory";
  if (typeof battle?.rank === "number" && battle.rank > 1) return "defeat";
  return "unknown";
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

    for (const raw of args.items as BattleLogItem[]) {
      for (const person of participants(raw.battle)) {
        const tag = normalizedTag(person.tag || null);
        const name = person.name?.trim();
        if (tag && name) sightings.push({ tag, name });
      }
    }
    await recordPlayerSightings(ctx, sightings);

    if (focus) {
      await ensureLookupTarget(ctx, focus.slice(1));
    }

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
              mapName: raw.event?.map,
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

      const dedupeKey = `${battleTime}|${tags.join(",")}`;
      const existing = await ctx.db
        .query("brawlSeenBattles")
        .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
        .unique();
      if (existing) continue;

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
          await bumpBrawlerStat(ctx, {
            mapId,
            brawlerId,
            trophyBucket,
            won,
            isStar,
          });
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
            await bumpTeamStat(ctx, {
              mapId,
              teamHash: hash,
              brawlerIds: ids,
              trophyBucket,
              won: teamWon,
            });
          }
        }
      }
    }

    return { inserted };
  },
});

async function bumpBrawlerStat(
  ctx: MutationCtx,
  args: {
    mapId: number;
    brawlerId: number;
    trophyBucket: string;
    won: boolean | null;
    isStar: boolean;
  },
) {
  const existing = await ctx.db
    .query("mapBrawlerStats")
    .withIndex("by_map_brawler_bucket", (q) =>
      q.eq("mapId", args.mapId).eq("brawlerId", args.brawlerId).eq("trophyBucket", args.trophyBucket),
    )
    .unique();

  const patch = {
    picks: (existing?.picks || 0) + 1,
    wins: (existing?.wins || 0) + (args.won === true ? 1 : 0),
    losses: (existing?.losses || 0) + (args.won === false ? 1 : 0),
    starPlayer: (existing?.starPlayer || 0) + (args.isStar ? 1 : 0),
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return;
  }

  await ctx.db.insert("mapBrawlerStats", {
    mapId: args.mapId,
    brawlerId: args.brawlerId,
    trophyBucket: args.trophyBucket,
    ...patch,
  });
}

async function bumpTeamStat(
  ctx: MutationCtx,
  args: {
    mapId: number;
    teamHash: string;
    brawlerIds: number[];
    trophyBucket: string;
    won: boolean | null;
  },
) {
  const existing = await ctx.db
    .query("mapTeamStats")
    .withIndex("by_map_bucket_hash", (q) =>
      q.eq("mapId", args.mapId).eq("trophyBucket", args.trophyBucket).eq("teamHash", args.teamHash),
    )
    .unique();

  const patch = {
    picks: (existing?.picks || 0) + 1,
    wins: (existing?.wins || 0) + (args.won === true ? 1 : 0),
    losses: (existing?.losses || 0) + (args.won === false ? 1 : 0),
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return;
  }

  await ctx.db.insert("mapTeamStats", {
    mapId: args.mapId,
    teamHash: args.teamHash,
    brawlerIds: args.brawlerIds,
    trophyBucket: args.trophyBucket,
    ...patch,
  });
}

async function ensureLookupTarget(ctx: MutationCtx, tag: string): Promise<void> {
  const existing = await ctx.db
    .query("brawlCrawlTargets")
    .withIndex("by_tag", (q) => q.eq("tag", tag))
    .unique();
  if (existing) return;

  await ctx.db.insert("brawlCrawlTargets", {
    tag,
    source: "lookup",
    priority: 500,
    nextDueAt: Date.now() + 30 * 60 * 1_000,
    consecutiveFailures: 0,
    disabled: false,
  });
}

export const ingestFromPlayerTag = internalAction({
  args: { tag: v.string() },
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, args): Promise<{ inserted: number }> => {
    const tag = normalizedTag(args.tag);
    if (!tag) return { inserted: 0 };
    const payload = (await fetchUpstream(`/players/${encodeURIComponent(tag)}/battlelog`)) as {
      items?: BattleLogItem[];
    };
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return await ctx.runMutation(internal.brawl.ingest.ingestBattleLogItems, {
      items,
      focusTag: tag,
    });
  },
});

export const seedFromRankings = internalAction({
  args: {},
  returns: v.object({ processed: v.number() }),
  handler: async (ctx): Promise<{ processed: number }> => {
    if (!apiToken()) {
      console.log("Skipping meta seed: BRAWL_STARS_API_TOKEN not set");
      return { processed: 0 };
    }

    const cursor = await ctx.runQuery(internal.brawl.stats.getCursor, { key: "rankings-global-players" });
    const offset = cursor?.offset || 0;
    const batchSize = 5;

    const rankings = (await fetchUpstream(`/rankings/global/players?limit=50`)) as {
      items?: Array<{ tag?: string }>;
    };
    const tags = (rankings.items || [])
      .map((item) => normalizedTag(item.tag || null))
      .filter((tag): tag is string => Boolean(tag));

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

export const ingestBattleLog = action({
  args: {
    items: v.array(v.any()),
    focusTag: v.optional(v.string()),
  },
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, args): Promise<{ inserted: number }> => {
    return await ctx.runMutation(internal.brawl.ingest.ingestBattleLogItems, args);
  },
});
