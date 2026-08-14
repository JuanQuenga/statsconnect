import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { boundedInteger, envEnabled } from "./controls";

declare const process: { env: Record<string, string | undefined> };

type JsonRecord = Record<string, unknown>;
type CrawlTargetInput = {
  tag: string;
  source: "ranking" | "club" | "lookup" | "manual";
  priority: number;
};
type PlayerSighting = {
  tag: string;
  name: string;
  clubTag?: string;
  clubName?: string;
  trophies?: number;
  iconId?: number;
};
type ProfileSnapshot = {
  tag: string;
  name: string;
  trophies: number;
  highestTrophies: number;
  expLevel: number;
  victory3v3: number;
  soloVictories: number;
  duoVictories: number;
  clubTag?: string;
  clubName?: string;
  iconId?: number;
  brawlerCount: number;
  power11Count: number;
  rankedCurrent?: number;
  rankedCurrentName?: string;
  rankedSeasonBest?: number;
  rankedSeasonBestName?: string;
  rankedBest?: number;
  rankedBestName?: string;
  brawlers?: OwnedBrawler[];
};
type Equipment = { id: number; name: string };
type OwnedBrawler = {
  id: number;
  name: string;
  power: number;
  rank: number;
  trophies: number;
  highestTrophies: number;
  gadgets: Equipment[];
  starPowers: Equipment[];
  gears: Equipment[];
  hypercharges: Equipment[];
};
type ClubSnapshot = {
  tag: string;
  name: string;
  description?: string;
  type?: string;
  badgeId?: number;
  requiredTrophies?: number;
  trophies: number;
  members: Array<{
    tag: string;
    name: string;
    role?: string;
    trophies: number;
    iconId?: number;
  }>;
};
type FetchTelemetry = { endpoint: string; status: number };

class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function integerEnv(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 1), maximum) : fallback;
}

function cleanTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().toUpperCase().replace(/^#/, "");
  return /^[0289PYLQGRJCUV]{3,15}$/.test(tag) ? tag : null;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : null;
}

function itemsFrom(value: unknown): unknown[] {
  const record = asRecord(value);
  return record && Array.isArray(record.items) ? record.items : [];
}

function tagsFromItems(value: unknown): string[] {
  const tags = itemsFrom(value)
    .map((item) => cleanTag(asRecord(item)?.tag))
    .filter((tag): tag is string => tag !== null);
  return [...new Set(tags)];
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  return values.map(finiteNumber).find((value) => value !== undefined);
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function equipment(value: unknown): Equipment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    const id = finiteNumber(record?.id);
    const name = firstString(record?.name);
    return id !== undefined && name ? [{ id, name }] : [];
  });
}

function ownedBrawler(value: unknown): OwnedBrawler | null {
  const record = asRecord(value);
  const id = finiteNumber(record?.id);
  const name = firstString(record?.name);
  if (id === undefined || !name) return null;
  return {
    id,
    name,
    power: finiteNumber(record?.power) ?? 0,
    rank: finiteNumber(record?.rank) ?? 0,
    trophies: finiteNumber(record?.trophies) ?? 0,
    highestTrophies: finiteNumber(record?.highestTrophies) ?? 0,
    gadgets: equipment(record?.gadgets),
    starPowers: equipment(record?.starPowers),
    gears: equipment(record?.gears),
    hypercharges: equipment(record?.hypercharges ?? record?.hypercharge ?? record?.buffies),
  };
}

function playerSighting(value: unknown, club?: { tag?: string; name?: string }): PlayerSighting | null {
  const record = asRecord(value);
  const tag = cleanTag(record?.tag);
  const name = typeof record?.name === "string" ? record.name.trim() : "";
  if (!tag || !name) return null;
  const nestedClub = asRecord(record?.club);
  const icon = asRecord(record?.icon);
  return {
    tag,
    name,
    clubTag: cleanTag(nestedClub?.tag) ?? club?.tag,
    clubName: typeof nestedClub?.name === "string" ? nestedClub.name : club?.name,
    trophies: finiteNumber(record?.trophies),
    iconId: finiteNumber(icon?.id),
  };
}

function profileSnapshot(value: unknown): ProfileSnapshot | null {
  const record = asRecord(value);
  const sighting = playerSighting(value);
  if (!record || !sighting) return null;
  const brawlers = Array.isArray(record.brawlers) ? record.brawlers : [];
  const ranked = asRecord(record.ranked);
  const rankedSeason = asRecord(record.rankedSeason ?? record.currentRankedSeason);
  const normalizedBrawlers = brawlers.map(ownedBrawler).filter((brawler): brawler is OwnedBrawler => brawler !== null);
  return {
    ...sighting,
    trophies: finiteNumber(record.trophies) ?? 0,
    highestTrophies: finiteNumber(record.highestTrophies) ?? 0,
    expLevel: finiteNumber(record.expLevel) ?? 0,
    victory3v3: finiteNumber(record["3vs3Victories"]) ?? 0,
    soloVictories: finiteNumber(record.soloVictories) ?? 0,
    duoVictories: finiteNumber(record.duoVictories) ?? 0,
    brawlerCount: brawlers.length,
    power11Count: brawlers.filter((brawler) => finiteNumber(asRecord(brawler)?.power) === 11).length,
    rankedCurrent: firstNumber(ranked?.currentRank, ranked?.current, record.rankedCurrent),
    rankedCurrentName: firstString(ranked?.currentRankName, ranked?.currentName, record.rankedCurrentName),
    rankedSeasonBest: firstNumber(ranked?.seasonBestRank, rankedSeason?.bestRank, record.rankedSeasonBest),
    rankedSeasonBestName: firstString(ranked?.seasonBestRankName, rankedSeason?.bestRankName, record.rankedSeasonBestName),
    rankedBest: firstNumber(ranked?.bestRank, ranked?.highestRank, record.rankedBest),
    rankedBestName: firstString(ranked?.bestRankName, ranked?.highestRankName, record.rankedBestName),
    brawlers: normalizedBrawlers,
  };
}

function clubSnapshot(value: unknown): ClubSnapshot | null {
  const club = asRecord(value);
  const tag = cleanTag(club?.tag);
  const name = typeof club?.name === "string" ? club.name.trim() : "";
  if (!club || !tag || !name) return null;
  const badge = asRecord(club.badge);
  const members = (Array.isArray(club.members) ? club.members : []).flatMap((value) => {
    const member = asRecord(value);
    const memberTag = cleanTag(member?.tag);
    const memberName = typeof member?.name === "string" ? member.name.trim() : "";
    const icon = asRecord(member?.icon);
    if (!memberTag || !memberName) return [];
    return [{
      tag: memberTag,
      name: memberName,
      role: typeof member?.role === "string" ? member.role : undefined,
      trophies: finiteNumber(member?.trophies) ?? 0,
      iconId: finiteNumber(icon?.id),
    }];
  });
  return {
    tag,
    name,
    description: typeof club.description === "string" ? club.description : undefined,
    type: typeof club.type === "string" ? club.type : undefined,
    badgeId: finiteNumber(club.badgeId) ?? finiteNumber(badge?.id),
    requiredTrophies: finiteNumber(club.requiredTrophies),
    trophies: finiteNumber(club.trophies) ?? 0,
    members,
  };
}

function latestBattleTime(items: unknown[]): string | undefined {
  return items.reduce<string | undefined>((latest, item) => {
    const battleTime = asRecord(item)?.battleTime;
    if (typeof battleTime !== "string") return latest;
    return !latest || battleTime > latest ? battleTime : latest;
  }, undefined);
}

async function fetchJson(
  _ctx: ActionCtx,
  path: string,
  endpoint: string,
  telemetry: FetchTelemetry[],
): Promise<unknown> {
  const token = process.env.BRAWL_STARS_API_TOKEN?.trim();
  if (!token) {
    telemetry.push({ endpoint, status: 0 });
    throw new UpstreamError("BRAWL_STARS_API_TOKEN is not configured", 0);
  }

  const baseUrl = (process.env.BRAWL_STARS_API_BASE_URL || "https://api.brawlstars.com/v1").replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    telemetry.push({ endpoint, status: 0 });
    throw error;
  }
  telemetry.push({ endpoint, status: response.status });

  if (!response.ok) {
    throw new UpstreamError(`Brawl Stars API returned ${response.status}`, response.status);
  }
  return await response.json();
}

async function recordTelemetry(ctx: ActionCtx, fetches: FetchTelemetry[]): Promise<void> {
  if (!fetches.length) return;
  await ctx.runMutation(internal.brawl.pipeline.recordFetchBatch, { scope: "crawl", fetches });
  fetches.length = 0;
}

export const discover = internalAction({
  args: {},
  returns: v.object({ discovered: v.number(), added: v.number(), failures: v.number() }),
  handler: async (ctx) => {
    if (!envEnabled(process.env.BRAWL_CRAWLER_ENABLED)) {
      return { discovered: 0, added: 0, failures: 0 };
    }
    const clubLimit = integerEnv("BRAWL_CLUB_SEED", 10, 50);
    const budgetLimit = boundedInteger(process.env.BRAWL_CRAWL_MAX_CALLS_PER_HOUR, 500, 0, 10_000);
    const budget = await ctx.runMutation(internal.brawl.pipeline.reserveBudget, {
      scope: "crawl",
      requested: 2 + clubLimit,
      limit: budgetLimit,
    });
    if (budget.granted < 1) return { discovered: 0, added: 0, failures: 0 };

    const runId = await ctx.runMutation(internal.brawl.pipeline.startRun, { job: "discover" });
    const telemetry: FetchTelemetry[] = [];
    let discovered = 0;
    let added = 0;
    let failures = 0;

    try {
      const rankingLimit = integerEnv("BRAWL_DISCOVER_LIMIT", 200, 200);
      let callsRemaining = budget.granted;
      const playerRankings = await fetchJson(
        ctx,
        `/rankings/global/players?limit=${rankingLimit}`,
        "rankings/players",
        telemetry,
      );
      callsRemaining -= 1;
      let clubRankings: unknown = { items: [] };
      if (callsRemaining > 0) {
        try {
          clubRankings = await fetchJson(
            ctx,
            `/rankings/global/clubs?limit=${clubLimit}`,
            "rankings/clubs",
            telemetry,
          );
          callsRemaining -= 1;
        } catch (error) {
          failures += 1;
          callsRemaining -= 1;
          console.error("Failed to discover club rankings", error);
        }
      }

      const targets: CrawlTargetInput[] = tagsFromItems(playerRankings).map((tag, index) => ({
        tag,
        source: "ranking",
        priority: index,
      }));
      const sightings = itemsFrom(playerRankings)
        .map((item) => playerSighting(item))
        .filter((item): item is PlayerSighting => item !== null);

      for (const clubTag of tagsFromItems(clubRankings)) {
        if (callsRemaining <= 0) break;
        try {
          const clubPayload = await fetchJson(
            ctx,
            `/clubs/${encodeURIComponent(`#${clubTag}`)}`,
            "clubs/detail",
            telemetry,
          );
          callsRemaining -= 1;
          const club = asRecord(clubPayload);
          const trackedClub = clubSnapshot(clubPayload);
          if (trackedClub) {
            await ctx.runMutation(internal.brawl.clubs.recordClub, { club: trackedClub });
          }
          const members = club && Array.isArray(club.members) ? club.members : [];
          const clubName = typeof club?.name === "string" ? club.name : undefined;
          for (const member of members) {
            const tag = cleanTag(asRecord(member)?.tag);
            if (tag) targets.push({ tag, source: "club", priority: 1_000 + targets.length });
            const sighting = playerSighting(member, { tag: clubTag, name: clubName });
            if (sighting) sightings.push(sighting);
          }
        } catch (error) {
          callsRemaining -= 1;
          failures += 1;
          console.error("Failed to discover club members", clubTag, error);
        }
      }

      const byTag = new Map<string, CrawlTargetInput>();
      for (const target of targets) {
        const existing = byTag.get(target.tag);
        if (!existing || target.priority < existing.priority) byTag.set(target.tag, target);
      }
      const unique = [...byTag.values()];
      discovered = unique.length;
      const result = await ctx.runMutation(internal.brawl.pipeline.upsertTargets, { targets: unique });
      let directoryRecorded = 0;
      for (let index = 0; index < sightings.length; index += 100) {
        const directory = await ctx.runMutation(internal.brawl.players.recordSightings, {
          players: sightings.slice(index, index + 100),
        });
        directoryRecorded += directory.recorded;
      }
      added = result.added;
      await ctx.runMutation(internal.brawl.pipeline.bumpCounters, {
        counters: [
          { name: "targets_discovered", amount: discovered },
          { name: "targets_added", amount: added },
          { name: "directory_sightings", amount: directoryRecorded },
          { name: "api_failures", amount: failures },
        ],
      });
      await recordTelemetry(ctx, telemetry);
      await ctx.runMutation(internal.brawl.pipeline.finishRun, {
        id: runId,
        ok: true,
        discovered,
        failures,
      });
      return { discovered, added, failures };
    } catch (error) {
      const note = error instanceof Error ? error.message : "Discovery failed";
      await recordTelemetry(ctx, telemetry);
      await ctx.runMutation(internal.brawl.pipeline.finishRun, {
        id: runId,
        ok: false,
        note,
        discovered,
        failures: failures + 1,
      });
      throw error;
    }
  },
});

export const crawl = internalAction({
  args: {},
  returns: v.object({ fetched: v.number(), battles: v.number(), failures: v.number() }),
  handler: async (ctx) => {
    if (!envEnabled(process.env.BRAWL_CRAWLER_ENABLED)) {
      return { fetched: 0, battles: 0, failures: 0 };
    }
    const batchSize = integerEnv("BRAWL_CRAWL_BATCH", 8, 25);
    const revisitMinutes = integerEnv("BRAWL_CRAWL_REVISIT_MINUTES", 30, 24 * 60);
    const revisitMs = revisitMinutes * 60 * 1_000;
    const profileRevisitHours = integerEnv("BRAWL_PROFILE_REVISIT_HOURS", 12, 7 * 24);
    const budgetLimit = boundedInteger(process.env.BRAWL_CRAWL_MAX_CALLS_PER_HOUR, 500, 0, 10_000);
    const claim = await ctx.runMutation(internal.brawl.pipeline.claimTargets, {
      limit: batchSize,
      leaseMs: 5 * 60 * 1_000,
      profileRevisitMs: profileRevisitHours * 60 * 60 * 1_000,
      budgetLimit,
    });
    if (!claim.targets.length) return { fetched: 0, battles: 0, failures: 0 };

    const runId = await ctx.runMutation(internal.brawl.pipeline.startRun, { job: "crawl" });
    const telemetry: FetchTelemetry[] = [];
    let fetched = 0;
    let battles = 0;
    let failures = 0;

    try {
      for (const target of claim.targets) {
        let profileAttempted = false;
        let profileOk = false;
        try {
          const encodedTag = encodeURIComponent(`#${target.tag}`);
          const payload = await fetchJson(
            ctx,
            `/players/${encodedTag}/battlelog`,
            "players/battlelog",
            telemetry,
          );
          if (target.fetchProfile) {
            profileAttempted = true;
            try {
              const profilePayload = await fetchJson(
                ctx,
                `/players/${encodedTag}`,
                "players/detail",
                telemetry,
              );
              const profile = profileSnapshot(profilePayload);
              if (profile) {
                profileOk = true;
                const snapshot = await ctx.runMutation(internal.brawl.players.recordProfile, profile);
                if (snapshot.createdSnapshot) {
                  await ctx.runMutation(internal.brawl.pipeline.bumpCounters, {
                    counters: [{ name: "profile_snapshots", amount: 1 }],
                  });
                }
              }
            } catch (error) {
              failures += 1;
              console.error("Failed to refresh player profile", target.tag, error);
            }
          }
          const allItems = itemsFrom(payload);
          const since = target.lastBattleTime;
          const newItems = since
            ? allItems.filter((item) => {
                const time = asRecord(item)?.battleTime;
                return typeof time === "string" && time > since;
              })
            : allItems;
          const result = await ctx.runMutation(internal.brawl.ingest.ingestBattleLogItems, {
            items: newItems,
            focusTag: target.tag,
          });
          fetched += 1;
          battles += result.inserted;
          await ctx.runMutation(internal.brawl.pipeline.completeTarget, {
            id: target.id,
            ok: true,
            lastBattleTime: latestBattleTime(allItems),
            baseRevisitMs: revisitMs,
            battlesInserted: result.inserted,
            profileAttempted,
            profileOk,
          });
        } catch (error) {
          failures += 1;
          await ctx.runMutation(internal.brawl.pipeline.completeTarget, {
            id: target.id,
            ok: false,
            baseRevisitMs: revisitMs,
            battlesInserted: 0,
            profileAttempted,
            profileOk,
          });
          console.error("Failed to crawl player", target.tag, error);
        }
      }

      await ctx.runMutation(internal.brawl.pipeline.bumpCounters, {
        counters: [
          { name: "player_logs_fetched", amount: fetched },
          { name: "battles_ingested", amount: battles },
          { name: "api_failures", amount: failures },
        ],
      });
      await recordTelemetry(ctx, telemetry);
      await ctx.runMutation(internal.brawl.pipeline.finishRun, {
        id: runId,
        ok: true,
        fetched,
        battles,
        failures,
      });
      return { fetched, battles, failures };
    } catch (error) {
      const note = error instanceof Error ? error.message : "Crawl failed";
      await recordTelemetry(ctx, telemetry);
      await ctx.runMutation(internal.brawl.pipeline.finishRun, {
        id: runId,
        ok: false,
        note,
        fetched,
        battles,
        failures: failures + 1,
      });
      throw error;
    }
  },
});

export const prune = internalAction({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const runId = await ctx.runMutation(internal.brawl.pipeline.startRun, { job: "prune" });
    const now = Date.now();
    let deleted = 0;

    try {
      for (let batch = 0; batch < 20; batch += 1) {
        const result = await ctx.runMutation(internal.brawl.pipeline.pruneBatch, {
          battleCutoff: now - 30 * 24 * 60 * 60 * 1_000,
          telemetryCutoff: now - 7 * 24 * 60 * 60 * 1_000,
          snapshotCutoff: now - 365 * 24 * 60 * 60 * 1_000,
          limit: 256,
        });
        deleted += result.deleted;
        if (!result.more) break;
      }
      await ctx.runMutation(internal.brawl.pipeline.finishRun, {
        id: runId,
        ok: true,
        note: `Deleted ${deleted} expired rows`,
      });
      return { deleted };
    } catch (error) {
      const note = error instanceof Error ? error.message : "Prune failed";
      await ctx.runMutation(internal.brawl.pipeline.finishRun, { id: runId, ok: false, note });
      throw error;
    }
  },
});

export const probeEgressIp = internalAction({
  args: { dualStack: v.optional(v.boolean()) },
  returns: v.string(),
  handler: async (_ctx, args) => {
    const host = args.dualStack ? "api6.ipify.org" : "api.ipify.org";
    const response = await fetch(`https://${host}?format=json`);
    if (!response.ok) throw new Error(`Egress probe returned ${response.status}`);
    const payload = asRecord(await response.json());
    if (typeof payload?.ip !== "string") throw new Error("Egress probe returned no IP address");
    return payload.ip;
  },
});

export const probeEgressIps = internalAction({
  args: {},
  returns: v.array(v.string()),
  handler: async () => {
    const urls = [
      "https://api.ipify.org",
      "https://checkip.amazonaws.com",
      "https://icanhazip.com",
      "https://ifconfig.me/ip",
      "https://ipinfo.io/ip",
    ];
    const responses = await Promise.all(urls.map((url) => fetch(url)));
    const addresses = await Promise.all(
      responses.map(async (response) => {
        if (!response.ok) throw new Error(`Egress probe returned ${response.status}`);
        return (await response.text()).trim();
      }),
    );
    return [...new Set(addresses)];
  },
});
