import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { crawlSource, crawlTier, metaMode } from "./schema";
import { dayKey, dayKeysBack, type DeckObservation, type MetaMode } from "./lib/battles";

declare const process: { env: Record<string, string | undefined> };

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
const MIN_MATCHUP_USES = 5;
const PROFILE_HISTORY_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const TARGET_FIXED_REVISIT_SECONDS = 45 * 60;
const RANKING_REFRESH_LIMIT = 250;

const observation = v.object({
  fingerprint: v.string(),
  battleTime: v.number(),
  mode: metaMode,
  gameMode: v.string(),
  deckHash: v.string(),
  cardIds: v.array(v.number()),
  evolutionIds: v.array(v.number()),
  towerCardId: v.optional(v.number()),
  trophies: v.optional(v.number()),
  arenaId: v.optional(v.number()),
  arenaName: v.optional(v.string()),
  won: v.boolean(),
  crowns: v.number(),
  opponentCrowns: v.number()
});

const matchupResult = v.object({
  oppDeckHash: v.string(),
  cardIds: v.array(v.number()),
  uses: v.number(),
  wins: v.number(),
  winRate: v.number()
});

function isKnownDeck(cardIds: number[]) {
  return cardIds.length === 8 && cardIds.every((cardId) => Number.isInteger(cardId) && cardId > 0);
}

type RankingBucket = {
  day: number;
  uses: number;
  wins: number;
  trophySum: number;
  trophySamples: number;
  arenaIds: number[];
  arenaNames: string[];
};

function currentRankingBuckets(buckets: RankingBucket[], timestamp: number): RankingBucket[] {
  const days = new Set(dayKeysBack(7, timestamp));
  return buckets.filter((bucket) => days.has(bucket.day)).sort((left, right) => left.day - right.day);
}

function rankingUses(buckets: RankingBucket[], today: number) {
  return {
    uses1: buckets.find((bucket) => bucket.day === today)?.uses ?? 0,
    uses7: buckets.reduce((total, bucket) => total + bucket.uses, 0)
  };
}

function dayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function envNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envEnabled(name: string) {
  return !["0", "false", "off"].includes((process.env[name] ?? "true").toLowerCase());
}

export async function bump(ctx: MutationCtx, name: string, delta: number) {
  if (!delta) return;
  const existing = await ctx.db
    .query("clashPipelineCounters")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (existing) await ctx.db.patch(existing._id, { value: existing.value + delta, updatedAt: Date.now() });
  else await ctx.db.insert("clashPipelineCounters", { name, value: delta, updatedAt: Date.now() });
}

// --- Crawl queue ----------------------------------------------------------

export const upsertTargets = internalMutation({
  args: {
    targets: v.array(v.object({
      tag: v.string(),
      source: crawlSource,
      tier: crawlTier,
      priority: v.number(),
      revisitSeconds: v.number(),
      expiresAt: v.number()
    }))
  },
  returns: v.object({ added: v.number(), seen: v.number() }),
  handler: async (ctx, args) => {
    let added = 0;
    const now = Date.now();
    for (const target of args.targets) {
      const priority = Math.max(0, Math.floor(target.priority));
      const existing = await ctx.db
        .query("clashCrawlTargets")
        .withIndex("by_tag", (q) => q.eq("tag", target.tag))
        .unique();

      if (existing) {
        // Re-appearing at the top of a leaderboard revives a target that had
        // been disabled for repeated failures.
        await ctx.db.patch(existing._id, {
          source: target.source,
          tier: target.tier,
          priority,
          revisitSeconds: target.revisitSeconds,
          lastDiscoveredAt: now,
          expiresAt: target.expiresAt,
          disabled: false,
          consecutiveFailures: 0
        });
        continue;
      }

      await ctx.db.insert("clashCrawlTargets", {
        tag: target.tag,
        source: target.source,
        tier: target.tier,
        priority,
        revisitSeconds: target.revisitSeconds,
        lastDiscoveredAt: now,
        expiresAt: target.expiresAt,
        nextDueAt: now,
        consecutiveFailures: 0,
        disabled: false
      });
      added += 1;
    }
    await bump(ctx, "crawlTargets", added);
    return { added, seen: args.targets.length };
  }
});

export const reserveRequestBudget = internalMutation({
  args: {
    job: v.union(v.literal("discover"), v.literal("crawl"), v.literal("clanWatch")),
    requested: v.number(),
    dailyLimit: v.number()
  },
  returns: v.object({ granted: v.number(), used: v.number(), limit: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const day = dayKey(now);
    const requested = Math.max(0, Math.floor(args.requested));
    const limit = Math.max(0, Math.floor(args.dailyLimit));
    const row = await ctx.db
      .query("clashCrawlerBudgets")
      .withIndex("by_day_and_job", (q) => q.eq("day", day).eq("job", args.job))
      .unique();
    const used = row?.reserved ?? 0;
    const granted = Math.min(requested, Math.max(0, limit - used));
    if (row) {
      if (granted) await ctx.db.patch(row._id, { reserved: used + granted, updatedAt: now });
    } else if (granted) {
      await ctx.db.insert("clashCrawlerBudgets", { day, job: args.job, reserved: granted, updatedAt: now });
    }
    return { granted, used: used + granted, limit };
  }
});

export const releaseRequestBudget = internalMutation({
  args: {
    job: v.union(v.literal("discover"), v.literal("crawl"), v.literal("clanWatch")),
    unused: v.number()
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const unused = Math.max(0, Math.floor(args.unused));
    if (!unused) return null;
    const day = dayKey(Date.now());
    const row = await ctx.db
      .query("clashCrawlerBudgets")
      .withIndex("by_day_and_job", (q) => q.eq("day", day).eq("job", args.job))
      .unique();
    if (row) await ctx.db.patch(row._id, { reserved: Math.max(0, row.reserved - unused), updatedAt: Date.now() });
    return null;
  }
});

/**
 * Hands out the next batch of due targets and immediately pushes their due time
 * forward, so an overlapping cron run picks up different tags.
 */
export const claimTargets = internalMutation({
  args: { limit: v.number(), leaseMs: v.number() },
  returns: v.array(v.object({
    id: v.id("clashCrawlTargets"),
    tag: v.string(),
    lastBattleTime: v.optional(v.number()),
    revisitSeconds: v.number(),
    tier: crawlTier,
    priority: v.number()
  })),
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = Math.min(Math.max(Math.floor(args.limit), 0), 50);
    const due: Array<Doc<"clashCrawlTargets">> = [];

    // Tier is the coarse service level; numeric priority decides which due
    // targets inside the bounded tier pool are claimed first.
    for (const tier of ["fixed", "featured", "community"] as const) {
      const candidates = await ctx.db
        .query("clashCrawlTargets")
        .withIndex("by_disabled_and_tier_and_next_due_at", (q) =>
          q.eq("disabled", false).eq("tier", tier).lte("nextDueAt", now)
        )
        .take(Math.min(500, Math.max(limit - due.length, 1) * 20));
      due.push(
        ...candidates
          .filter((target) => (target.expiresAt ?? 0) > now)
          .sort((left, right) => left.priority - right.priority || left.nextDueAt - right.nextDueAt)
          .slice(0, limit - due.length)
      );
      if (due.length >= limit) break;
    }

    for (const target of due) {
      await ctx.db.patch(target._id, { nextDueAt: now + args.leaseMs, leaseUntil: now + args.leaseMs });
    }

    return due.map((target) => ({
      id: target._id,
      tag: target.tag,
      lastBattleTime: target.lastBattleTime,
      revisitSeconds: target.revisitSeconds ?? 3 * 60 * 60,
      tier: target.tier ?? "community",
      priority: target.priority
    }));
  }
});

// --- Ingest ---------------------------------------------------------------

export const ingestBattles = internalMutation({
  args: {
    targetId: v.optional(v.id("clashCrawlTargets")),
    observations: v.array(observation),
    /** Seconds until this target is polled again. */
    revisitSeconds: v.number(),
    failed: v.optional(v.boolean())
  },
  returns: v.object({ battles: v.number(), observations: v.number() }),
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
          nextDueAt: now + (target.revisitSeconds ?? args.revisitSeconds) * 1000,
          leaseUntil: undefined,
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
        .query("clashSeenBattles")
        .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
        .unique();
      if (!seen) fresh.push(fingerprint);
    }
    if (!fresh.length) return { battles: 0, observations: 0 };

    const freshSet = new Set(fresh);
    const accepted = args.observations.filter((item) => freshSet.has(item.fingerprint));

    for (const fingerprint of fresh) {
      const time = accepted.find((item) => item.fingerprint === fingerprint)?.battleTime ?? now;
      await ctx.db.insert("clashSeenBattles", { fingerprint, battleTime: time });
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
      trophySum: number;
      trophySamples: number;
      arenaIds: Set<number>;
      arenaNames: Set<string>;
    };
    const deckDeltas = new Map<string, DeckDelta>();
    const cardDeltas = new Map<string, { day: number; mode: MetaMode; cardId: number; uses: number; wins: number }>();
    const towerDeltas = new Map<
      string,
      { day: number; mode: MetaMode; towerCardId: number; uses: number; wins: number }
    >();
    type MatchupDelta = {
      day: number;
      mode: MetaMode;
      deckHash: string;
      oppDeckHash: string;
      cardIds: number[];
      oppCardIds: number[];
      uses: number;
      wins: number;
    };
    const matchupDeltas = new Map<string, MatchupDelta>();

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
        crowns: 0,
        trophySum: 0,
        trophySamples: 0,
        arenaIds: new Set<number>(),
        arenaNames: new Set<string>()
      };
      deck.uses += 1;
      deck.wins += item.won ? 1 : 0;
      deck.crowns += item.crowns;
      if (item.trophies !== undefined) {
        deck.trophySum += item.trophies;
        deck.trophySamples += 1;
      }
      if (item.arenaId !== undefined) deck.arenaIds.add(item.arenaId);
      if (item.arenaName) deck.arenaNames.add(item.arenaName);
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

    // Each fresh battle contributes both ordered perspectives exactly once.
    // The parser normally guarantees two eight-card sides; keep the guard here
    // as well so malformed or future observations never pollute the matchup table.
    const observationsByBattle = new Map<string, DeckObservation[]>();
    for (const item of accepted) {
      const sides = observationsByBattle.get(item.fingerprint) ?? [];
      sides.push(item);
      observationsByBattle.set(item.fingerprint, sides);
    }
    for (const sides of observationsByBattle.values()) {
      if (sides.length !== 2) continue;
      const [left, right] = sides;
      if (!isKnownDeck(left.cardIds) || !isKnownDeck(right.cardIds)) continue;

      for (const [self, opponent] of [
        [left, right],
        [right, left]
      ] as const) {
        const day = dayKey(self.battleTime);
        const matchupKey = `${day}:${self.mode}:${self.deckHash}:${opponent.deckHash}`;
        const matchup = matchupDeltas.get(matchupKey) ?? {
          day,
          mode: self.mode as MetaMode,
          deckHash: self.deckHash,
          oppDeckHash: opponent.deckHash,
          cardIds: self.cardIds,
          oppCardIds: opponent.cardIds,
          uses: 0,
          wins: 0
        };
        matchup.uses += 1;
        matchup.wins += self.won ? 1 : 0;
        matchupDeltas.set(matchupKey, matchup);
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
          crowns: existing.crowns + delta.crowns,
          trophySum: (existing.trophySum ?? 0) + delta.trophySum,
          trophySamples: (existing.trophySamples ?? 0) + delta.trophySamples,
          arenaIds: [...new Set([...(existing.arenaIds ?? []), ...delta.arenaIds])],
          arenaNames: [...new Set([...(existing.arenaNames ?? []), ...delta.arenaNames])]
        });
      } else {
        await ctx.db.insert("deckStats", {
          ...delta,
          arenaIds: [...delta.arenaIds],
          arenaNames: [...delta.arenaNames]
        });
      }

      const candidate = await ctx.db
        .query("clashDeckRankingCandidates")
        .withIndex("by_mode_and_deck_hash", (q) => q.eq("mode", delta.mode).eq("deckHash", delta.deckHash))
        .unique();
      const buckets = currentRankingBuckets(candidate?.buckets ?? [], now);
      const bucket = buckets.find((item) => item.day === delta.day);
      if (bucket) {
        bucket.uses += delta.uses;
        bucket.wins += delta.wins;
        bucket.trophySum += delta.trophySum;
        bucket.trophySamples += delta.trophySamples;
        bucket.arenaIds = [...new Set([...bucket.arenaIds, ...delta.arenaIds])];
        bucket.arenaNames = [...new Set([...bucket.arenaNames, ...delta.arenaNames])];
      } else {
        buckets.push({
          day: delta.day,
          uses: delta.uses,
          wins: delta.wins,
          trophySum: delta.trophySum,
          trophySamples: delta.trophySamples,
          arenaIds: [...delta.arenaIds],
          arenaNames: [...delta.arenaNames]
        });
      }
      const materializedBuckets = currentRankingBuckets(buckets, now);
      const uses = rankingUses(materializedBuckets, dayKey(now));
      const values = {
        cardIds: delta.cardIds,
        evolutionIds: delta.evolutionIds,
        buckets: materializedBuckets,
        ...uses,
        materializedDay: dayKey(now),
        updatedAt: now
      };
      if (candidate) await ctx.db.patch(candidate._id, values);
      else {
        await ctx.db.insert("clashDeckRankingCandidates", {
          mode: delta.mode,
          deckHash: delta.deckHash,
          ...values
        });
      }
    }

    const totalsByMode = new Map<MetaMode, Map<number, number>>();
    for (const delta of deckDeltas.values()) {
      const days = totalsByMode.get(delta.mode) ?? new Map<number, number>();
      days.set(delta.day, (days.get(delta.day) ?? 0) + delta.uses);
      totalsByMode.set(delta.mode, days);
    }
    for (const [mode, dayTotals] of totalsByMode) {
      const total = await ctx.db
        .query("clashDeckRankingTotals")
        .withIndex("by_mode", (q) => q.eq("mode", mode))
        .unique();
      const buckets = currentRankingBuckets(
        (total?.buckets ?? []).map((bucket) => ({
          ...bucket,
          wins: 0,
          trophySum: 0,
          trophySamples: 0,
          arenaIds: [],
          arenaNames: []
        })),
        now
      );
      for (const [day, uses] of dayTotals) {
        const bucket = buckets.find((item) => item.day === day);
        if (bucket) bucket.uses += uses;
        else buckets.push({ day, uses, wins: 0, trophySum: 0, trophySamples: 0, arenaIds: [], arenaNames: [] });
      }
      const current = currentRankingBuckets(buckets, now);
      const values = {
        buckets: current.map(({ day, uses }) => ({ day, uses })),
        ...rankingUses(current, dayKey(now)),
        materializedDay: dayKey(now),
        updatedAt: now
      };
      if (total) await ctx.db.patch(total._id, values);
      else await ctx.db.insert("clashDeckRankingTotals", { mode, startedAt: now, ...values });
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

    for (const delta of matchupDeltas.values()) {
      const existing = await ctx.db
        .query("matchupStats")
        .withIndex("by_day_and_mode_and_deck_hash_and_opp_deck_hash", (q) =>
          q
            .eq("day", delta.day)
            .eq("mode", delta.mode)
            .eq("deckHash", delta.deckHash)
            .eq("oppDeckHash", delta.oppDeckHash)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          uses: existing.uses + delta.uses,
          wins: existing.wins + delta.wins
        });
      } else {
        await ctx.db.insert("matchupStats", delta);
      }
    }

    await bump(ctx, "battlesIngested", fresh.length);
    await bump(ctx, "observationsIngested", accepted.length);

    return { battles: fresh.length, observations: accepted.length };
  }
});

/**
 * Refreshes only the indexed upper-bound candidates that can still enter a
 * top-N board. Day rollover can only reduce a stale candidate's usage, so once
 * the indexed prefix is current, every row below it is provably unable to
 * outrank the published sample. Existing rankings remain in place while a
 * prefix is warming or being normalised; partial boards are never published.
 */
export const refreshRankings = internalMutation({
  args: { topN: v.number(), minUses: v.number() },
  returns: v.object({
    publishedBoards: v.number(),
    written: v.number(),
    normalized: v.number(),
    pendingBoards: v.number(),
    warmingBoards: v.number()
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const today = dayKey(now);
    const topN = Math.min(Math.max(Math.floor(args.topN), 1), 200);
    const refreshLimit = Math.max(topN + 1, RANKING_REFRESH_LIMIT);
    let publishedBoards = 0;
    let written = 0;
    let normalized = 0;
    let pendingBoards = 0;
    let warmingBoards = 0;

    for (const mode of ["ladder", "pathOfLegends", "challenge", "tournament", "clanWar"] as const) {
      const total = await ctx.db
        .query("clashDeckRankingTotals")
        .withIndex("by_mode", (q) => q.eq("mode", mode))
        .unique();
      if (!total) {
        warmingBoards += RANKING_WINDOWS.length;
        continue;
      }

      const totalBuckets = currentRankingBuckets(
        total.buckets.map((bucket) => ({
          ...bucket,
          wins: 0,
          trophySum: 0,
          trophySamples: 0,
          arenaIds: [],
          arenaNames: []
        })),
        now
      );
      const totalUses = rankingUses(totalBuckets, today);
      if (total.materializedDay !== today) {
        await ctx.db.patch(total._id, {
          buckets: totalBuckets.map(({ day, uses }) => ({ day, uses })),
          ...totalUses,
          materializedDay: today,
          updatedAt: now
        });
      }

      for (const windowDays of RANKING_WINDOWS) {
        const windowStart = dayStart(now) - (windowDays - 1) * 86_400_000;
        if (total.startedAt > windowStart) {
          warmingBoards += 1;
          continue;
        }

        const candidates = windowDays === 1
          ? await ctx.db
              .query("clashDeckRankingCandidates")
              .withIndex("by_mode_and_uses_1", (q) => q.eq("mode", mode))
              .order("desc")
              .take(refreshLimit)
          : await ctx.db
              .query("clashDeckRankingCandidates")
              .withIndex("by_mode_and_uses_7", (q) => q.eq("mode", mode))
              .order("desc")
              .take(refreshLimit);
        const stale = candidates.filter((candidate) => candidate.materializedDay !== today);
        if (stale.length) {
          for (const candidate of stale) {
            const buckets = currentRankingBuckets(candidate.buckets, now);
            await ctx.db.patch(candidate._id, {
              buckets,
              ...rankingUses(buckets, today),
              materializedDay: today
            });
          }
          normalized += stale.length;
          pendingBoards += 1;
          continue;
        }

        const totalUsesForWindow = windowDays === 1 ? totalUses.uses1 : totalUses.uses7;
        const ranked = candidates
          .map((candidate) => {
            const buckets = windowDays === 1
              ? candidate.buckets.filter((bucket) => bucket.day === today)
              : candidate.buckets;
            const uses = buckets.reduce((sum, bucket) => sum + bucket.uses, 0);
            const wins = buckets.reduce((sum, bucket) => sum + bucket.wins, 0);
            const trophySum = buckets.reduce((sum, bucket) => sum + bucket.trophySum, 0);
            const trophySamples = buckets.reduce((sum, bucket) => sum + bucket.trophySamples, 0);
            return {
              deckHash: candidate.deckHash,
              cardIds: candidate.cardIds,
              evolutionIds: candidate.evolutionIds,
              uses,
              wins,
              winRate: uses ? wins / uses : 0,
              usageRate: totalUsesForWindow ? uses / totalUsesForWindow : 0,
              ...(trophySamples ? { averageTrophies: trophySum / trophySamples, trophySamples } : {}),
              arenaIds: [...new Set(buckets.flatMap((bucket) => bucket.arenaIds))],
              arenaNames: [...new Set(buckets.flatMap((bucket) => bucket.arenaNames))]
            };
          })
          .filter((candidate) => candidate.uses >= Math.max(1, args.minUses))
          // Stable sort preserves the index's creation-time tiebreak for equal usage.
          .sort((left, right) => right.uses - left.uses)
          .slice(0, topN);

        const previous = await ctx.db
          .query("deckRankings")
          .withIndex("by_window_and_mode", (q) => q.eq("windowDays", windowDays).eq("mode", mode))
          .take(500);
        for (const row of previous) await ctx.db.delete(row._id);
        for (const [index, row] of ranked.entries()) {
          await ctx.db.insert("deckRankings", {
            ...row,
            windowDays,
            mode,
            rank: index + 1,
            computedAt: now,
            complete: true
          });
        }
        publishedBoards += 1;
        written += ranked.length;
      }
    }

    return { publishedBoards, written, normalized, pendingBoards, warmingBoards };
  }
});

// --- Retention ------------------------------------------------------------

/**
 * Deletes one batch and reports whether more remains, so the caller can keep
 * scheduling itself instead of blowing the transaction limit.
 */
export const pruneBatch = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), more: v.boolean() }),
  handler: async (ctx) => {
    const seenCutoff = Date.now() - SEEN_BATTLE_RETENTION_MS;
    const staleSeen = await ctx.db
      .query("clashSeenBattles")
      .withIndex("by_battle_time", (q) => q.lt("battleTime", seenCutoff))
      .take(256);
    for (const row of staleSeen) await ctx.db.delete(row._id);

    const dayCutoff = dayKey(Date.now() - RETENTION_DAYS * 86_400_000);
    const staleDecks = await ctx.db
      .query("deckStats")
      .withIndex("by_day", (q) => q.lt("day", dayCutoff))
      .take(256);
    for (const row of staleDecks) await ctx.db.delete(row._id);

    const staleMatchups = await ctx.db
      .query("matchupStats")
      .withIndex("by_day", (q) => q.lt("day", dayCutoff))
      .take(256);
    for (const row of staleMatchups) await ctx.db.delete(row._id);

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

    const staleCache = await ctx.db
      .query("apiCache")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", Date.now()))
      .take(256);
    for (const row of staleCache) await ctx.db.delete(row._id);

    const now = Date.now();
    const legacyTargets = await ctx.db
      .query("clashCrawlTargets")
      .withIndex("by_expires_at", (q) => q.eq("expiresAt", undefined))
      .take(256);
    for (const row of legacyTargets) {
      await ctx.db.patch(row._id, { disabled: true, expiresAt: now });
    }
    const expiredTargets = await ctx.db
      .query("clashCrawlTargets")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(256);
    for (const row of expiredTargets) await ctx.db.delete(row._id);

    const staleCandidates = await ctx.db
      .query("clashDeckRankingCandidates")
      .withIndex("by_updated_at", (q) => q.lt("updatedAt", now - RETENTION_DAYS * 86_400_000))
      .take(256);
    for (const row of staleCandidates) await ctx.db.delete(row._id);

    let staleRankings = 0;
    for (const windowDays of RANKING_WINDOWS) {
      for (const mode of ["ladder", "pathOfLegends", "challenge", "tournament", "clanWar"] as const) {
        const latest = await ctx.db
          .query("deckRankings")
          .withIndex("by_window_and_mode_and_computed_at", (q) =>
            q.eq("windowDays", windowDays).eq("mode", mode)
          )
          .order("desc")
          .first();
        if (!latest) continue;

        const superseded = await ctx.db
          .query("deckRankings")
          .withIndex("by_window_and_mode_and_computed_at", (q) =>
            q.eq("windowDays", windowDays).eq("mode", mode).lt("computedAt", latest.computedAt)
          )
          .take(256);
        for (const row of superseded) await ctx.db.delete(row._id);
        staleRankings += superseded.length;
      }
    }

    // A plain query streams oldest-first over the built-in by_creation_time
    // index, so an age cutoff prunes every profile evenly in bounded batches.
    const historyCutoff = Date.now() - PROFILE_HISTORY_RETENTION_MS;
    const staleHistoryRows = (await ctx.db.query("profileHistory").take(256)).filter(
      (row) => row._creationTime < historyCutoff
    );
    for (const row of staleHistoryRows) await ctx.db.delete(row._id);
    const staleHistory = staleHistoryRows.length;

    const logCutoff = now - 7 * 86_400_000;
    const staleTelemetry = await ctx.db
      .query("clashApiFetchTelemetry")
      .withIndex("by_bucket_start", (q) => q.lt("bucketStart", logCutoff))
      .take(256);
    for (const row of staleTelemetry) await ctx.db.delete(row._id);
    const staleLogs = await ctx.db
      .query("clashApiFetchLogs")
      .withIndex("by_fetched_at", (q) => q.lt("fetchedAt", logCutoff))
      .take(256);
    for (const row of staleLogs) await ctx.db.delete(row._id);

    const staleRuns = await ctx.db
      .query("clashPipelineRuns")
      .withIndex("by_started_at", (q) => q.lt("startedAt", logCutoff))
      .take(256);
    for (const row of staleRuns) await ctx.db.delete(row._id);

    const budgetCutoff = dayKey(now - 2 * 86_400_000);
    const staleBudgets = await ctx.db
      .query("clashCrawlerBudgets")
      .withIndex("by_day", (q) => q.lt("day", budgetCutoff))
      .take(32);
    for (const row of staleBudgets) await ctx.db.delete(row._id);

    const deleted =
      staleSeen.length +
      staleDecks.length +
      staleMatchups.length +
      staleCards.length +
      staleTowers.length +
      staleCache.length +
      expiredTargets.length +
      staleCandidates.length +
      staleRankings +
      staleHistory +
      staleTelemetry.length +
      staleLogs.length +
      staleRuns.length +
      staleBudgets.length;
    return { deleted, more: deleted > 0 || legacyTargets.length > 0 };
  }
});

// --- Run log --------------------------------------------------------------

export const startRun = internalMutation({
  args: { job: v.string() },
  returns: v.id("clashPipelineRuns"),
  handler: async (ctx, args) =>
    ctx.db.insert("clashPipelineRuns", { job: args.job, startedAt: Date.now(), ok: false })
});

export const finishRun = internalMutation({
  args: {
    id: v.id("clashPipelineRuns"),
    ok: v.boolean(),
    note: v.optional(v.string()),
    counters: v.optional(v.record(v.string(), v.number()))
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      ok: args.ok,
      note: args.note,
      counters: args.counters,
      finishedAt: Date.now()
    });
    return null;
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
  returns: v.object({
    now: v.number(),
    counters: v.record(v.string(), v.number()),
    due: v.object({ count: v.number(), capped: v.boolean() }),
    decksToday: v.object({ count: v.number(), capped: v.boolean() }),
    battlesToday: v.number(),
    apiCalls: v.object({ lastHour: v.number(), failures: v.number(), capped: v.boolean(), buckets: v.number() }),
    crawler: v.object({
      enabled: v.boolean(),
      clanWatchEnabled: v.boolean(),
      budgets: v.object({
        discover: v.object({ used: v.number(), limit: v.number() }),
        crawl: v.object({ used: v.number(), limit: v.number() }),
        clanWatch: v.object({ used: v.number(), limit: v.number() })
      })
    }),
    lastRuns: v.array(v.object({
      _id: v.id("clashPipelineRuns"),
      _creationTime: v.number(),
      job: v.string(),
      startedAt: v.number(),
      finishedAt: v.optional(v.number()),
      ok: v.boolean(),
      note: v.optional(v.string()),
      counters: v.optional(v.record(v.string(), v.number()))
    })),
    rankingsComputedAt: v.union(v.number(), v.null())
  }),
  handler: async (ctx) => {
    const counters = await ctx.db.query("clashPipelineCounters").take(20);
    const now = Date.now();

    const dueRows = await ctx.db
      .query("clashCrawlTargets")
      .withIndex("by_due", (q) => q.eq("disabled", false).lte("nextDueAt", now))
      .take(200);

    const recentTelemetry = await ctx.db
      .query("clashApiFetchTelemetry")
      .withIndex("by_bucket_start", (q) => q.gte("bucketStart", now - 60 * 60 * 1000))
      .take(500);
    const budgets = await ctx.db
      .query("clashCrawlerBudgets")
      .withIndex("by_day", (q) => q.eq("day", dayKey(now)))
      .take(3);
    const budgetUsed = (job: "discover" | "crawl" | "clanWatch") =>
      budgets.find((budget) => budget.job === job)?.reserved ?? 0;

    const today = dayKey(now);
    const decksToday = await ctx.db
      .query("deckStats")
      .withIndex("by_day", (q) => q.eq("day", today))
      .take(500);

    const lastRuns = await ctx.db.query("clashPipelineRuns").withIndex("by_started_at").order("desc").take(10);
    const rankings = await ctx.db
      .query("deckRankings")
      .withIndex("by_window_and_mode_and_rank", (q) => q.eq("windowDays", 7))
      .take(100);

    return {
      now,
      counters: Object.fromEntries(counters.map((row) => [row.name, row.value])),
      due: probe(dueRows, 200),
      decksToday: probe(decksToday, 500),
      battlesToday: decksToday.reduce((total, row) => total + row.uses, 0),
      apiCalls: {
        lastHour: recentTelemetry.reduce((total, row) => total + row.requests, 0),
        failures: recentTelemetry.reduce((total, row) => total + row.failures, 0),
        capped: recentTelemetry.length >= 500,
        buckets: recentTelemetry.length
      },
      crawler: {
        enabled: envEnabled("CLASH_CRAWLER_ENABLED"),
        clanWatchEnabled: envEnabled("CLASH_CRAWLER_ENABLED") && envEnabled("CLASH_CLAN_WATCH_ENABLED"),
        budgets: {
          discover: {
            used: budgetUsed("discover"),
            limit: envNumber("CLASH_DISCOVER_DAILY_REQUEST_BUDGET", 60)
          },
          crawl: {
            used: budgetUsed("crawl"),
            limit: envNumber("CLASH_CRAWL_DAILY_REQUEST_BUDGET", 4_000)
          },
          clanWatch: {
            used: budgetUsed("clanWatch"),
            limit: envNumber("CLASH_CLAN_WATCH_DAILY_REQUEST_BUDGET", 36)
          }
        }
      },
      lastRuns,
      rankingsComputedAt: rankings.find((ranking) => ranking.complete)?.computedAt ?? null
    };
  }
});

export const topDecks = query({
  args: { mode: metaMode, windowDays: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.object({
    windowDays: v.number(),
    decks: v.array(v.object({
      _id: v.id("deckRankings"),
      _creationTime: v.number(),
      windowDays: v.number(),
      mode: metaMode,
      rank: v.number(),
      deckHash: v.string(),
      cardIds: v.array(v.number()),
      evolutionIds: v.array(v.number()),
      uses: v.number(),
      wins: v.number(),
      winRate: v.number(),
      usageRate: v.number(),
      averageTrophies: v.optional(v.number()),
      trophySamples: v.optional(v.number()),
      arenaIds: v.optional(v.array(v.number())),
      arenaNames: v.optional(v.array(v.string())),
      computedAt: v.number(),
      complete: v.optional(v.boolean())
    }))
  }),
  handler: async (ctx, args) => {
    const windowDays = RANKING_WINDOWS.includes(args.windowDays as 1 | 7) ? args.windowDays! : 7;
    const rows = await ctx.db
      .query("deckRankings")
      .withIndex("by_window_and_mode_and_rank", (q) => q.eq("windowDays", windowDays).eq("mode", args.mode))
      .take(100);
    return { windowDays, decks: rows.filter((row) => row.complete).slice(0, Math.min(args.limit ?? 20, 100)) };
  }
});

const discoverySort = v.union(v.literal("rating"), v.literal("popularity"), v.literal("winRate"));
const discoveryDeck = v.object({
  deckHash: v.string(),
  rank: v.number(),
  cardIds: v.array(v.number()),
  evolutionIds: v.array(v.number()),
  uses: v.number(),
  wins: v.number(),
  winRate: v.number(),
  usageRate: v.number(),
  rating: v.number(),
  computedAt: v.number(),
  averageTrophies: v.union(v.number(), v.null()),
  trophySamples: v.number(),
  arenaIds: v.array(v.number()),
  arenaNames: v.array(v.string())
});

/** Wilson lower bound: conservative performance signal for uneven samples. */
function observedRating(wins: number, uses: number, usageRate: number, maxUsageRate: number) {
  if (!uses) return 0;
  const z = 1.96;
  const proportion = wins / uses;
  const denominator = 1 + (z * z) / uses;
  const centre = proportion + (z * z) / (2 * uses);
  const spread = z * Math.sqrt((proportion * (1 - proportion) + (z * z) / (4 * uses)) / uses);
  const lowerBound = (centre - spread) / denominator;
  const popularity = maxUsageRate ? Math.sqrt(usageRate / maxUsageRate) : 0;
  return Math.max(0, Math.min(1, lowerBound * 0.8 + popularity * 0.2));
}

/** Bounded search over the materialised top deck sample. */
export const discoverDecks = query({
  args: {
    mode: metaMode,
    windowDays: v.optional(v.number()),
    includeCardIds: v.optional(v.array(v.number())),
    excludeCardIds: v.optional(v.array(v.number())),
    minEvolutions: v.optional(v.number()),
    maxEvolutions: v.optional(v.number()),
    minTrophies: v.optional(v.number()),
    maxTrophies: v.optional(v.number()),
    arenaName: v.optional(v.string()),
    sort: v.optional(discoverySort),
    limit: v.optional(v.number())
  },
  returns: v.object({
    windowDays: v.number(),
    totalRanked: v.number(),
    matched: v.number(),
    computedAt: v.union(v.number(), v.null()),
    trophyCoverage: v.object({ decks: v.number(), samples: v.number() }),
    arenaCoverage: v.number(),
    trophyFilterApplied: v.boolean(),
    arenaFilterApplied: v.boolean(),
    decks: v.array(discoveryDeck)
  }),
  handler: async (ctx, args) => {
    const windowDays = RANKING_WINDOWS.includes(args.windowDays as 1 | 7) ? args.windowDays! : 7;
    const rows = await ctx.db
      .query("deckRankings")
      .withIndex("by_window_and_mode_and_rank", (q) => q.eq("windowDays", windowDays).eq("mode", args.mode))
      .take(100);
    const completeRows = rows.filter((row) => row.complete);
    const maxUsageRate = Math.max(0, ...completeRows.map((row) => row.usageRate));
    const trophyCoverage = {
      decks: completeRows.filter((row) => (row.trophySamples ?? 0) > 0).length,
      samples: completeRows.reduce((total, row) => total + (row.trophySamples ?? 0), 0)
    };
    const arenaCoverage = completeRows.filter((row) => (row.arenaNames?.length ?? 0) > 0).length;
    const wantsTrophies = args.minTrophies !== undefined || args.maxTrophies !== undefined;
    const normalizedArena = args.arenaName?.trim().toLowerCase() ?? "";
    const trophyFilterApplied = wantsTrophies && trophyCoverage.decks > 0;
    const arenaFilterApplied = Boolean(normalizedArena) && arenaCoverage > 0;
    const include = new Set(args.includeCardIds ?? []);
    const exclude = new Set(args.excludeCardIds ?? []);

    const decks = completeRows
      .map((row) => ({
        deckHash: row.deckHash,
        rank: row.rank,
        cardIds: row.cardIds,
        evolutionIds: row.evolutionIds,
        uses: row.uses,
        wins: row.wins,
        winRate: row.winRate,
        usageRate: row.usageRate,
        rating: observedRating(row.wins, row.uses, row.usageRate, maxUsageRate),
        computedAt: row.computedAt,
        averageTrophies: row.averageTrophies ?? null,
        trophySamples: row.trophySamples ?? 0,
        arenaIds: row.arenaIds ?? [],
        arenaNames: row.arenaNames ?? []
      }))
      .filter((row) => [...include].every((cardId) => row.cardIds.includes(cardId)))
      .filter((row) => [...exclude].every((cardId) => !row.cardIds.includes(cardId)))
      .filter((row) => row.evolutionIds.length >= Math.max(0, args.minEvolutions ?? 0))
      .filter((row) => row.evolutionIds.length <= Math.max(0, args.maxEvolutions ?? 8))
      .filter((row) => !trophyFilterApplied || (
        row.averageTrophies !== null &&
        row.averageTrophies >= (args.minTrophies ?? 0) &&
        row.averageTrophies <= (args.maxTrophies ?? Number.MAX_SAFE_INTEGER)
      ))
      .filter((row) => !arenaFilterApplied || row.arenaNames.some((name) => name.toLowerCase().includes(normalizedArena)));

    const sort = args.sort ?? "rating";
    decks.sort((left, right) => {
      if (sort === "popularity") return right.uses - left.uses || right.rating - left.rating;
      if (sort === "winRate") return right.winRate - left.winRate || right.uses - left.uses;
      return right.rating - left.rating || right.uses - left.uses;
    });

    return {
      windowDays,
      totalRanked: completeRows.length,
      matched: decks.length,
      computedAt: rows[0]?.computedAt ?? null,
      trophyCoverage,
      arenaCoverage,
      trophyFilterApplied,
      arenaFilterApplied,
      decks: decks.slice(0, Math.min(Math.max(args.limit ?? 100, 1), 100))
    };
  }
});

/**
 * Returns the strongest and weakest opponent decks for one deck over the
 * fixed seven-day matchup window. Pair rows are already ordered by the deck
 * being inspected, so each day is a bounded indexed read.
 */
export const deckMatchups = query({
  args: { deckHash: v.string() },
  returns: v.object({
    windowDays: v.number(),
    minUses: v.number(),
    best: v.array(matchupResult),
    worst: v.array(matchupResult)
  }),
  handler: async (ctx, args) => {
    const totals = new Map<
      string,
      { oppDeckHash: string; cardIds: number[]; uses: number; wins: number }
    >();

    for (const day of dayKeysBack(7)) {
      const rows = await ctx.db
        .query("matchupStats")
        .withIndex("by_day_and_deck_hash", (q) => q.eq("day", day).eq("deckHash", args.deckHash))
        .take(1000);

      for (const row of rows) {
        const entry = totals.get(row.oppDeckHash) ?? {
          oppDeckHash: row.oppDeckHash,
          cardIds: row.oppCardIds,
          uses: 0,
          wins: 0
        };
        entry.uses += row.uses;
        entry.wins += row.wins;
        totals.set(row.oppDeckHash, entry);
      }
    }

    const eligible = [...totals.values()]
      .filter((entry) => entry.uses >= MIN_MATCHUP_USES)
      .map((entry) => ({
        ...entry,
        winRate: entry.wins / entry.uses
      }));
    const byWinRate = (left: (typeof eligible)[number], right: (typeof eligible)[number]) =>
      right.winRate - left.winRate || right.uses - left.uses;

    return {
      windowDays: 7,
      minUses: MIN_MATCHUP_USES,
      best: [...eligible].sort(byWinRate).slice(0, 3),
      worst: [...eligible].sort((left, right) => byWinRate(right, left)).slice(0, 3)
    };
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
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (ctx, args) => {
    const expected = process.env.BETA_ADMIN_KEY;
    if (!expected || args.key !== expected) return { ok: false as const, message: "Invalid admin key." };

    const tag = args.tag.trim().toUpperCase().replace(/^#/, "");
    if (!/^[0289PYLQGRJCUV]{3,15}$/.test(tag)) return { ok: false as const, message: "That is not a valid player tag." };

    const existing = await ctx.db
      .query("clashCrawlTargets")
      .withIndex("by_tag", (q) => q.eq("tag", tag))
      .unique();

    if (existing) {
      const now = Date.now();
      await ctx.db.patch(existing._id, {
        tier: "fixed",
        priority: 0,
        revisitSeconds: TARGET_FIXED_REVISIT_SECONDS,
        lastDiscoveredAt: now,
        expiresAt: now + 90 * 86_400_000,
        nextDueAt: now,
        disabled: false,
        consecutiveFailures: 0
      });
      return { ok: true as const, message: `#${tag} moved to the front of the queue.` };
    }

    const now = Date.now();
    await ctx.db.insert("clashCrawlTargets", {
      tag,
      source: "manual",
      tier: "fixed",
      priority: 0,
      revisitSeconds: TARGET_FIXED_REVISIT_SECONDS,
      lastDiscoveredAt: now,
      expiresAt: now + 90 * 86_400_000,
      nextDueAt: now,
      consecutiveFailures: 0,
      disabled: false
    });
    await bump(ctx, "crawlTargets", 1);
    return { ok: true as const, message: `#${tag} queued.` };
  }
});

export type PipelineRun = Doc<"clashPipelineRuns">;
