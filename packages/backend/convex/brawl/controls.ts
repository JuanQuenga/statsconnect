export const HOUR_MS = 60 * 60 * 1_000;
export const TELEMETRY_BUCKET_MS = 5 * 60 * 1_000;

export function envSeconds(
  environment: Record<string, string | undefined>,
  names: readonly string[],
  fallback: number,
): number {
  for (const name of names) {
    const configured = Number(environment[name]);
    if (Number.isFinite(configured) && configured > 0) return configured;
  }
  return fallback;
}

export function envEnabled(value: string | undefined, fallback = true): boolean {
  if (value === undefined) return fallback;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

export function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), minimum), maximum);
}

export function hourBucket(timestamp: number): number {
  return Math.floor(timestamp / HOUR_MS) * HOUR_MS;
}

export function telemetryBucket(timestamp: number): number {
  return Math.floor(timestamp / TELEMETRY_BUCKET_MS) * TELEMETRY_BUCKET_MS;
}

export function adaptivePollDelayMs(
  baseMs: number,
  consecutiveEmptyPolls: number,
  priority: number,
): number {
  const emptyMultiplier = 2 ** Math.min(Math.max(consecutiveEmptyPolls, 0), 3);
  const priorityMultiplier = priority < 100 ? 1 : priority < 1_000 ? 1.5 : 2;
  return Math.min(Math.round(baseMs * emptyMultiplier * priorityMultiplier), 6 * HOUR_MS);
}

export function lookupExpiry(
  source: "ranking" | "club" | "lookup" | "manual",
  createdAt: number,
  explicitExpiry?: number,
): number | undefined {
  if (source !== "lookup") return undefined;
  return explicitExpiry ?? createdAt + 24 * HOUR_MS;
}
