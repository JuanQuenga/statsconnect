import {
  CARD_SUMMARY_PAIRS_PER_TICK,
  composeCardCounters,
  composeCardEvolution,
  composeCardPairings,
  composeCardTrend,
  composeCardTruncated,
  dayStartMs,
  planCardSummaryPairs,
  topPartners,
  type CardDaySummary,
} from "./summaryPolicy.ts";

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}: expected ${right}, received ${left}`);
}

function summary(overrides: Partial<CardDaySummary>): CardDaySummary {
  return {
    day: 20260901,
    uses: 0,
    wins: 0,
    decksObserved: 0,
    pairings: [],
    counters: [],
    evolvedUses: 0,
    evolvedWins: 0,
    baseUses: 0,
    baseWins: 0,
    truncated: false,
    ...overrides,
  };
}

// A served cardDetail request reads exactly one summary per requested day.
// Composing seven of them must reproduce the live per-day aggregation.
const summaries = [
  summary({
    day: 20260826,
    uses: 90,
    wins: 45,
    decksObserved: 800,
    pairings: [
      { cardId: 2, uses: 60, wins: 30 },
      { cardId: 3, uses: 4, wins: 2 },
    ],
    counters: [{ cardId: 9, uses: 50, wins: 20 }],
    evolvedUses: 30,
    evolvedWins: 18,
    baseUses: 60,
    baseWins: 27,
  }),
  summary({
    day: 20260827,
    uses: 110,
    wins: 66,
    decksObserved: 1_200,
    pairings: [{ cardId: 2, uses: 70, wins: 35 }],
    counters: [{ cardId: 9, uses: 40, wins: 10 }, { cardId: 8, uses: 12, wins: 2 }],
    truncated: true,
  }),
];

deepEqual(
  composeCardTrend(summaries),
  [
    { day: 20260826, uses: 90, wins: 45, winRate: 0.5, usageRate: 90 / 800 },
    { day: 20260827, uses: 110, wins: 66, winRate: 0.6, usageRate: 110 / 1_200 },
  ],
  "trend points merge one-to-one per day, oldest first",
);

// The 4-use pairing stays under the sample floor even after summing; the
// 130-use pairing crosses it, exactly like the live query's summed map.
deepEqual(
  composeCardPairings(summaries),
  [{ cardId: 2, uses: 130, wins: 65, winRate: 0.5 }],
  "pairings sum across days before applying the sample floor",
);

// Counters keep the opponent-perspective wins and the counter ordering.
deepEqual(
  composeCardCounters(summaries, 7),
  [
    { cardId: 9, uses: 90, wins: 30, winRate: 30 / 90 },
    { cardId: 8, uses: 12, wins: 2, winRate: 2 / 12 },
  ],
  "counters sum across days, drop the inspected card, order by win rate",
);

deepEqual(
  composeCardEvolution(summaries),
  { uses: 30, wins: 18, winRate: 0.6, baseUses: 60, baseWins: 27, baseWinRate: 0.45 },
  "evolution totals sum across days",
);
equal(composeCardTruncated(summaries), true, "truncation flags propagate from any day");
equal(composeCardEvolution([summary({})]), null, "no evolution uses yields null");

// Per-day partner lists stay bounded so one summary document stays small.
equal(topPartners([{ cardId: 1, uses: 5, wins: 1 }], 0).length, 0, "entry cap applies");
deepEqual(
  topPartners([{ cardId: 2, uses: 9, wins: 1 }, { cardId: 1, uses: 9, wins: 1 }]),
  [{ cardId: 1, uses: 9, wins: 1 }, { cardId: 2, uses: 9, wins: 1 }],
  "ties break by card id",
);

// Cron tick planning: at most three pairs, freshest day first, missing before
// stale within the same day, so the backfill finishes in bounded passes.
const now = dayStartMs(20260901) + 3 * 60 * 60 * 1000;
const planned = planCardSummaryPairs(
  [
    { mode: "ladder", day: 20260826, lastComputedAt: now - 90 * 60 * 1000 },
    { mode: "ladder", day: 20260901, lastComputedAt: now - 5 * 60 * 60 * 1000 },
    { mode: "pathOfLegends", day: 20260901 },
    { mode: "pathOfLegends", day: 20260831, lastComputedAt: now - 5 * 60 * 60 * 1000 },
    { mode: "challenge", day: 20260901, lastComputedAt: now - 60 * 60 * 1000 },
  ],
  now,
);
equal(planned.length, CARD_SUMMARY_PAIRS_PER_TICK, "a tick plans a bounded number of pairs");
deepEqual(
  planned.map((pair) => `${pair.mode}:${pair.day}:${pair.reason}`),
  [
    "pathOfLegends:20260901:missing",
    "ladder:20260901:stale",
    "pathOfLegends:20260831:stale",
  ],
  "today's pairs come first, missing before stale, fresh pairs are skipped",
);

console.log("ok - card summary composition, bounds, and cron pair planning");
