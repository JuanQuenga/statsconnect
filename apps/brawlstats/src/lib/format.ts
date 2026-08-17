export function stripSupercellColorTags(value: string): string {
  return value.replace(/<\/?c(?:[0-9a-f]{1,8})?>/gi, "");
}

export function trophies(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("en-US");
}

export function readableMode(mode?: string | null) {
  return String(mode || "Unknown mode")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function normalizeTag(value: string) {
  const tag = value.trim().toUpperCase().replace(/^#/, "");
  if (!/^[0289PYLQGRJCUV]{3,15}$/.test(tag)) return null;
  return `#${tag}`;
}

export function apiDate(value?: string | null) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
}

export function relativeEnd(value?: string | null) {
  const end = apiDate(value);
  if (!end) return "Rotation active";
  const minutes = Math.max(0, Math.floor((end.getTime() - Date.now()) / 60000));
  const hours = Math.floor(minutes / 60);
  return `Ends in ${hours ? `${hours}h ` : ""}${minutes % 60}m`;
}

export function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

export function trophyBucket(trophiesValue: number): "0-499" | "500-999" | "1000+" {
  if (trophiesValue >= 1000) return "1000+";
  if (trophiesValue >= 500) return "500-999";
  return "0-499";
}

export const MIN_META_PICKS = 25;
