import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { clashRequest, type ClashFetchObservation } from "./clashFetch";
import { battleObservations, type DeckObservation } from "./lib/battles";
import type {
  ApiBattle,
  ApiClan,
  ApiClanRanking,
  ApiLeaderboard,
  ApiPaged,
  ApiPlayerRanking
} from "./lib/types";

declare const process: { env: Record<string, string | undefined> };

/**
 * Fetching half of the battle-log pipeline. The official API exposes battles
 * only per player, so deck statistics are built by polling a rotating set of
 * player tags and folding what comes back into daily aggregates.
 *
 * Runs in the default Convex runtime — `fetch` is available there and none of
 * this needs Node built-ins.
 */

/** "International" in /locations. 57000000 is Europe, despite reading like a global id. */
const GLOBAL_LOCATION_ID = 57000006;
/** How long a claimed target stays off the queue while its fetch is in flight. */
const LEASE_MS = 5 * 60 * 1000;
/** Battle logs hold 25 battles, so polling faster than this mostly re-reads old rows. */
const REVISIT_SECONDS = 45 * 60;
const DAY_MS = 86_400_000;

function envNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function crawlerEnabled() {
  return !["0", "false", "off"].includes((process.env.CLASH_CRAWLER_ENABLED ?? "true").toLowerCase());
}

async function flushFetches(ctx: ActionCtx, fetches: ClashFetchObservation[]) {
  if (!fetches.length) return;
  await ctx.runMutation(internal.clash.cache.recordFetches, { fetches });
}

async function reserveBudget(
  ctx: ActionCtx,
  job: "discover" | "crawl",
  requested: number,
  dailyLimit: number
) {
  return ctx.runMutation(internal.clash.meta.reserveRequestBudget, { job, requested, dailyLimit });
}

type RunResult = { note?: string; counters?: Record<string, number> };
const runResult = v.object({
  note: v.optional(v.string()),
  counters: v.optional(v.record(v.string(), v.number()))
});

type Sighting = { tag: string; name: string; clanTag?: string; clanName?: string; trophies?: number };
type CrawlPlayerSnapshot = {
  player: {
    tag: string;
    name: string;
    trophies?: number;
    clanTag?: string;
    clanName?: string;
    currentDeck?: Array<{ id: number; level?: number; evolutionLevel?: number }>;
  };
  observedAt: number;
};

/**
 * Feeds the name → tag directory with whatever this job happened to see.
 *
 * Chunked because a single discovery pass can surface a thousand players and a
 * mutation is one transaction. Failures are swallowed: the directory is a
 * convenience built on the side of the pipeline, and it must never be the
 * reason a crawl or discovery run is recorded as failed.
 */
async function recordSightings(ctx: ActionCtx, sightings: Sighting[]) {
  const named = sightings.filter((item) => item.tag && item.name);
  for (let index = 0; index < named.length; index += 250) {
    try {
      await ctx.runMutation(internal.clash.players.record, { players: named.slice(index, index + 250) });
    } catch {
      return;
    }
  }
}

/** Wraps a job so every execution shows up on the beta page, success or not. */
async function run(ctx: ActionCtx, job: string, body: () => Promise<RunResult>): Promise<RunResult> {
  const id = await ctx.runMutation(internal.clash.meta.startRun, { job });
  try {
    const result = await body();
    await ctx.runMutation(internal.clash.meta.finishRun, {
      id,
      ok: true,
      note: result.note,
      counters: result.counters
    });
    return result;
  } catch (error) {
    await ctx.runMutation(internal.clash.meta.finishRun, {
      id,
      ok: false,
      note: error instanceof Error ? error.message : "Unknown failure"
    });
    throw error;
  }
}

// --- Discovery ------------------------------------------------------------

/**
 * Refills the crawl queue.
 *
 * Supercell retired the trophy-road player leaderboard — every
 * `/locations/{id}/rankings/players` variant now answers 404 or an empty list —
 * so the event boards behind `/leaderboards` are the only live player ranking.
 * They are a few hundred players deep and skew to the very top, so the rosters
 * of the top clans fill out the rest of the queue. Clan rankings still work,
 * and a clan roster is the largest batch of active tags the API will hand over
 * in one request.
 *
 * Rank becomes crawl priority, so the most relevant players are polled first.
 */
export const discover = internalAction({
  args: { limit: v.optional(v.number()) },
  returns: runResult,
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? envNumber("CLASH_DISCOVER_LIMIT", 200), 1000);
    const clanCount = Math.min(envNumber("CLASH_CLAN_SEED", 20), 100);

    return run(ctx, "discover", async (): Promise<RunResult> => {
      if (!crawlerEnabled()) return { note: "Crawler disabled by CLASH_CRAWLER_ENABLED.", counters: { disabled: 1 } };
      const perRunLimit = Math.min(envNumber("CLASH_DISCOVER_REQUEST_BUDGET_PER_RUN", 12), 100);
      const budget = await reserveBudget(
        ctx,
        "discover",
        perRunLimit,
        envNumber("CLASH_DISCOVER_DAILY_REQUEST_BUDGET", 60)
      );
      if (!budget.granted) {
        return { note: `Daily discovery budget exhausted (${budget.used}/${budget.limit}).`, counters: { budgetDenied: 1 } };
      }

      const fetches: ClashFetchObservation[] = [];
      const targets: Array<{
        tag: string;
        source: "leaderboard" | "clan";
        tier: "fixed" | "featured" | "community";
        priority: number;
        revisitSeconds: number;
        expiresAt: number;
      }> = [];
      const sightings: Sighting[] = [];
      const now = Date.now();
      let requestsRemaining = budget.granted;

      try {
        const boards = await clashRequest<ApiPaged<ApiLeaderboard>>("/leaderboards", fetches);
        requestsRemaining -= 1;
        // Many boards come back with a null name, and ids climb with each new
        // instance of an event, so the highest named id is the live one.
        const activeBoard = boards.ok
          ? (boards.data.items ?? []).filter((board) => board.name).sort((a, b) => b.id - a.id)[0]
          : undefined;

        if (activeBoard && requestsRemaining > 0) {
          const top = await clashRequest<ApiPaged<ApiPlayerRanking>>(
            `/leaderboard/${activeBoard.id}?limit=${limit}`,
            fetches
          );
          requestsRemaining -= 1;
          if (top.ok) {
            const observedAt = Date.now();
            await ctx.runMutation(internal.clash.history.recordLeaderboardSnapshot, {
              board: {
                key: `event:${activeBoard.id}`,
                kind: "event",
                name: activeBoard.name ?? `Leaderboard #${activeBoard.id}`,
                boardId: activeBoard.id
              },
              entries: (top.data.items ?? []).slice(0, 200).map((player, index) => ({
                rank: player.rank ?? index + 1,
                tag: player.tag.replace(/^#/, "").toUpperCase(),
                name: player.name,
                ...(player.score !== undefined && player.score !== 2147483647 ? { score: player.score } : {}),
                ...(player.trophies !== undefined ? { trophies: player.trophies } : {}),
                ...(player.clan?.tag ? { clanTag: player.clan.tag.replace(/^#/, "") } : {}),
                ...(player.clan?.name ? { clanName: player.clan.name } : {})
              })),
              observedAt
            });
            const fixedSampleSize = Math.min(envNumber("CLASH_FIXED_SAMPLE_SIZE", 50), 200);
            for (const [index, player] of (top.data.items ?? []).entries()) {
              if (!player.tag) continue;
              const tag = player.tag.replace(/^#/, "");
              const fixed = index < fixedSampleSize;
              targets.push({
                tag,
                source: "leaderboard",
                tier: fixed ? "fixed" : "featured",
                priority: index,
                revisitSeconds: fixed ? REVISIT_SECONDS : 90 * 60,
                expiresAt: now + (fixed ? 30 : 7) * DAY_MS
              });
              if (player.name) {
                sightings.push({
                  tag,
                  name: player.name,
                  clanTag: player.clan?.tag,
                  clanName: player.clan?.name,
                  trophies: player.trophies
                });
              }
            }
          }
        }

        if (requestsRemaining > 0) {
          const clans = await clashRequest<ApiPaged<ApiClanRanking>>(
            `/locations/${GLOBAL_LOCATION_ID}/rankings/clans?limit=${clanCount}`,
            fetches
          );
          requestsRemaining -= 1;
          if (clans.ok) {
            let priority = limit;
            for (const clan of clans.data.items ?? []) {
              if (!clan.tag || requestsRemaining <= 0) break;
              const roster = await clashRequest<ApiClan>(`/clans/%23${clan.tag.replace(/^#/, "")}`, fetches);
              requestsRemaining -= 1;
              if (!roster.ok) continue;
              for (const member of roster.data.memberList ?? []) {
                if (!member.tag) continue;
                const tag = member.tag.replace(/^#/, "");
                targets.push({
                  tag,
                  source: "clan",
                  tier: "community",
                  priority: priority++,
                  revisitSeconds: 4 * 60 * 60,
                  expiresAt: now + 3 * DAY_MS
                });
                if (member.name) {
                  sightings.push({
                    tag,
                    name: member.name,
                    clanTag: roster.data.tag?.replace(/^#/, ""),
                    clanName: roster.data.name,
                    trophies: member.trophies
                  });
                }
              }
            }
          }
        }

        await recordSightings(ctx, sightings);

        if (!targets.length) {
          return {
            note: boards.ok ? "Discovery returned no players." : boards.message,
            counters: { discovered: 0, requests: fetches.length, budget: budget.limit }
          };
        }

        const tierRank = { fixed: 0, featured: 1, community: 2 } as const;
        const unique = new Map<string, (typeof targets)[number]>();
        for (const target of targets) {
          const existing = unique.get(target.tag);
          if (!existing || tierRank[target.tier] < tierRank[existing.tier] || target.priority < existing.priority) {
            unique.set(target.tag, target);
          }
        }
        const { added, seen } = await ctx.runMutation(internal.clash.meta.upsertTargets, {
          targets: [...unique.values()]
        });
        return {
          note: `${added} new of ${seen} seen using ${fetches.length}/${budget.granted} reserved requests`,
          counters: { discovered: seen, added, requests: fetches.length, reserved: budget.granted }
        };
      } finally {
        await Promise.all([
          flushFetches(ctx, fetches),
          ctx.runMutation(internal.clash.meta.releaseRequestBudget, {
            job: "discover",
            unused: Math.max(0, budget.granted - fetches.length)
          })
        ]);
      }
    });
  }
});

// --- Crawl ----------------------------------------------------------------

export const crawl = internalAction({
  args: { batch: v.optional(v.number()) },
  returns: runResult,
  handler: async (ctx, args) => {
    const batch = Math.min(args.batch ?? envNumber("CLASH_CRAWL_BATCH", 8), 50);

    return run(ctx, "crawl", async (): Promise<RunResult> => {
      if (!crawlerEnabled()) return { note: "Crawler disabled by CLASH_CRAWLER_ENABLED.", counters: { disabled: 1 } };
      const perRunLimit = Math.min(batch, envNumber("CLASH_CRAWL_REQUEST_BUDGET_PER_RUN", 8));
      const budget = await reserveBudget(
        ctx,
        "crawl",
        perRunLimit,
        envNumber("CLASH_CRAWL_DAILY_REQUEST_BUDGET", 4_000)
      );
      if (!budget.granted) {
        return { note: `Daily crawl budget exhausted (${budget.used}/${budget.limit}).`, counters: { budgetDenied: 1 } };
      }
      const claimed = await ctx.runMutation(internal.clash.meta.claimTargets, {
        limit: budget.granted,
        leaseMs: LEASE_MS
      });
      if (!claimed.length) {
        await ctx.runMutation(internal.clash.meta.releaseRequestBudget, { job: "crawl", unused: budget.granted });
        return { note: "No targets due.", counters: { fetched: 0, battles: 0 } };
      }

      let battles = 0;
      let observations = 0;
      let failures = 0;
      // Every battle names both participants, which makes the crawl the
      // richest source of (name, tag) pairs the site has.
      const sightings: Sighting[] = [];
      const fetches: ClashFetchObservation[] = [];
      const snapshots: CrawlPlayerSnapshot[] = [];

      try {
        // Sequential on purpose: the shared API token has one rate limit and a
        // burst of parallel requests is the fastest way to get 429ed.
        for (const target of claimed) {
          const response = await clashRequest<ApiBattle[]>(`/players/%23${target.tag}/battlelog`, fetches);

          if (!response.ok) {
            failures += 1;
            await ctx.runMutation(internal.clash.meta.ingestBattles, {
              targetId: target.id,
              observations: [],
              revisitSeconds: target.revisitSeconds,
              failed: true
            });
            continue;
          }

          const collected: DeckObservation[] = [];
          let targetSnapshot: CrawlPlayerSnapshot | undefined;
          for (const battle of response.data ?? []) {
            const parsed = battleObservations(battle);
            for (const participant of [...(battle.team ?? []), ...(battle.opponent ?? [])]) {
              if (!participant.tag || !participant.name) continue;
              const participantTag = participant.tag.replace(/^#/, "").toUpperCase();
              sightings.push({
              tag: participantTag,
              name: participant.name,
              clanTag: participant.clan?.tag?.replace(/^#/, ""),
              clanName: participant.clan?.name,
              // Battle logs report the trophies a player started the match on,
              // which is the closest thing to a current count they carry.
              trophies: participant.startingTrophies
              });
              if (!targetSnapshot && participantTag === target.tag.toUpperCase() && parsed[0]?.battleTime) {
                targetSnapshot = {
                player: {
                  tag: participantTag,
                  name: participant.name,
                  ...(participant.startingTrophies !== undefined ? { trophies: participant.startingTrophies } : {}),
                  ...(participant.clan?.tag ? { clanTag: participant.clan.tag.replace(/^#/, "") } : {}),
                  ...(participant.clan?.name ? { clanName: participant.clan.name } : {}),
                  ...(participant.cards?.length ? {
                    currentDeck: participant.cards.map((card) => ({
                      id: card.id,
                      ...(card.level !== undefined ? { level: card.level } : {}),
                      ...(card.evolutionLevel !== undefined ? { evolutionLevel: card.evolutionLevel } : {})
                    }))
                  } : {})
                },
                observedAt: parsed[0].battleTime
                };
              }
            }

            // Anything at or before the newest battle we already stored is a
            // re-read; the log is ordered newest first but not guaranteed to be.
            const items = parsed;
            if (items.length && target.lastBattleTime && items[0].battleTime <= target.lastBattleTime) continue;
            collected.push(...items);
          }

          if (targetSnapshot) {
            snapshots.push(targetSnapshot);
          }

          const result = await ctx.runMutation(internal.clash.meta.ingestBattles, {
            targetId: target.id,
            observations: collected,
            revisitSeconds: target.revisitSeconds
          });
          battles += result.battles;
          observations += result.observations;
        }

        await Promise.all([
          recordSightings(ctx, sightings),
          snapshots.length
            ? ctx.runMutation(internal.clash.history.recordPlayerSnapshots, {
                snapshots: snapshots.map((snapshot) => ({ ...snapshot, source: "battle_log" as const }))
              })
            : Promise.resolve()
        ]);

        return {
          note: `${claimed.length} tags, ${battles} new battles${failures ? `, ${failures} failed` : ""}`,
          counters: {
            fetched: claimed.length,
            battles,
            observations,
            failures,
            named: sightings.length,
            reserved: budget.granted
          }
        };
      } finally {
        await Promise.all([
          flushFetches(ctx, fetches),
          ctx.runMutation(internal.clash.meta.releaseRequestBudget, {
            job: "crawl",
            unused: Math.max(0, budget.granted - fetches.length)
          })
        ]);
      }
    });
  }
});

export const rollup = internalAction({
  args: {},
  returns: runResult,
  handler: async (ctx) => {
    const topN = envNumber("CLASH_RANKING_SIZE", 100);
    return run(ctx, "rollup", async (): Promise<RunResult> => {
      const result = await ctx.runMutation(internal.clash.meta.refreshRankings, {
        topN,
        minUses: envNumber("CLASH_MIN_DECK_USES", 5)
      });
      const note = result.pendingBoards || result.warmingBoards
        ? `${result.written} rows published; ${result.pendingBoards} boards normalising and ${result.warmingBoards} warming without partial replacement`
        : `${result.written} exact ranking rows published across ${result.publishedBoards} boards`;
      return { note, counters: result };
    });
  }
});

// --- Retention ------------------------------------------------------------

export const prune = internalAction({
  args: {},
  returns: runResult,
  handler: async (ctx) => {
    return run(ctx, "prune", async (): Promise<RunResult> => {
      let deleted = 0;
      // Bounded so a backlog cannot turn one cron tick into an endless loop;
      // the next tick picks up whatever is left.
      for (let pass = 0; pass < 40; pass += 1) {
        const [pipeline, history] = await Promise.all([
          ctx.runMutation(internal.clash.meta.pruneBatch, {}),
          ctx.runMutation(internal.clash.history.pruneHistoryBatch, {})
        ]);
        deleted += pipeline.deleted + history.deleted;
        if (!pipeline.more && !history.more) break;
      }
      return { note: `${deleted} rows deleted`, counters: { deleted } };
    });
  }
});
