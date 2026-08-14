export type RefreshCadence = "active" | "warm" | "cold";
export type SchedulingWindow = RefreshCadence | "lookup";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const schedulingWindows: Readonly<
  Record<SchedulingWindow, Readonly<{ minMs: number; maxMs: number }>>
> = {
  active: { minMs: 25 * MINUTE, maxMs: 35 * MINUTE },
  warm: { minMs: 105 * MINUTE, maxMs: 135 * MINUTE },
  cold: { minMs: 6 * HOUR, maxMs: 12 * HOUR },
  lookup: { minMs: DAY, maxMs: 3 * DAY },
};

function stableFraction(key: string): number {
  let hash = 2_166_136_261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 0xffff_ffff;
}

/** Deterministic jitter spreads due work without changing on every retry. */
export function scheduledAt(
  window: SchedulingWindow,
  key: string,
  from: number,
): number {
  const range = schedulingWindows[window];
  const delay = range.minMs + (range.maxMs - range.minMs) * stableFraction(key);
  return from + Math.round(delay);
}

export function lookupExpiresAt(key: string, from: number): number {
  return scheduledAt("lookup", key, from);
}

export function refreshCadenceFor(options: {
  watcherCount: number;
  lastActivityAt: number;
  now: number;
}): RefreshCadence {
  if (options.watcherCount > 0) return "active";
  const inactivity = Math.max(0, options.now - options.lastActivityAt);
  if (inactivity <= 12 * HOUR) return "active";
  if (inactivity <= 7 * DAY) return "warm";
  return "cold";
}
