import { v } from "convex/values";
import type { PaginationResult } from "convex/server";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { clashRequest } from "./clashFetch";
import { battleObservations, META_MODES, type DeckObservation, type MetaMode } from "../src/lib/clash/battles";
import type {
  ApiBattle,
  ApiClan,
  ApiClanRanking,
  ApiLeaderboard,
  ApiPaged,
  ApiPlayerRanking
} from "../src/lib/clash/types";

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
const MAX_ROLLUP_ROWS = 60_000;

function envNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function logFetch(ctx: ActionCtx, endpoint: string, status: number, ok: boolean) {
  await ctx.runMutation(internal.cache.logFetch, { endpoint, status, ok, fetchedAt: Date.now() });
}

type RunResult = { note?: string; counters?: Record<string, number> };

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
      await ctx.runMutation(internal.players.record, { players: named.slice(index, index + 250) });
    } catch {
      return;
    }
  }
}

/** Wraps a job so every execution shows up on the beta page, success or not. */
async function run(ctx: ActionCtx, job: string, body: () => Promise<RunResult>): Promise<RunResult> {
  const id = await ctx.runMutation(internal.meta.startRun, { job });
  try {
    const result = await body();
    await ctx.runMutation(internal.meta.finishRun, {
      id,
      ok: true,
      note: result.note,
      counters: result.counters
    });
    return result;
  } catch (error) {
    await ctx.runMutation(internal.meta.finishRun, {
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
    const limit = Math.min(args.limit ?? envNumber("CLASH_DISCOVER_LIMIT", 200), 1000);
    const clanCount = Math.min(envNumber("CLASH_CLAN_SEED", 20), 100);

    return run(ctx, "discover", async (): Promise<RunResult> => {
      const targets: Array<{ tag: string; source: "leaderboard" | "clan"; priority: number }> = [];
      const sightings: Sighting[] = [];

      const boards = await clashRequest<ApiPaged<ApiLeaderboard>>("/leaderboards");
      await logFetch(ctx, "/leaderboards", boards.status, boards.ok);
      // Many boards come back with a null name, and ids climb with each new
      // instance of an event, so the highest named id is the live one.
      const boardId = boards.ok
        ? (boards.data.items ?? []).filter((board) => board.name).sort((a, b) => b.id - a.id)[0]?.id
        : undefined;

      if (typeof boardId === "number") {
        const top = await clashRequest<ApiPaged<ApiPlayerRanking>>(`/leaderboard/${boardId}?limit=${limit}`);
        await logFetch(ctx, "/leaderboard/{id}", top.status, top.ok);
        if (top.ok) {
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
                // Event boards report `score`; the trophy field is absent there.
                trophies: player.trophies ?? player.score
              });
            }
          }
        }
      }

      // Clan rosters start after the Path of Legends board in priority order,
      // so the leaderboard players keep the front of the queue.
      const clans = await clashRequest<ApiPaged<ApiClanRanking>>(
        `/locations/${GLOBAL_LOCATION_ID}/rankings/clans?limit=${clanCount}`
      );
      await logFetch(ctx, "/locations/international/rankings/clans", clans.status, clans.ok);

      if (clans.ok) {
        let priority = limit;
        for (const clan of clans.data.items ?? []) {
          if (!clan.tag) continue;
          const roster = await clashRequest<ApiClan>(`/clans/%23${clan.tag.replace(/^#/, "")}`);
          await logFetch(ctx, "/clans/{tag}", roster.status, roster.ok);
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
          counters: { discovered: 0 }
        };
      }

      const { added, seen } = await ctx.runMutation(internal.meta.upsertTargets, { targets });
      return { note: `${added} new of ${seen} seen`, counters: { discovered: seen, added } };
    });
  }
});

// --- Crawl ----------------------------------------------------------------

export const crawl = internalAction({
  args: { batch: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batch = Math.min(args.batch ?? envNumber("CLASH_CRAWL_BATCH", 8), 50);

    return run(ctx, "crawl", async (): Promise<RunResult> => {
      const claimed = await ctx.runMutation(internal.meta.claimTargets, { limit: batch, leaseMs: LEASE_MS });
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
        const response = await clashRequest<ApiBattle[]>(`/players/%23${target.tag}/battlelog`);
        await logFetch(ctx, "/players/{tag}/battlelog", response.status, response.ok);

        if (!response.ok) {
          failures += 1;
          await ctx.runMutation(internal.meta.ingestBattles, {
            targetId: target.id,
            observations: [],
            revisitSeconds: REVISIT_SECONDS,
            failed: true
          });
          continue;
        }

        const collected: DeckObservation[] = [];
        for (const battle of response.data ?? []) {
          for (const participant of [...(battle.team ?? []), ...(battle.opponent ?? [])]) {
            if (!participant.tag || !participant.name) continue;
            sightings.push({
              tag: participant.tag.replace(/^#/, ""),
              name: participant.name,
              clanTag: participant.clan?.tag?.replace(/^#/, ""),
              clanName: participant.clan?.name,
              // Battle logs report the trophies a player started the match on,
              // which is the closest thing to a current count they carry.
              trophies: participant.startingTrophies
            });
          }

          // Anything at or before the newest battle we already stored is a
          // re-read; the log is ordered newest first but not guaranteed to be.
          const items = battleObservations(battle);
          if (items.length && target.lastBattleTime && items[0].battleTime <= target.lastBattleTime) continue;
          collected.push(...items);
        }

        const result = await ctx.runMutation(internal.meta.ingestBattles, {
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
        counters: { fetched: claimed.length, battles, observations, failures, named: sightings.length }
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
      const page: PaginationResult<Doc<"deckStats">> = await ctx.runQuery(internal.meta.deckStatsForDay, {
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
          wins: 0
        };
        entry.uses += row.uses;
        entry.wins += row.wins;
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
              usageRate: total ? entry.uses / total : 0
            }));

          const result = await ctx.runMutation(internal.meta.writeDeckRankings, { windowDays, mode, rows });
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
        const result = await ctx.runMutation(internal.meta.pruneBatch, {});
        deleted += result.deleted;
        if (!result.more) break;
      }
      return { note: `${deleted} rows deleted`, counters: { deleted } };
    });
  }
});
