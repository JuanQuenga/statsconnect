/**
 * The Clash Royale API returns timestamps in ISO-8601 *basic* format
 * (`20260725T140000.000Z`), which `new Date()` cannot parse directly.
 */
export function parseApiDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? undefined : fallback;
  }
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatApiDate(value?: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const date = parseApiDate(value);
  if (!date) return value ?? "—";
  return new Intl.DateTimeFormat("en", options).format(date);
}

export function relativeTime(value?: string) {
  const date = parseApiDate(value);
  if (!date) return "—";
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
