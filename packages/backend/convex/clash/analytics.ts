import { v } from "convex/values";
import { query } from "../_generated/server";
import { metaMode } from "./schema";
import { dayKeysBack, type MetaMode } from "./lib/battles";

const MAX_WINDOW_DAYS = 7;
const CARD_DAY_LIMIT = 400;
const TOWER_DAY_LIMIT = 100;
const DECK_DAY_LIMIT = 750;
const DETAIL_DECK_DAY_LIMIT = 600;
const DETAIL_MATCHUP_DAY_LIMIT = 600;

const trendPoint = v.object({
  day: v.number(),
  uses: v.number(),
  wins: v.number(),
  winRate: v.union(v.number(), v.null()),
  usageRate: v.number()
});

const entityTrend = v.object({
  id: v.string(),
  uses: v.number(),
  wins: v.number(),
  winRate: v.number(),
  usageRate: v.number(),
  points: v.array(trendPoint)
});

const mover = v.object({
  cardId: v.number(),
  recentUses: v.number(),
  previousUses: v.number(),
  recentWinRate: v.number(),
  previousWinRate: v.number(),
  usageDelta: v.number(),
  winRateDelta: v.number()
});

const tierRow = v.object({
  cardId: v.number(),
  tier: v.union(v.literal("S"), v.literal("A"), v.literal("B"), v.literal("C")),
  uses: v.number(),
  wins: v.number(),
  winRate: v.number(),
  usageRate: v.number(),
  score: v.number()
});

const deckSummary = v.object({
  deckHash: v.string(),
  cardIds: v.array(v.number()),
  evolutionIds: v.array(v.number()),
  uses: v.number(),
  wins: v.number(),
  winRate: v.number(),
  usageRate: v.number()
});

const archetype = v.object({
  id: v.string(),
  coreCardIds: v.array(v.number()),
  uses: v.number(),
  wins: v.number(),
  winRate: v.number(),
  usageRate: v.number(),
  usageDelta: v.number(),
  points: v.array(trendPoint),
  representativeDecks: v.array(deckSummary)
});

type Aggregate = { uses: number; wins: number };
type DeckAggregate = Aggregate & { deckHash: string; cardIds: number[]; evolutionIds: number[] };

function windowDays(value: number | undefined) {
  return Math.min(Math.max(Math.round(value ?? MAX_WINDOW_DAYS), 1), MAX_WINDOW_DAYS);
}

function add<K>(target: Map<K, Aggregate>, key: K, uses: number, wins: number) {
  const current = target.get(key) ?? { uses: 0, wins: 0 };
  current.uses += uses;
  current.wins += wins;
  target.set(key, current);
}

function wilsonLowerBound(wins: number, uses: number) {
  if (!uses) return 0;
  const z = 1.96;
  const rate = wins / uses;
  const denominator = 1 + (z * z) / uses;
  const centre = rate + (z * z) / (2 * uses);
  const margin = z * Math.sqrt((rate * (1 - rate) + (z * z) / (4 * uses)) / uses);
  return (centre - margin) / denominator;
}

function pointsFor(
  days: number[],
  daily: Map<number, Map<string, Aggregate>>,
  id: string,
  denominators: Map<number, number>
) {
  return [...days].reverse().map((day) => {
    const aggregate = daily.get(day)?.get(id) ?? { uses: 0, wins: 0 };
    return {
      day,
      uses: aggregate.uses,
      wins: aggregate.wins,
      winRate: aggregate.uses ? aggregate.wins / aggregate.uses : null,
      usageRate: denominators.get(day) ? aggregate.uses / denominators.get(day)! : 0
    };
  });
}

export const cardReport = query({
  args: { mode: metaMode, windowDays: v.optional(v.number()) },
  returns: v.object({
    windowDays: v.number(),
    recentDecks: v.number(),
    previousDecks: v.number(),
    minTierUses: v.number(),
    minMoverUses: v.number(),
    truncated: v.boolean(),
    tiers: v.array(tierRow),
    risers: v.array(mover),
    decliners: v.array(mover),
    trends: v.array(entityTrend),
    methodology: v.string()
  }),
  handler: async (ctx, args) => {
    const daysPerPeriod = windowDays(args.windowDays);
    const days = dayKeysBack(daysPerPeriod * 2);
    const daily = new Map<number, Map<string, Aggregate>>();
    const denominators = new Map<number, number>();
    const recent = new Map<number, Aggregate>();
    const previous = new Map<number, Aggregate>();
    let truncated = false;

    for (const [dayIndex, day] of days.entries()) {
      const rows = await ctx.db
        .query("cardStats")
        .withIndex("by_day_and_mode_and_card", (q) => q.eq("day", day).eq("mode", args.mode))
        .take(CARD_DAY_LIMIT);
      truncated ||= rows.length === CARD_DAY_LIMIT;
      const dayMap = new Map<string, Aggregate>();
      for (const row of rows) {
        add(dayMap, String(row.cardId), row.uses, row.wins);
        add(dayIndex < daysPerPeriod ? recent : previous, row.cardId, row.uses, row.wins);
      }
      daily.set(day, dayMap);
      denominators.set(day, rows.reduce((sum, row) => sum + row.uses, 0) / 8);
    }

    const recentDecks = days.slice(0, daysPerPeriod).reduce((sum, day) => sum + (denominators.get(day) ?? 0), 0);
    const previousDecks = days.slice(daysPerPeriod).reduce((sum, day) => sum + (denominators.get(day) ?? 0), 0);
    const minTierUses = Math.max(25, Math.ceil(recentDecks * 0.0025));
    const minMoverUses = Math.max(25, Math.ceil(Math.min(recentDecks, previousDecks) * 0.0025));

    const eligible = [...recent.entries()]
      .filter(([, value]) => value.uses >= minTierUses)
      .map(([cardId, value]) => ({
        cardId,
        uses: value.uses,
        wins: value.wins,
        winRate: value.wins / value.uses,
        usageRate: recentDecks ? value.uses / recentDecks : 0,
        score: wilsonLowerBound(value.wins, value.uses)
      }))
      .sort((left, right) => right.score - left.score || right.uses - left.uses || left.cardId - right.cardId);

    const tiers = eligible.map((row, index) => {
      const percentile = eligible.length ? index / eligible.length : 1;
      const tier = percentile < 0.1 ? "S" : percentile < 0.3 ? "A" : percentile < 0.7 ? "B" : "C";
      return { ...row, tier } as const;
    });

    const movers = [...recent.entries()]
      .flatMap(([cardId, current]) => {
        const prior = previous.get(cardId);
        if (!prior || current.uses < minMoverUses || prior.uses < minMoverUses || !recentDecks || !previousDecks) return [];
        return [{
          cardId,
          recentUses: current.uses,
          previousUses: prior.uses,
          recentWinRate: current.wins / current.uses,
          previousWinRate: prior.wins / prior.uses,
          usageDelta: current.uses / recentDecks - prior.uses / previousDecks,
          winRateDelta: current.wins / current.uses - prior.wins / prior.uses
        }];
      });

    const topIds = [...recent.entries()]
      .sort((left, right) => right[1].uses - left[1].uses || left[0] - right[0])
      .slice(0, 6)
      .map(([cardId]) => cardId);

    return {
      windowDays: daysPerPeriod,
      recentDecks,
      previousDecks,
      minTierUses,
      minMoverUses,
      truncated,
      tiers,
      risers: movers.filter((row) => row.usageDelta > 0).sort((a, b) => b.usageDelta - a.usageDelta).slice(0, 6),
      decliners: movers.filter((row) => row.usageDelta < 0).sort((a, b) => a.usageDelta - b.usageDelta).slice(0, 6),
      trends: topIds.map((cardId) => {
        const total = recent.get(cardId)!;
        return {
          id: String(cardId),
          uses: total.uses,
          wins: total.wins,
          winRate: total.wins / total.uses,
          usageRate: recentDecks ? total.uses / recentDecks : 0,
          points: pointsFor(days.slice(0, daysPerPeriod), daily, String(cardId), denominators)
        };
      }),
      methodology: "Eligible cards meet the displayed sample floor. Cards are ordered by the 95% Wilson lower confidence bound of win rate, then split by percentile: top 10% S, next 20% A, next 40% B, remainder C. Movers compare equal adjacent windows and must clear the sample floor in both."
    };
  }
});

export const towerReport = query({
  args: { mode: metaMode, windowDays: v.optional(v.number()) },
  returns: v.object({ windowDays: v.number(), decksObserved: v.number(), truncated: v.boolean(), trends: v.array(entityTrend) }),
  handler: async (ctx, args) => {
    const daysCount = windowDays(args.windowDays);
    const days = dayKeysBack(daysCount);
    const totals = new Map<number, Aggregate>();
    const daily = new Map<number, Map<string, Aggregate>>();
    const denominators = new Map<number, number>();
    let truncated = false;

    for (const day of days) {
      const rows = await ctx.db
        .query("towerStats")
        .withIndex("by_day_and_mode_and_tower", (q) => q.eq("day", day).eq("mode", args.mode))
        .take(TOWER_DAY_LIMIT);
      truncated ||= rows.length === TOWER_DAY_LIMIT;
      const dayMap = new Map<string, Aggregate>();
      for (const row of rows) {
        add(totals, row.towerCardId, row.uses, row.wins);
        add(dayMap, String(row.towerCardId), row.uses, row.wins);
      }
      daily.set(day, dayMap);
      denominators.set(day, rows.reduce((sum, row) => sum + row.uses, 0));
    }
    const decksObserved = [...denominators.values()].reduce((sum, value) => sum + value, 0);
    return {
      windowDays: daysCount,
      decksObserved,
      truncated,
      trends: [...totals.entries()]
        .sort((left, right) => right[1].uses - left[1].uses || left[0] - right[0])
        .map(([towerCardId, total]) => ({
          id: String(towerCardId),
          uses: total.uses,
          wins: total.wins,
          winRate: total.wins / total.uses,
          usageRate: decksObserved ? total.uses / decksObserved : 0,
          points: pointsFor(days, daily, String(towerCardId), denominators)
        }))
    };
  }
});

function distinctivePair(cardIds: number[], frequencies: Map<number, number>) {
  return [...new Set(cardIds)]
    .sort((left, right) => (frequencies.get(left) ?? 0) - (frequencies.get(right) ?? 0) || left - right)
    .slice(0, 2)
    .sort((left, right) => left - right);
}

export const deckReport = query({
  args: { mode: metaMode, windowDays: v.optional(v.number()) },
  returns: v.object({
    windowDays: v.number(),
    recentDecks: v.number(),
    previousDecks: v.number(),
    minArchetypeUses: v.number(),
    truncated: v.boolean(),
    deckTrends: v.array(entityTrend),
    archetypes: v.array(archetype),
    methodology: v.string()
  }),
  handler: async (ctx, args) => {
    const daysPerPeriod = windowDays(args.windowDays);
    const days = dayKeysBack(daysPerPeriod * 2);
    const recentDecks = new Map<string, DeckAggregate>();
    const previousDecks = new Map<string, DeckAggregate>();
    const dailyDecks = new Map<number, Map<string, Aggregate>>();
    const denominators = new Map<number, number>();
    const frequencies = new Map<number, number>();
    let truncated = false;

    for (const [dayIndex, day] of days.entries()) {
      const rows = await ctx.db
        .query("deckStats")
        .withIndex("by_day_and_mode", (q) => q.eq("day", day).eq("mode", args.mode))
        .take(DECK_DAY_LIMIT);
      truncated ||= rows.length === DECK_DAY_LIMIT;
      const target = dayIndex < daysPerPeriod ? recentDecks : previousDecks;
      const dayMap = new Map<string, Aggregate>();
      for (const row of rows) {
        const current = target.get(row.deckHash) ?? {
          deckHash: row.deckHash,
          cardIds: row.cardIds,
          evolutionIds: row.evolutionIds,
          uses: 0,
          wins: 0
        };
        current.uses += row.uses;
        current.wins += row.wins;
        target.set(row.deckHash, current);
        add(dayMap, row.deckHash, row.uses, row.wins);
        for (const cardId of row.cardIds) frequencies.set(cardId, (frequencies.get(cardId) ?? 0) + row.uses);
      }
      dailyDecks.set(day, dayMap);
      denominators.set(day, rows.reduce((sum, row) => sum + row.uses, 0));
    }

    const recentTotal = days.slice(0, daysPerPeriod).reduce((sum, day) => sum + (denominators.get(day) ?? 0), 0);
    const previousTotal = days.slice(daysPerPeriod).reduce((sum, day) => sum + (denominators.get(day) ?? 0), 0);
    const minArchetypeUses = Math.max(10, Math.ceil(recentTotal * 0.0025));
    const recentArchetypes = new Map<string, { coreCardIds: number[]; uses: number; wins: number; decks: DeckAggregate[] }>();
    const previousArchetypes = new Map<string, Aggregate>();
    const dailyArchetypes = new Map<number, Map<string, Aggregate>>();

    for (const [deckHash, deck] of recentDecks) {
      const coreCardIds = distinctivePair(deck.cardIds, frequencies);
      if (coreCardIds.length !== 2) continue;
      const id = coreCardIds.join("-");
      const current = recentArchetypes.get(id) ?? { coreCardIds, uses: 0, wins: 0, decks: [] };
      current.uses += deck.uses;
      current.wins += deck.wins;
      current.decks.push(deck);
      recentArchetypes.set(id, current);
      for (const day of days.slice(0, daysPerPeriod)) {
        const dayDeck = dailyDecks.get(day)?.get(deckHash);
        if (!dayDeck) continue;
        const dayMap = dailyArchetypes.get(day) ?? new Map<string, Aggregate>();
        add(dayMap, id, dayDeck.uses, dayDeck.wins);
        dailyArchetypes.set(day, dayMap);
      }
    }

    for (const deck of previousDecks.values()) {
      const coreCardIds = distinctivePair(deck.cardIds, frequencies);
      if (coreCardIds.length === 2) add(previousArchetypes, coreCardIds.join("-"), deck.uses, deck.wins);
    }

    const deckTrends = [...recentDecks.values()]
      .sort((left, right) => right.uses - left.uses || left.deckHash.localeCompare(right.deckHash))
      .slice(0, 6)
      .map((deck) => ({
        id: deck.deckHash,
        uses: deck.uses,
        wins: deck.wins,
        winRate: deck.wins / deck.uses,
        usageRate: recentTotal ? deck.uses / recentTotal : 0,
        points: pointsFor(days.slice(0, daysPerPeriod), dailyDecks, deck.deckHash, denominators)
      }));

    const archetypes = [...recentArchetypes.entries()]
      .filter(([, value]) => value.uses >= minArchetypeUses)
      .sort((left, right) => right[1].uses - left[1].uses || left[0].localeCompare(right[0]))
      .slice(0, 16)
      .map(([id, value]) => ({
        id,
        coreCardIds: value.coreCardIds,
        uses: value.uses,
        wins: value.wins,
        winRate: value.wins / value.uses,
        usageRate: recentTotal ? value.uses / recentTotal : 0,
        usageDelta: previousTotal
          ? value.uses / recentTotal - (previousArchetypes.get(id)?.uses ?? 0) / previousTotal
          : 0,
        points: pointsFor(days.slice(0, daysPerPeriod), dailyArchetypes, id, denominators),
        representativeDecks: value.decks
          .sort((left, right) => right.uses - left.uses || left.deckHash.localeCompare(right.deckHash))
          .slice(0, 4)
          .map((deck) => ({
            deckHash: deck.deckHash,
            cardIds: deck.cardIds,
            evolutionIds: deck.evolutionIds,
            uses: deck.uses,
            wins: deck.wins,
            winRate: deck.wins / deck.uses,
            usageRate: recentTotal ? deck.uses / recentTotal : 0
          }))
      }));

    return {
      windowDays: daysPerPeriod,
      recentDecks: recentTotal,
      previousDecks: previousTotal,
      minArchetypeUses,
      truncated,
      deckTrends,
      archetypes,
      methodology: "An archetype is a deterministic core pair, not an editorial label. For each deck, choose the two least-common cards across the selected sample (card id breaks ties), then group decks sharing that pair. This favors the cards that distinguish a deck from generic support cards."
    };
  }
});

const relatedCard = v.object({ cardId: v.number(), uses: v.number(), wins: v.number(), winRate: v.number() });

export const cardDetail = query({
  args: { cardId: v.number(), mode: metaMode, windowDays: v.optional(v.number()) },
  returns: v.object({
    windowDays: v.number(),
    minPairUses: v.number(),
    minCounterUses: v.number(),
    truncated: v.boolean(),
    trend: v.array(trendPoint),
    topDecks: v.array(deckSummary),
    pairings: v.array(relatedCard),
    counters: v.array(relatedCard),
    evolution: v.union(v.null(), v.object({
      uses: v.number(),
      wins: v.number(),
      winRate: v.number(),
      baseUses: v.number(),
      baseWins: v.number(),
      baseWinRate: v.union(v.number(), v.null())
    }))
  }),
  handler: async (ctx, args) => {
    const daysCount = windowDays(args.windowDays);
    const days = dayKeysBack(daysCount);
    const trend: Array<{ day: number; uses: number; wins: number; winRate: number | null; usageRate: number }> = [];
    const pairings = new Map<number, Aggregate>();
    const counters = new Map<number, Aggregate>();
    let evolvedUses = 0;
    let evolvedWins = 0;
    let baseUses = 0;
    let baseWins = 0;
    let truncated = false;

    for (const day of [...days].reverse()) {
      const cardRows = await ctx.db
        .query("cardStats")
        .withIndex("by_day_and_mode_and_card", (q) => q.eq("day", day).eq("mode", args.mode).eq("cardId", args.cardId))
        .take(1);
      const allCards = await ctx.db
        .query("cardStats")
        .withIndex("by_day_and_mode_and_card", (q) => q.eq("day", day).eq("mode", args.mode))
        .take(CARD_DAY_LIMIT);
      truncated ||= allCards.length === CARD_DAY_LIMIT;
      const card = cardRows[0];
      const decksObserved = allCards.reduce((sum, row) => sum + row.uses, 0) / 8;
      trend.push({
        day,
        uses: card?.uses ?? 0,
        wins: card?.wins ?? 0,
        winRate: card?.uses ? card.wins / card.uses : null,
        usageRate: decksObserved && card ? card.uses / decksObserved : 0
      });

      const deckRows = await ctx.db
        .query("deckStats")
        .withIndex("by_day_and_mode", (q) => q.eq("day", day).eq("mode", args.mode))
        .take(DETAIL_DECK_DAY_LIMIT);
      truncated ||= deckRows.length === DETAIL_DECK_DAY_LIMIT;
      for (const row of deckRows) {
        if (!row.cardIds.includes(args.cardId)) continue;
        for (const otherId of row.cardIds) {
          if (otherId !== args.cardId) add(pairings, otherId, row.uses, row.wins);
        }
        if (row.evolutionIds.includes(args.cardId)) {
          evolvedUses += row.uses;
          evolvedWins += row.wins;
        } else {
          baseUses += row.uses;
          baseWins += row.wins;
        }
      }

      const matchupRows = await ctx.db
        .query("matchupStats")
        .withIndex("by_day_and_mode", (q) => q.eq("day", day).eq("mode", args.mode as MetaMode))
        .take(DETAIL_MATCHUP_DAY_LIMIT);
      truncated ||= matchupRows.length === DETAIL_MATCHUP_DAY_LIMIT;
      for (const row of matchupRows) {
        if (!row.cardIds.includes(args.cardId)) continue;
        for (const opponentId of new Set(row.oppCardIds)) {
          // Store wins from the opponent-card perspective, so a high rate means
          // that card beat decks containing the card being inspected.
          add(counters, opponentId, row.uses, row.uses - row.wins);
        }
      }
    }

    const minPairUses = 10;
    const minCounterUses = 10;
    const rankings = await ctx.db
      .query("deckRankings")
      .withIndex("by_window_and_mode_and_rank", (q) => q.eq("windowDays", daysCount).eq("mode", args.mode))
      .take(100);

    return {
      windowDays: daysCount,
      minPairUses,
      minCounterUses,
      truncated,
      trend,
      topDecks: rankings
        .filter((row) => row.complete)
        .filter((row) => row.cardIds.includes(args.cardId))
        .slice(0, 6)
        .map((row) => ({
          deckHash: row.deckHash,
          cardIds: row.cardIds,
          evolutionIds: row.evolutionIds,
          uses: row.uses,
          wins: row.wins,
          winRate: row.winRate,
          usageRate: row.usageRate
        })),
      pairings: [...pairings.entries()]
        .filter(([, value]) => value.uses >= minPairUses)
        .sort((left, right) => right[1].uses - left[1].uses || left[0] - right[0])
        .slice(0, 8)
        .map(([cardId, value]) => ({ cardId, uses: value.uses, wins: value.wins, winRate: value.wins / value.uses })),
      counters: [...counters.entries()]
        .filter(([cardId, value]) => cardId !== args.cardId && value.uses >= minCounterUses)
        .sort((left, right) => right[1].wins / right[1].uses - left[1].wins / left[1].uses || right[1].uses - left[1].uses)
        .slice(0, 8)
        .map(([cardId, value]) => ({ cardId, uses: value.uses, wins: value.wins, winRate: value.wins / value.uses })),
      evolution: evolvedUses
        ? {
            uses: evolvedUses,
            wins: evolvedWins,
            winRate: evolvedWins / evolvedUses,
            baseUses,
            baseWins,
            baseWinRate: baseUses ? baseWins / baseUses : null
          }
        : null
    };
  }
});
