/**
 * Read-side reconstruction of the "all" trophy-bucket view.
 *
 * Ingest stores one row per concrete trophy bucket; the buckets partition every
 * observation, so summing them reproduces the historical "all" rows exactly.
 */

export const TROPHY_BUCKETS = ["0-499", "500-999", "1000+"] as const;

export type TrophyBucketFilter = "all" | (typeof TROPHY_BUCKETS)[number];

/** The bucket rows that make up a requested filter. */
export function bucketBreakdown(bucket: TrophyBucketFilter): TrophyBucketFilter[] {
  return bucket === "all" ? [...TROPHY_BUCKETS] : [bucket];
}

/**
 * Split a read budget across bucket queries so a reconstructed "all" view
 * reads about the same number of rows as the single "all" query it replaces.
 */
export function perBucketLimit(totalLimit: number, buckets: number): number {
  if (buckets <= 1) return Math.max(1, totalLimit);
  return Math.max(1, Math.ceil(totalLimit / buckets));
}

/**
 * Sums rows that share a natural key, merging the first occurrence with every
 * later duplicate. Read paths use this to collapse per-bucket rows back into
 * the single "all" row the API has always returned.
 */
export function groupSum<Row>(
  rows: Row[],
  keyOf: (row: Row) => string,
  combine: (current: Row, row: Row) => Row,
): Row[] {
  const grouped = new Map<string, Row>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = grouped.get(key);
    grouped.set(key, current ? combine(current, row) : row);
  }
  return [...grouped.values()];
}

export function combineStatRows<Row extends { wins: number; losses: number; picks: number; starPlayer: number }>(
  current: Row,
  row: Row,
): Row {
  return {
    ...current,
    wins: current.wins + row.wins,
    losses: current.losses + row.losses,
    picks: current.picks + row.picks,
    starPlayer: current.starPlayer + row.starPlayer,
  };
}

export function combineTeamRows<Row extends { wins: number; losses: number; picks: number }>(
  current: Row,
  row: Row,
): Row {
  return {
    ...current,
    wins: current.wins + row.wins,
    losses: current.losses + row.losses,
    picks: current.picks + row.picks,
  };
}
