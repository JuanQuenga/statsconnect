import {
  BACKGROUND_CRON_ENV,
  backgroundCronEnabled,
  rollupScheduleIsConsistent,
  rollupWindowsForCron,
} from "./cronPolicy.ts";

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

// Production-only guard: default stays enabled so prod needs no env change,
// and dev deployments opt out with one variable.
equal(backgroundCronEnabled({}), true, "missing env defaults to enabled");
equal(backgroundCronEnabled({ [BACKGROUND_CRON_ENV]: "1" }), true, "explicit 1 stays enabled");
equal(backgroundCronEnabled({ [BACKGROUND_CRON_ENV]: "true" }), true, "true stays enabled");
equal(backgroundCronEnabled({ [BACKGROUND_CRON_ENV]: " 0 " }), false, "0 with spaces disables");
equal(backgroundCronEnabled({ [BACKGROUND_CRON_ENV]: "false" }), false, "false disables");
equal(backgroundCronEnabled({ [BACKGROUND_CRON_ENV]: "off" }), false, "off disables");
equal(backgroundCronEnabled({ [BACKGROUND_CRON_ENV]: "no" }), false, "no disables");
equal(backgroundCronEnabled({ [BACKGROUND_CRON_ENV]: "2" }), true, "unknown values stay enabled");

// Scheduling: the fast and full rollup invocations split the ranking windows
// without gaps and the full run aligns on the fast cadence.
deepEqual(rollupWindowsForCron("fast"), [1], "fast rollup recomputes only the 1-day window");
deepEqual(rollupWindowsForCron("full"), [7], "full rollup recomputes only the 7-day window");
equal(rollupScheduleIsConsistent(), true, "rollup schedule covers every window and aligns");

console.log("ok - cron policy guard and rollup schedule");
