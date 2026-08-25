/**
 * Versioned localStorage envelope.
 *
 * Every value is stored as `{ v, data }`. When the shape a caller persists
 * changes, bumping `version` makes old payloads parse as `undefined` instead
 * of crashing on missing fields, so readers fall back to defaults and the
 * next write replaces the stale shape.
 */

export function readVersioned<T>(
  raw: string | null,
  version: number,
  parse: (data: unknown) => T | undefined,
): T | undefined {
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { v?: unknown }).v !== version
    ) {
      return undefined;
    }
    return parse((parsed as { data: unknown }).data);
  } catch {
    return undefined;
  }
}

export function writeVersioned(version: number, data: unknown): string {
  return JSON.stringify({ v: version, data });
}
