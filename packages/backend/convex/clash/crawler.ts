import { v } from "convex/values";
import type { PaginationResult } from "convex/server";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { clashUpstream, GLOBAL_LOCATION_ID } from "./clashFetch";
import { battleObservations, META_MODES, type DeckObservation, type MetaMode } from "./lib/battles";

declare const process: { env: Record<string, string | undefined> };

/**
 * Fetching half of the battle-log pipeline. The official API exposes battles
 * only per player, so deck statistics are built by polling a rotating set of
 * player tags and folding what comes back into daily aggregates.
 *
 * Runs in the default Convex runtime — `fetch` is available there and none of
 * this needs Node built-ins.
 */

/** How long a claimed target stays off the queue while its fetch is in flight. */
const LEASE_MS = 5 * 60 * 1000;
/** Battle logs hold 25 battles, so polling faster than this mostly re-reads old rows. */
const REVISIT_SECONDS = 45 * 60;
const MAX_ROLLUP_ROWS = 60_000;

function envNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envEnabled(name: string, fallback = true): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

async function reserveBudget(
  ctx: ActionCtx,
  job: "discover" | "crawl",
  requested: number,
  dailyLimit: number,
) {
  return ctx.runMutation(internal.clash.meta.reserveRequestBudget, {
    job,
    requested,
    dailyLimit,
  });
}

type RunResult = { note?: string; counters?: Record<string, number> };
const runResult = v.object({
  note: v.optional(v.string()),
  counters: v.optional(v.record(v.string(), v.number()))
});

type Sighting = { tag: string; name: string; clanTag?: string; clanName?: string; trophies?: number };

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
  handler: async (ctx, args) => {
    const upstream = clashUpstream(ctx);
    const limit = Math.min(args.limit ?? envNumber("CLASH_DISCOVER_LIMIT", 200), 1000);
    const configuredClanCount = Math.min(envNumber("CLASH_CLAN_SEED", 20), 100);

    return run(ctx, "discover", async (): Promise<RunResult> => {
      if (!envEnabled("CLASH_CRAWLER_ENABLED")) {
        return { note: "Crawler disabled by CLASH_CRAWLER_ENABLED.", counters: { disabled: 1 } };
      }
      const perRunLimit = Math.min(envNumber("CLASH_DISCOVER_REQUEST_BUDGET_PER_RUN", 12), 100);
      const budget = await reserveBudget(
        ctx,
        "discover",
        Math.min(perRunLimit, 3 + configuredClanCount),
        envNumber("CLASH_DISCOVER_DAILY_REQUEST_BUDGET", 60),
      );
      if (budget.granted === 0) {
        return {
          note: `Daily discovery budget exhausted (${budget.used}/${budget.limit}).`,
          counters: { budgetDenied: 1 },
        };
      }

      const targets: Array<{ tag: string; source: "leaderboard" | "clan"; priority: number }> = [];
      const sightings: Sighting[] = [];
      let requests = 0;

      const boards = await upstream.leaderboards();
      requests += 1;
      // Many boards come back with a null name, and ids climb with each new
      // instance of an event, so the highest named id is the live one.
      const activeBoard = boards.ok
        ? (boards.data.items ?? []).filter((board) => board.name).sort((a, b) => b.id - a.id)[0]
        : undefined;

      if (activeBoard && requests < budget.granted) {
        const top = await upstream.leaderboard(activeBoard.id, limit);
        requests += 1;
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
          for (const [index, player] of (top.data.items ?? []).entries()) {
            if (!player.tag) continue;
            const tag = player.tag.replace(/^#/, "");
            targets.push({ tag, source: "leaderboard", priority: index });
            if (player.name) {
              sightings.push({
                tag,
                name: player.name,
                clanTag: player.clan?.tag,
                clanName: player.clan?.name,
                // Event scores are not trophies, so only persist the actual trophy field.
                trophies: player.trophies
              });
            }
          }
        }
      }

      // Clan rosters start after the Path of Legends board in priority order,
      // so the leaderboard players keep the front of the queue.
      const clans = requests < budget.granted
        ? await upstream.rankings("clans", GLOBAL_LOCATION_ID, configuredClanCount)
        : null;
      if (clans) requests += 1;

      if (clans?.ok) {
        let priority = limit;
        for (const clan of clans.data.items ?? []) {
          if (requests >= budget.granted) break;
          if (!clan.tag) continue;
          const roster = await upstream.clan(clan.tag);
          requests += 1;
          if (!roster.ok) continue;
          for (const member of roster.data.memberList ?? []) {
            if (!member.tag) continue;
            const tag = member.tag.replace(/^#/, "");
            targets.push({ tag, source: "clan", priority: priority++ });
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

      await recordSightings(ctx, sightings);

      if (!targets.length) {
        return {
          note: boards.ok ? "Leaderboards returned no players." : boards.message,
          counters: { discovered: 0, requests, reserved: budget.granted }
        };
      }

      const { added, seen } = await ctx.runMutation(internal.clash.meta.upsertTargets, { targets });
      return {
        note: `${added} new of ${seen} seen using ${requests}/${budget.granted} reserved requests`,
        counters: { discovered: seen, added, requests, reserved: budget.granted },
      };
    });
  }
});

// --- Crawl ----------------------------------------------------------------

export const crawl = internalAction({
  args: { batch: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const upstream = clashUpstream(ctx);
    const batch = Math.min(args.batch ?? envNumber("CLASH_CRAWL_BATCH", 8), 50);

    return run(ctx, "crawl", async (): Promise<RunResult> => {
      if (!envEnabled("CLASH_CRAWLER_ENABLED")) {
        return { note: "Crawler disabled by CLASH_CRAWLER_ENABLED.", counters: { disabled: 1 } };
      }
      const perRunLimit = Math.min(batch, envNumber("CLASH_CRAWL_REQUEST_BUDGET_PER_RUN", 8));
      const budget = await reserveBudget(
        ctx,
        "crawl",
        perRunLimit,
        envNumber("CLASH_CRAWL_DAILY_REQUEST_BUDGET", 4_000),
      );
      if (budget.granted === 0) {
        return {
          note: `Daily crawl budget exhausted (${budget.used}/${budget.limit}).`,
          counters: { budgetDenied: 1 },
        };
      }
      const claimed = await ctx.runMutation(internal.clash.meta.claimTargets, {
        limit: budget.granted,
        leaseMs: LEASE_MS,
      });
      if (!claimed.length) return { note: "No targets due.", counters: { fetched: 0, battles: 0 } };

      let battles = 0;
      let observations = 0;
      let failures = 0;
      // Every battle names both participants, which makes the crawl the
      // richest source of (name, tag) pairs the site has.
      const sightings: Sighting[] = [];

      // Sequential on purpose: the shared API token has one rate limit and a
      // burst of parallel requests is the fastest way to get 429ed.
      for (const target of claimed) {
        const response = await upstream.battleLog(target.tag);

        if (!response.ok) {
          failures += 1;
          await ctx.runMutation(internal.clash.meta.ingestBattles, {
            targetId: target.id,
            observations: [],
            revisitSeconds: REVISIT_SECONDS,
            failed: true
          });
          continue;
        }

        const collected: DeckObservation[] = [];
        let targetSnapshot: {
          player: {
            tag: string;
            name: string;
            trophies?: number;
            clanTag?: string;
            clanName?: string;
            currentDeck?: Array<{ id: number; level?: number; evolutionLevel?: number }>;
          };
          observedAt: number;
        } | undefined;
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
          await ctx.runMutation(internal.clash.history.recordPlayerSnapshot, {
            ...targetSnapshot,
            source: "battle_log"
          });
        }

        const result = await ctx.runMutation(internal.clash.meta.ingestBattles, {
          targetId: target.id,
          observations: collected,
          revisitSeconds: REVISIT_SECONDS
        });
        battles += result.battles;
        observations += result.observations;
      }

      await recordSightings(ctx, sightings);

      return {
        note: `${claimed.length} tags, ${battles} new battles${failures ? `, ${failures} failed` : ""}`,
        counters: {
          fetched: claimed.length,
          battles,
          observations,
          failures,
          named: sightings.length,
          reserved: budget.granted,
        }
      };
    });
  }
});

// --- Rollup ---------------------------------------------------------------

type Aggregate = {
  deckHash: string;
  cardIds: number[];
  evolutionIds: number[];
  uses: number;
  wins: number;
  trophySum: number;
  trophySamples: number;
  arenaIds: Set<number>;
  arenaNames: Set<string>;
};

async function aggregateWindow(ctx: ActionCtx, days: number) {
  const byMode = new Map<MetaMode, Map<string, Aggregate>>();
  const totals = new Map<MetaMode, number>();
  let rowsRead = 0;
  let truncated = false;

  for (let offset = 0; offset < days; offset += 1) {
    const day = Number(
      new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "")
    );
    let cursor: string | null = null;

    for (;;) {
      // Annotated to break the TypeScript circularity between this action and
      // the query it calls.
      const page: PaginationResult<Doc<"deckStats">> = await ctx.runQuery(internal.clash.meta.deckStatsForDay, {
        day,
        cursor,
        numItems: 512
      });
      rowsRead += page.page.length;

      for (const row of page.page) {
        const mode = row.mode as MetaMode;
        const decks = byMode.get(mode) ?? new Map<string, Aggregate>();
        const entry = decks.get(row.deckHash) ?? {
          deckHash: row.deckHash,
          cardIds: row.cardIds,
          evolutionIds: row.evolutionIds,
          uses: 0,
          wins: 0,
          trophySum: 0,
          trophySamples: 0,
          arenaIds: new Set<number>(),
          arenaNames: new Set<string>()
        };
        entry.uses += row.uses;
        entry.wins += row.wins;
        entry.trophySum += row.trophySum ?? 0;
        entry.trophySamples += row.trophySamples ?? 0;
        for (const arenaId of row.arenaIds ?? []) entry.arenaIds.add(arenaId);
        for (const arenaName of row.arenaNames ?? []) entry.arenaNames.add(arenaName);
        decks.set(row.deckHash, entry);
        byMode.set(mode, decks);
        totals.set(mode, (totals.get(mode) ?? 0) + row.uses);
      }

      if (page.isDone) break;
      cursor = page.continueCursor;
      if (rowsRead >= MAX_ROLLUP_ROWS) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }

  return { byMode, totals, rowsRead, truncated };
}

export const rollup = internalAction({
  args: {},
  returns: runResult,
  handler: async (ctx) => {
    const topN = envNumber("CLASH_RANKING_SIZE", 100);

    return run(ctx, "rollup", async (): Promise<RunResult> => {
      let written = 0;
      let rowsRead = 0;
      const truncatedWindows: number[] = [];

      for (const windowDays of [1, 7]) {
        const { byMode, totals, rowsRead: read, truncated } = await aggregateWindow(ctx, windowDays);
        rowsRead += read;
        if (truncated) truncatedWindows.push(windowDays);

        for (const mode of META_MODES) {
          const decks = byMode.get(mode);
          const total = totals.get(mode) ?? 0;
          const rows = [...(decks?.values() ?? [])]
            // A deck seen once tells us nothing; requiring a floor keeps the
            // board from being dominated by noise on a young dataset.
            .filter((entry) => entry.uses >= envNumber("CLASH_MIN_DECK_USES", 5))
            .sort((a, b) => b.uses - a.uses)
            .slice(0, topN)
            .map((entry) => ({
              deckHash: entry.deckHash,
              cardIds: entry.cardIds,
              evolutionIds: entry.evolutionIds,
              uses: entry.uses,
              wins: entry.wins,
              winRate: entry.uses ? entry.wins / entry.uses : 0,
              usageRate: total ? entry.uses / total : 0,
              ...(entry.trophySamples
                ? { averageTrophies: entry.trophySum / entry.trophySamples, trophySamples: entry.trophySamples }
                : {}),
              ...(entry.arenaIds.size ? { arenaIds: [...entry.arenaIds] } : {}),
              ...(entry.arenaNames.size ? { arenaNames: [...entry.arenaNames] } : {})
            }));

          const result = await ctx.runMutation(internal.clash.meta.writeDeckRankings, { windowDays, mode, rows });
          written += result.written;
        }
      }

      const note = truncatedWindows.length
        ? `${written} rows; windows ${truncatedWindows.join(", ")}d hit the ${MAX_ROLLUP_ROWS}-row read cap and are partial`
        : `${written} ranking rows from ${rowsRead} daily aggregates`;

      return { note, counters: { written, rowsRead, truncated: truncatedWindows.length } };
    });
  }
});

// --- Retention ------------------------------------------------------------

export const prune = internalAction({
  args: {},
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
