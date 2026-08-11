/**
 * Profiles this browser has opened, newest first.
 *
 * The directory in Convex answers "who is called X"; this answers "who am I".
 * A player only has to type their tag once — after that their own name is in
 * the search box before they finish typing it, and usually before they type
 * anything at all.
 */

const STORAGE_KEY = "clash-crown:recent-profiles";
const MAX_ENTRIES = 8;

export type RecentProfile = {
  kind: "players" | "clans";
  tag: string;
  name: string;
  clan?: string;
  visitedAt: number;
  favorite?: boolean;
};

export type FavoriteProfile = {
  kind: "players";
  tag: string;
  name: string;
  clan?: string;
};

const FAVORITES_KEY = "clash-crown:favorite-profiles";

function isRecent(value: unknown): value is RecentProfile {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    (item.kind === "players" || item.kind === "clans") &&
    typeof item.tag === "string" &&
    typeof item.name === "string" &&
    typeof item.visitedAt === "number" &&
    (item.clan === undefined || typeof item.clan === "string") &&
    (item.favorite === undefined || typeof item.favorite === "boolean")
  );
}

function isFavorite(value: unknown): value is FavoriteProfile {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    item.kind === "players" &&
    typeof item.tag === "string" &&
    typeof item.name === "string" &&
    (item.clan === undefined || typeof item.clan === "string")
  );
}

function sameProfile(left: { kind: string; tag: string }, right: { kind: string; tag: string }) {
  return left.kind === right.kind && normalizeTag(left.tag) === normalizeTag(right.tag);
}

function normalizeTag(tag: string) {
  return tag.replace(/^#/, "").toUpperCase();
}

export function readRecentProfiles(): RecentProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecent) : [];
  } catch {
    // Private browsing, a quota error, or somebody else's key. Not worth a throw.
    return [];
  }
}

/** Returns the new list so a caller holding React state does not have to re-read. */
export function rememberProfile(profile: Omit<RecentProfile, "visitedAt">): RecentProfile[] {
  if (typeof window === "undefined") return [];
  const entry: RecentProfile = { ...profile, visitedAt: Date.now() };
  const existing = readRecentProfiles().find((item) => sameProfile(item, entry));
  const nextEntry: RecentProfile = {
    ...entry,
    tag: normalizeTag(entry.tag),
    clan: entry.clan ?? existing?.clan
  };
  const next = [nextEntry, ...readRecentProfiles().filter((item) => !sameProfile(item, entry))].slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Nothing to do — recents are a convenience, not state we own.
  }
  return next;
}

export function readFavoriteProfiles(): FavoriteProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const stored = Array.isArray(parsed) ? parsed.filter(isFavorite) : [];
    const legacy: FavoriteProfile[] = readRecentProfiles()
      .filter((item) => item.kind === "players" && item.favorite === true)
      .map(({ tag, name, clan }) => ({ kind: "players", tag, name, clan }));
    const merged = [...stored, ...legacy];
    return merged.filter((profile, index) => merged.findIndex((item) => sameProfile(item, profile)) === index);
  } catch {
    return [];
  }
}

/** Stars or unstars a player and returns the complete favorite list. */
export function toggleFavorite(profile: Omit<FavoriteProfile, "kind"> & { kind?: "players" }): FavoriteProfile[] {
  if (typeof window === "undefined") return [];
  const normalized: FavoriteProfile = { kind: "players", tag: normalizeTag(profile.tag), name: profile.name, clan: profile.clan };
  const favorites = readFavoriteProfiles();
  const alreadyFavorite = favorites.some((item) => sameProfile(item, normalized));
  const next = alreadyFavorite
    ? favorites.filter((item) => !sameProfile(item, normalized))
    : [normalized, ...favorites];

  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  } catch {
    // Nothing to do — favorites are a convenience, not state we own.
  }

  rememberProfile({ ...normalized });
  return next;
}

export function forgetProfiles() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See above.
  }
}
