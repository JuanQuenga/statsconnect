/**
 * Shared, dependency-free policy for the heavy background pipeline crons.
 *
 * Crons run on every deployment that pushes this tree, including short-lived
 * dev deployments. The crawl/rollup jobs are the expensive ones, so they check
 * this policy at the top of each action and become a no-op when disabled. The
 * default is enabled so production never needs an env change; dev deployments
 * opt out with BACKGROUND_CRON_ENABLED=0.
 */

export const BACKGROUND_CRON_ENV = "BACKGROUND_CRON_ENABLED";

const DISABLED_VALUES = new Set(["0", "false", "off", "no"]);

export function backgroundCronEnabled(env: Record<string, string | undefined>): boolean {
  const value = env[BACKGROUND_CRON_ENV];
  if (value === undefined) return true;
  return !DISABLED_VALUES.has(value.trim().toLowerCase());
}

/**
 * Deck rankings are rebuilt from per-day deckStats aggregates, so the 7-day
 * window re-reads seven days of rows on every run. Splitting the windows keeps
 * the 1-day board fresh on the existing 30-minute cadence while the expensive
 * 7-day scan drops to a sixth of that frequency.
 */
export const ROLLUP_ALL_WINDOWS = [1, 7] as const;
export const ROLLUP_FAST_INTERVAL_MINUTES = 30;
export const ROLLUP_FULL_INTERVAL_MINUTES = 360;

export type RollupCronKind = "fast" | "full";

/** Windows one cron invocation recomputes. Union across kinds covers all. */
export function rollupWindowsForCron(kind: RollupCronKind): number[] {
  return kind === "fast" ? [1] : [7];
}

/** Coarse validity so scheduling mistakes fail a test instead of the bill. */
export function rollupScheduleIsConsistent(): boolean {
  const union = new Set([
    ...rollupWindowsForCron("fast"),
    ...rollupWindowsForCron("full"),
  ]);
  const declared = new Set<number>(ROLLUP_ALL_WINDOWS);
  const same = union.size === declared.size && [...union].every((value) => declared.has(value));
  return (
    same &&
    ROLLUP_FULL_INTERVAL_MINUTES >= ROLLUP_FAST_INTERVAL_MINUTES &&
    ROLLUP_FULL_INTERVAL_MINUTES % ROLLUP_FAST_INTERVAL_MINUTES === 0
  );
}
