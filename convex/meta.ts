import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { crawlSource, metaMode } from "./schema";
import { dayKey, dayKeysBack, type MetaMode } from "../src/lib/clash/battles";

/**
 * Database half of the battle-log pipeline. Everything here runs in the default
 * Convex runtime; the fetching lives in `crawler.ts`.
 */

const RETENTION_DAYS = 30;
/** Battle logs only go back 25 battles, so dedup keys older than this are dead weight. */
const SEEN_BATTLE_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const RANKING_WINDOWS = [1, 7] as const;
/** Matches the deck ranking's CLASH_MIN_DECK_USES default in `crawler.ts`. */
const MIN_TOWER_USES = 5;

const observation = v.object({
  fingerprint: v.string(),
  battleTime: v.number(),
  mode: metaMode,
  gameMode: v.string(),
  deckHash: v.string(),
  cardIds: v.array(v.number()),
  evolutionIds: v.array(v.number()),
  towerCardId: v.optional(v.number()),
  won: v.boolean(),
  crowns: v.number(),
  opponentCrowns: v.number()
});

export async function bump(ctx: MutationCtx, name: string, delta: number) {
  if (!delta) return;
  const existing = await ctx.db
    .query("pipelineCounters")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (existing) await ctx.db.patch(existing._id, { value: existing.value + delta, updatedAt: Date.now() });
  else await ctx.db.insert("pipelineCounters", { name, value: delta, updatedAt: Date.now() });
}

// --- Crawl queue ----------------------------------------------------------

export const upsertTargets = internalMutation({
  args: {
    targets: v.array(v.object({ tag: v.string(), source: crawlSource, priority: v.number() }))
  },
  handler: async (ctx, args) => {
    let added = 0;
    for (const target of args.targets) {
      const existing = await ctx.db
        .query("crawlTargets")
        .withIndex("by_tag", (q) => q.eq("tag", target.tag))
        .unique();

      if (existing) {
        // Re-appearing at the top of a leaderboard revives a target that had
        // been disabled for repeated failures.
        await ctx.db.patch(existing._id, {
          source: target.source,
          priority: Math.min(existing.priority, target.priority),
          disabled: false,
          consecutiveFailures: 0
        });
        continue;
      }

      await ctx.db.insert("crawlTargets", {
        tag: target.tag,
        source: target.source,
        priority: target.priority,
        nextDueAt: Date.now(),
        consecutiveFailures: 0,
        disabled: false
      });
      added += 1;
    }
    await bump(ctx, "crawlTargets", added);
    return { added, seen: args.targets.length };
  }
});

/**
 * Hands out the next batch of due targets and immediately pushes their due time
 * forward, so an overlapping cron run picks up different tags.
 */
export const claimTargets = internalMutation({
  args: { limit: v.number(), leaseMs: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const due = await ctx.db
      .query("crawlTargets")
      .withIndex("by_due", (q) => q.eq("disabled", false).lte("nextDueAt", now))
      .take(Math.min(args.limit, 50));

    for (const target of due) {
      await ctx.db.patch(target._id, { nextDueAt: now + args.leaseMs });
    }

    return due.map((target) => ({ id: target._id, tag: target.tag, lastBattleTime: target.lastBattleTime }));
  }
});

// --- Ingest ---------------------------------------------------------------

export const ingestBattles = internalMutation({
  args: {
    targetId: v.optional(v.id("crawlTargets")),
    observations: v.array(observation),
    /** Seconds until this target is polled again. */
    revisitSeconds: v.number(),
    failed: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.targetId) {
      const target = await ctx.db.get(args.targetId);
      if (target) {
        const failures = args.failed ? target.consecutiveFailures + 1 : 0;
        await ctx.db.patch(args.targetId, {
          lastFetchedAt: now,
          consecutiveFailures: failures,
          // Three strikes usually means the tag was deleted or renamed.
          disabled: failures >= 3,
          nextDueAt: now + args.revisitSeconds * 1000,
          lastBattleTime: args.observations.reduce(
            (newest, item) => Math.max(newest, item.battleTime),
            target.lastBattleTime ?? 0
          )
        });
      }
    }

    if (args.failed) {
      await bump(ctx, "playerFetchFailures", 1);
      return { battles: 0, observations: 0 };
    }
    await bump(ctx, "playerFetches", 1);

    // One battle produces two observations sharing a fingerprint. Keep the
    // whole battle if it is new, so both decks are counted or neither is.
    const fingerprints = [...new Set(args.observations.map((item) => item.fingerprint))];
    const fresh: string[] = [];
    for (const fingerprint of fingerprints) {
      const seen = await ctx.db
        .query("seenBattles")
        .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
        .unique();
      if (!seen) fresh.push(fingerprint);
    }
    if (!fresh.length) return { battles: 0, observations: 0 };

    const freshSet = new Set(fresh);
    const accepted = args.observations.filter((item) => freshSet.has(item.fingerprint));

    for (const fingerprint of fresh) {
      const time = accepted.find((item) => item.fingerprint === fingerprint)?.battleTime ?? now;
      await ctx.db.insert("seenBattles", { fingerprint, battleTime: time });
    }

    // Fold in memory first: 50 observations touch the same ~120 card rows, and
    // a transaction should not write the same document fifty times.
    type DeckDelta = {
      day: number;
      mode: MetaMode;
      deckHash: string;
      cardIds: number[];
      evolutionIds: number[];
      uses: number;
      wins: number;
      crowns: number;
    };
    const deckDeltas = new Map<string, DeckDelta>();
    const cardDeltas = new Map<string, { day: number; mode: MetaMode; cardId: number; uses: number; wins: number }>();
    const towerDeltas = new Map<
      string,
      { day: number; mode: MetaMode; towerCardId: number; uses: number; wins: number }
    >();

    for (const item of accepted) {
      const day = dayKey(item.battleTime);
      const mode = item.mode as MetaMode;
      const deckKey = `${day}:${mode}:${item.deckHash}`;
      const deck = deckDeltas.get(deckKey) ?? {
        day,
        mode,
        deckHash: item.deckHash,
        cardIds: item.cardIds,
        evolutionIds: item.evolutionIds,
        uses: 0,
        wins: 0,
        crowns: 0
      };
      deck.uses += 1;
      deck.wins += item.won ? 1 : 0;
      deck.crowns += item.crowns;
      deckDeltas.set(deckKey, deck);

      for (const cardId of item.cardIds) {
        const cardKey = `${day}:${mode}:${cardId}`;
        const card = cardDeltas.get(cardKey) ?? { day, mode, cardId, uses: 0, wins: 0 };
        card.uses += 1;
        card.wins += item.won ? 1 : 0;
        cardDeltas.set(cardKey, card);
      }

      // Older battle logs and reconnects can lack a Tower Troop reading
      // entirely; skip rather than folding it under a sentinel id so the
      // aggregate never counts a troop that was never observed.
      if (item.towerCardId !== undefined) {
        const towerKey = `${day}:${mode}:${item.towerCardId}`;
        const tower = towerDeltas.get(towerKey) ?? { day, mode, towerCardId: item.towerCardId, uses: 0, wins: 0 };
        tower.uses += 1;
        tower.wins += item.won ? 1 : 0;
        towerDeltas.set(towerKey, tower);
      }
    }

    for (const delta of deckDeltas.values()) {
      const existing = await ctx.db
        .query("deckStats")
        .withIndex("by_day_and_mode_and_deck", (q) =>
          q.eq("day", delta.day).eq("mode", delta.mode).eq("deckHash", delta.deckHash)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          uses: existing.uses + delta.uses,
          wins: existing.wins + delta.wins,
          crowns: existing.crowns + delta.crowns
        });
      } else {
        await ctx.db.insert("deckStats", delta);
      }
    }

    for (const delta of cardDeltas.values()) {
      const existing = await ctx.db
        .query("cardStats")
        .withIndex("by_day_and_mode_and_card", (q) =>
          q.eq("day", delta.day).eq("mode", delta.mode).eq("cardId", delta.cardId)
        )
        .unique();

      if (existing) await ctx.db.patch(existing._id, { uses: existing.uses + delta.uses, wins: existing.wins + delta.wins });
      else await ctx.db.insert("cardStats", delta);
    }

    for (const delta of towerDeltas.values()) {
      const existing = await ctx.db
        .query("towerStats")
        .withIndex("by_day_and_mode_and_tower", (q) =>
          q.eq("day", delta.day).eq("mode", delta.mode).eq("towerCardId", delta.towerCardId)
        )
        .unique();

      if (existing) await ctx.db.patch(existing._id, { uses: existing.uses + delta.uses, wins: existing.wins + delta.wins });
      else await ctx.db.insert("towerStats", delta);
    }

    await bump(ctx, "battlesIngested", fresh.length);
    await bump(ctx, "observationsIngested", accepted.length);

    return { battles: fresh.length, observations: accepted.length };
  }
});

// --- Rollup ---------------------------------------------------------------

export const deckStatsForDay = internalQuery({
  args: { day: v.number(), cursor: v.union(v.string(), v.null()), numItems: v.number() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("deckStats")
      .withIndex("by_day", (q) => q.eq("day", args.day))
      .paginate({ cursor: args.cursor, numItems: args.numItems });
  }
});

export const writeDeckRankings = internalMutation({
  args: {
    windowDays: v.number(),
    mode: metaMode,
    rows: v.array(
      v.object({
        deckHash: v.string(),
        cardIds: v.array(v.number()),
        evolutionIds: v.array(v.number()),
        uses: v.number(),
        wins: v.number(),
        winRate: v.number(),
        usageRate: v.number()
      })
    )
  },
  handler: async (ctx, args) => {
    const stale = await ctx.db
      .query("deckRankings")
      .withIndex("by_window_and_mode", (q) => q.eq("windowDays", args.windowDays).eq("mode", args.mode))
      .take(500);
    for (const row of stale) await ctx.db.delete(row._id);

    const computedAt = Date.now();
    for (const [index, row] of args.rows.entries()) {
      await ctx.db.insert("deckRankings", {
        ...row,
        windowDays: args.windowDays,
        mode: args.mode,
        rank: index + 1,
        computedAt
      });
    }
    return { written: args.rows.length };
  }
});

// --- Retention ------------------------------------------------------------

/**
 * Deletes one batch and reports whether more remains, so the caller can keep
 * scheduling itself instead of blowing the transaction limit.
 */
export const pruneBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const seenCutoff = Date.now() - SEEN_BATTLE_RETENTION_MS;
    const staleSeen = await ctx.db
      .query("seenBattles")
      .withIndex("by_battle_time", (q) => q.lt("battleTime", seenCutoff))
      .take(256);
    for (const row of staleSeen) await ctx.db.delete(row._id);

    const dayCutoff = dayKey(Date.now() - RETENTION_DAYS * 86_400_000);
    const staleDecks = await ctx.db
      .query("deckStats")
      .withIndex("by_day", (q) => q.lt("day", dayCutoff))
      .take(256);
    for (const row of staleDecks) await ctx.db.delete(row._id);

    const staleCards = await ctx.db
      .query("cardStats")
      .withIndex("by_day", (q) => q.lt("day", dayCutoff))
      .take(256);
    for (const row of staleCards) await ctx.db.delete(row._id);

    const staleTowers = await ctx.db
      .query("towerStats")
      .withIndex("by_day", (q) => q.lt("day", dayCutoff))
      .take(256);
    for (const row of staleTowers) await ctx.db.delete(row._id);

    const logCutoff = Date.now() - 7 * 86_400_000;
    const staleLogs = await ctx.db
      .query("apiFetchLogs")
      .withIndex("by_fetched_at", (q) => q.lt("fetchedAt", logCutoff))
      .take(256);
    for (const row of staleLogs) await ctx.db.delete(row._id);

    const staleRuns = await ctx.db
      .query("pipelineRuns")
      .withIndex("by_started_at", (q) => q.lt("startedAt", logCutoff))
      .take(256);
    for (const row of staleRuns) await ctx.db.delete(row._id);

    const deleted =
      staleSeen.length + staleDecks.length + staleCards.length + staleTowers.length + staleLogs.length + staleRuns.length;
    return { deleted, more: deleted > 0 };
  }
});

// --- Run log --------------------------------------------------------------

export const startRun = internalMutation({
  args: { job: v.string() },
  handler: async (ctx, args) =>
    ctx.db.insert("pipelineRuns", { job: args.job, startedAt: Date.now(), ok: false })
});

export const finishRun = internalMutation({
  args: {
    id: v.id("pipelineRuns"),
    ok: v.boolean(),
    note: v.optional(v.string()),
    counters: v.optional(v.record(v.string(), v.number()))
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      ok: args.ok,
      note: args.note,
      counters: args.counters,
      finishedAt: Date.now()
    });
  }
});

// --- Public read API ------------------------------------------------------

/**
 * Convex has no count operator, so counts come from a bounded read. `capped`
 * tells the UI to render "200+" rather than pretending the number is exact.
 */
function probe(rows: unknown[], cap: number) {
  return { count: rows.length, capped: rows.length >= cap };
}

export const pipelineStatus = query({
  args: {},
  handler: async (ctx) => {
    const counters = await ctx.db.query("pipelineCounters").take(20);
    const now = Date.now();

    const dueRows = await ctx.db
      .query("crawlTargets")
      .withIndex("by_due", (q) => q.eq("disabled", false).lte("nextDueAt", now))
      .take(200);

    const recentLogs = await ctx.db
      .query("apiFetchLogs")
      .withIndex("by_fetched_at", (q) => q.gte("fetchedAt", now - 60 * 60 * 1000))
      .take(500);

    const today = dayKey(now);
    const decksToday = await ctx.db
      .query("deckStats")
      .withIndex("by_day", (q) => q.eq("day", today))
      .take(500);

    const lastRuns = await ctx.db.query("pipelineRuns").withIndex("by_started_at").order("desc").take(10);
    const rankings = await ctx.db
      .query("deckRankings")
      .withIndex("by_window_and_mode_and_rank", (q) => q.eq("windowDays", 7))
      .first();

    return {
      now,
      counters: Object.fromEntries(counters.map((row) => [row.name, row.value])),
      due: probe(dueRows, 200),
      decksToday: probe(decksToday, 500),
      battlesToday: decksToday.reduce((total, row) => total + row.uses, 0),
      apiCalls: {
        lastHour: recentLogs.length,
        failures: recentLogs.filter((row) => !row.ok).length,
        capped: recentLogs.length >= 500
      },
      lastRuns,
      rankingsComputedAt: rankings?.computedAt ?? null
    };
  }
});

export const topDecks = query({
  args: { mode: metaMode, windowDays: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const windowDays = RANKING_WINDOWS.includes(args.windowDays as 1 | 7) ? args.windowDays! : 7;
    const rows = await ctx.db
      .query("deckRankings")
      .withIndex("by_window_and_mode_and_rank", (q) => q.eq("windowDays", windowDays).eq("mode", args.mode))
      .take(Math.min(args.limit ?? 20, 100));
    return { windowDays, decks: rows };
  }
});

export const topCards = query({
  args: { mode: metaMode, windowDays: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const windowDays = Math.min(Math.max(args.windowDays ?? 7, 1), RETENTION_DAYS);
    const totals = new Map<number, { cardId: number; uses: number; wins: number }>();
    let battles = 0;

    for (const day of dayKeysBack(windowDays)) {
      const rows = await ctx.db
        .query("cardStats")
        .withIndex("by_day_and_mode_and_card", (q) => q.eq("day", day).eq("mode", args.mode))
        .take(400);
      for (const row of rows) {
        const entry = totals.get(row.cardId) ?? { cardId: row.cardId, uses: 0, wins: 0 };
        entry.uses += row.uses;
        entry.wins += row.wins;
        totals.set(row.cardId, entry);
      }
      battles += rows.reduce((total, row) => total + row.uses, 0);
    }

    // Every deck holds eight cards, so total card uses over eight is the number
    // of decks observed — the denominator for usage rate.
    const decksObserved = battles / 8;
    const cards = [...totals.values()]
      .map((entry) => ({
        ...entry,
        winRate: entry.uses ? entry.wins / entry.uses : 0,
        usageRate: decksObserved ? entry.uses / decksObserved : 0
      }))
      .sort((a, b) => b.uses - a.uses)
      .slice(0, Math.min(args.limit ?? 40, 200));

    return { windowDays, decksObserved, cards };
  }
});

/**
 * Same shape and windowing as `topCards`, but for the Tower Troop a side
 * brought rather than one of the eight deck cards. This table only started
 * filling in once the fold above shipped, so `decksObserved` here can be far
 * smaller than the card table's for the same window — that is the honest
 * sample size, not a bug.
 */
export const topTowerTroops = query({
  args: { mode: metaMode, windowDays: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const windowDays = Math.min(Math.max(args.windowDays ?? 7, 1), RETENTION_DAYS);
    const totals = new Map<number, { towerCardId: number; uses: number; wins: number }>();
    let decksObserved = 0;

    for (const day of dayKeysBack(windowDays)) {
      const rows = await ctx.db
        .query("towerStats")
        .withIndex("by_day_and_mode_and_tower", (q) => q.eq("day", day).eq("mode", args.mode))
        .take(400);
      for (const row of rows) {
        const entry = totals.get(row.towerCardId) ?? { towerCardId: row.towerCardId, uses: 0, wins: 0 };
        entry.uses += row.uses;
        entry.wins += row.wins;
        totals.set(row.towerCardId, entry);
      }
      // A deck names exactly one Tower Troop, not eight cards, so summed uses
      // already are the deck count — no /8 like topCards' decksObserved.
      decksObserved += rows.reduce((total, row) => total + row.uses, 0);
    }

    const towerTroops = [...totals.values()]
      // Same five-use floor the deck ranking uses. There are only a handful of
      // Tower Troops, so this clears within minutes of the first crawl — but
      // without it the table's first render would publish a 100% win rate off
      // a single battle, which is the one thing this page will not do.
      .filter((entry) => entry.uses >= MIN_TOWER_USES)
      .map((entry) => ({
        ...entry,
        winRate: entry.uses ? entry.wins / entry.uses : 0,
        usageRate: decksObserved ? entry.uses / decksObserved : 0
      }))
      .sort((a, b) => b.uses - a.uses)
      .slice(0, Math.min(args.limit ?? 40, 200));

    return { windowDays, decksObserved, towerTroops };
  }
});

/**
 * Stats for one specific deck, by hash. `by_day_and_mode_and_deck` makes this a
 * single point read per day, so the deck builder can price an arbitrary
 * eight-card selection rather than only the decks that made the top-100 board.
 */
export const deckMeta = query({
  args: { deckHash: v.string(), mode: metaMode, windowDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const windowDays = Math.min(Math.max(args.windowDays ?? 7, 1), RETENTION_DAYS);
    let uses = 0;
    let wins = 0;
    let crowns = 0;

    for (const day of dayKeysBack(windowDays)) {
      const row = await ctx.db
        .query("deckStats")
        .withIndex("by_day_and_mode_and_deck", (q) =>
          q.eq("day", day).eq("mode", args.mode).eq("deckHash", args.deckHash)
        )
        .unique();
      if (!row) continue;
      uses += row.uses;
      wins += row.wins;
      crowns += row.crowns;
    }

    return {
      windowDays,
      uses,
      wins,
      winRate: uses ? wins / uses : 0,
      crownsPerGame: uses ? crowns / uses : 0
    };
  }
});

/** Lets the beta page queue a specific player without redeploying. */
export const seedTag = mutation({
  args: { tag: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const expected = process.env.BETA_ADMIN_KEY;
    if (!expected || args.key !== expected) return { ok: false as const, message: "Invalid admin key." };

    const tag = args.tag.trim().toUpperCase().replace(/^#/, "");
    if (!/^[0289PYLQGRJCUV]{3,15}$/.test(tag)) return { ok: false as const, message: "That is not a valid player tag." };

    const existing = await ctx.db
      .query("crawlTargets")
      .withIndex("by_tag", (q) => q.eq("tag", tag))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { nextDueAt: Date.now(), disabled: false, consecutiveFailures: 0 });
      return { ok: true as const, message: `#${tag} moved to the front of the queue.` };
    }

    await ctx.db.insert("crawlTargets", {
      tag,
      source: "manual",
      priority: 0,
      nextDueAt: Date.now(),
      consecutiveFailures: 0,
      disabled: false
    });
    await bump(ctx, "crawlTargets", 1);
    return { ok: true as const, message: `#${tag} queued.` };
  }
});

export type PipelineRun = Doc<"pipelineRuns">;
