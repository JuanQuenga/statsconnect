/**
 * Pure policy for materialised card-detail summaries.
 *
 * `cardDetail` used to re-read up to ~1,600 aggregate rows per requested day
 * (cardStats + deckStats + matchupStats) on every page view. The rollup cron
 * now writes one bounded summary per (mode, cardId, day), so a served request
 * reads exactly one summary per day plus the deck rankings. Days freeze once
 * they pass, so only recent days ever need re-materialisation.
 */

/** Mirrors the live per-day read caps in analytics.ts so values match exactly. */
export const CARD_DAY_LIMIT = 400;
export const DETAIL_DECK_DAY_LIMIT = 600;
export const DETAIL_MATCHUP_DAY_LIMIT = 600;

/**
 * Per-day partner lists are truncated by uses so one summary document stays
 * small. 128 covers effectively every co-occurrence observed per card per day;
 * the summed top-8 output is unaffected unless a day exceeds the cap.
 */
export const SUMMARY_ENTRY_CAP = 128;

/** Rolling freshness window for volatile (today/yesterday) summaries. */
export const CARD_SUMMARY_REFRESH_MS = 4 * 60 * 60 * 1000;
export const CARD_SUMMARY_REFRESH_ENV = "CLASH_CARD_SUMMARY_REFRESH_MS";
/**
 * A summary computed this long after its day ended is final and is not
 * refreshed on a timer again; a late battle for that day reopens it instead.
 * Without this every day in the seven-day window was re-materialised every
 * refresh window, rewriting ~120 multi-KB docs each time.
 */
export const CARD_SUMMARY_FREEZE_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
/** Maximum (mode, day) pairs one rollup tick materialises. */
export const CARD_SUMMARY_PAIRS_PER_TICK = 3;
/** How many summary docs one materialisation may write. */
export const CARD_SUMMARY_WRITE_LIMIT = 600;

export const MIN_PAIR_USES = 10;
export const MIN_COUNTER_USES = 10;

export type SummaryPartner = { cardId: number; uses: number; wins: number };

export type CardDaySummary = {
  day: number;
  uses: number;
  wins: number;
  decksObserved: number;
  pairings: SummaryPartner[];
  counters: SummaryPartner[];
  evolvedUses: number;
  evolvedWins: number;
  baseUses: number;
  baseWins: number;
  truncated: boolean;
};

export type TrendPoint = {
  day: number;
  uses: number;
  wins: number;
  winRate: number | null;
  usageRate: number;
};

export type RelatedCardStat = { cardId: number; uses: number; wins: number; winRate: number };

export type CardEvolution = {
  uses: number;
  wins: number;
  winRate: number;
  baseUses: number;
  baseWins: number;
  baseWinRate: number | null;
};

/**
 * How stale a summary may be before the cron refreshes it. Passing the day
 * lets a summary computed after that day froze stay fresh forever.
 */
export function cardSummaryStale(
  lastComputedAt: number | undefined,
  now: number,
  refreshMs: number = CARD_SUMMARY_REFRESH_MS,
  day?: number,
): boolean {
  if (lastComputedAt === undefined) return true;
  if (day !== undefined && lastComputedAt >= cardSummaryFreezeAt(day)) return false;
  return now - lastComputedAt >= Math.max(60_000, refreshMs);
}

export function refreshMsFromEnv(env: Record<string, string | undefined>): number {
  const parsed = Number(env[CARD_SUMMARY_REFRESH_ENV]);
  return Number.isFinite(parsed) && parsed >= 60_000 ? parsed : CARD_SUMMARY_REFRESH_MS;
}

export type SummaryPair<M extends string = string> = {
  mode: M;
  day: number;
  lastComputedAt?: number;
};
export type PlannedPair<M extends string = string> = SummaryPair<M> & {
  reason: "stale" | "missing";
};

/**
 * When a day's summary becomes final. Ingesting a battle for that day after
 * this point clears its marker (see ingestBattles) so the day is rebuilt.
 */
export function cardSummaryFreezeAt(day: number): number {
  return dayStartMs(day) + DAY_MS + CARD_SUMMARY_FREEZE_MS;
}

/** UTC midnight of a `YYYYMMDD` day bucket, the inverse of dayKey(). */
export function dayStartMs(day: number): number {
  const text = String(day);
  return Date.parse(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00Z`);
}

/**
 * Picks the bounded set of (mode, day) pairs one cron tick materialises.
 * Today first, then yesterday, then missing backfill days, so the freshest
 * data lands before historical backfill within one tick's budget.
 */
export function planCardSummaryPairs<M extends string>(
  pairs: SummaryPair<M>[],
  now: number,
  limit: number = CARD_SUMMARY_PAIRS_PER_TICK,
  refreshMs: number = CARD_SUMMARY_REFRESH_MS,
): PlannedPair<M>[] {
  const rank = (day: number) => {
    const age = now - dayStartMs(day);
    if (age >= 0 && age < DAY_MS) return 0;
    if (age >= DAY_MS && age < 2 * DAY_MS) return 1;
    return 2;
  };
  const stale = pairs
    .filter((pair) => cardSummaryStale(pair.lastComputedAt, now, refreshMs, pair.day))
    .map((pair) => ({
      ...pair,
      reason: pair.lastComputedAt === undefined ? ("missing" as const) : ("stale" as const),
    }));
  return stale
    .sort((left, right) =>
      rank(left.day) - rank(right.day) ||
      (left.lastComputedAt ?? 0) - (right.lastComputedAt ?? 0),
    )
    .slice(0, Math.max(0, limit));
}

/** Truncate a per-day partner map to the bounded, most-used entries. */
export function topPartners(
  entries: Iterable<SummaryPartner>,
  cap: number = SUMMARY_ENTRY_CAP,
): SummaryPartner[] {
  return [...entries]
    .sort((left, right) => right.uses - left.uses || left.cardId - right.cardId)
    .slice(0, Math.max(0, cap));
}

function samePartners(left: SummaryPartner[], right: SummaryPartner[]): boolean {
  return left.length === right.length && left.every((partner, index) =>
    partner.cardId === right[index].cardId &&
    partner.uses === right[index].uses &&
    partner.wins === right[index].wins
  );
}

/** True when a stored summary already holds these values, so the write can be skipped. */
export function cardSummaryUnchanged(stored: CardDaySummary, next: CardDaySummary): boolean {
  return (
    stored.uses === next.uses &&
    stored.wins === next.wins &&
    stored.decksObserved === next.decksObserved &&
    stored.evolvedUses === next.evolvedUses &&
    stored.evolvedWins === next.evolvedWins &&
    stored.baseUses === next.baseUses &&
    stored.baseWins === next.baseWins &&
    stored.truncated === next.truncated &&
    samePartners(stored.pairings, next.pairings) &&
    samePartners(stored.counters, next.counters)
  );
}

function sumPartners(
  summaries: CardDaySummary[],
  pick: (summary: CardDaySummary) => SummaryPartner[],
): Map<number, SummaryPartner> {
  const totals = new Map<number, SummaryPartner>();
  for (const summary of summaries) {
    for (const partner of pick(summary)) {
      const current = totals.get(partner.cardId) ?? { cardId: partner.cardId, uses: 0, wins: 0 };
      current.uses += partner.uses;
      current.wins += partner.wins;
      totals.set(partner.cardId, current);
    }
  }
  return totals;
}

export function composeCardTrend(summaries: CardDaySummary[]): TrendPoint[] {
  return summaries.map((summary) => ({
    day: summary.day,
    uses: summary.uses,
    wins: summary.wins,
    winRate: summary.uses ? summary.wins / summary.uses : null,
    usageRate: summary.decksObserved ? summary.uses / summary.decksObserved : 0,
  }));
}

export function composeCardPairings(summaries: CardDaySummary[]): RelatedCardStat[] {
  return [...sumPartners(summaries, (summary) => summary.pairings).values()]
    .filter((partner) => partner.uses >= MIN_PAIR_USES)
    .sort((left, right) => right.uses - left.uses || left.cardId - right.cardId)
    .slice(0, 8)
    .map((partner) => ({ ...partner, winRate: partner.wins / partner.uses }));
}

export function composeCardCounters(
  summaries: CardDaySummary[],
  cardId: number,
): RelatedCardStat[] {
  return [...sumPartners(summaries, (summary) => summary.counters).values()]
    .filter((partner) => partner.cardId !== cardId && partner.uses >= MIN_COUNTER_USES)
    .sort((left, right) =>
      right.wins / right.uses - left.wins / left.uses || right.uses - left.uses,
    )
    .slice(0, 8)
    .map((partner) => ({ ...partner, winRate: partner.wins / partner.uses }));
}

export function composeCardEvolution(summaries: CardDaySummary[]): CardEvolution | null {
  const totals = summaries.reduce(
    (acc, summary) => ({
      evolvedUses: acc.evolvedUses + summary.evolvedUses,
      evolvedWins: acc.evolvedWins + summary.evolvedWins,
      baseUses: acc.baseUses + summary.baseUses,
      baseWins: acc.baseWins + summary.baseWins,
    }),
    { evolvedUses: 0, evolvedWins: 0, baseUses: 0, baseWins: 0 },
  );
  if (!totals.evolvedUses) return null;
  return {
    uses: totals.evolvedUses,
    wins: totals.evolvedWins,
    winRate: totals.evolvedWins / totals.evolvedUses,
    baseUses: totals.baseUses,
    baseWins: totals.baseWins,
    baseWinRate: totals.baseUses ? totals.baseWins / totals.baseUses : null,
  };
}

export function composeCardTruncated(summaries: CardDaySummary[]): boolean {
  return summaries.some((summary) => summary.truncated);
}
