/** Local cache and migration layer for ClashCrown personalization. */

const STORAGE_KEY = "clash-crown:personalization:v2";
const LEGACY_RECENTS_KEY = "clash-crown:recent-profiles";
const LEGACY_FAVORITES_KEY = "clash-crown:favorite-profiles";
const MAX_RECENTS = 12;

export type ProfileKind = "players" | "clans";

export type RecentProfile = {
  kind: ProfileKind;
  tag: string;
  name: string;
  clan?: string;
  visitedAt: number;
  favorite?: boolean;
};

export type TrackedProfile = {
  kind: ProfileKind;
  tag: string;
  name: string;
  clan?: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
};

export type FavoriteProfile = {
  kind: "players";
  tag: string;
  name: string;
  clan?: string;
};

export type AlertPreferences = {
  chestAlerts: boolean;
  progressionAlerts: boolean;
  warAlerts: boolean;
};

export type LocalPersonalizationState = {
  version: 2;
  deviceSecret: string;
  migratedToSync: boolean;
  profiles: TrackedProfile[];
  recents: RecentProfile[];
  preferences: AlertPreferences;
};

export const defaultAlertPreferences: AlertPreferences = {
  chestAlerts: false,
  progressionAlerts: false,
  warAlerts: false,
};

function normalizeTag(tag: string) {
  return tag.replace(/^#/, "").trim().toUpperCase();
}

function profileKey(profile: Pick<RecentProfile, "kind" | "tag">) {
  return `${profile.kind}:${normalizeTag(profile.tag)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRecent(value: unknown): value is RecentProfile {
  if (!isObject(value)) return false;
  return (
    (value.kind === "players" || value.kind === "clans") &&
    typeof value.tag === "string" &&
    typeof value.name === "string" &&
    typeof value.visitedAt === "number" &&
    (value.clan === undefined || typeof value.clan === "string") &&
    (value.favorite === undefined || typeof value.favorite === "boolean")
  );
}

function isFavorite(value: unknown): value is FavoriteProfile {
  if (!isObject(value)) return false;
  return value.kind === "players" && typeof value.tag === "string" && typeof value.name === "string" &&
    (value.clan === undefined || typeof value.clan === "string");
}

function isTracked(value: unknown): value is TrackedProfile {
  if (!isObject(value)) return false;
  return (
    (value.kind === "players" || value.kind === "clans") &&
    typeof value.tag === "string" &&
    typeof value.name === "string" &&
    typeof value.isDefault === "boolean" &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number" &&
    (value.clan === undefined || typeof value.clan === "string")
  );
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function parseArray(key: string): unknown[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function migrateLegacy(deviceSecret: string): LocalPersonalizationState {
  const now = Date.now();
  const recents = parseArray(LEGACY_RECENTS_KEY).filter(isRecent);
  const favorites = parseArray(LEGACY_FAVORITES_KEY).filter(isFavorite);
  const legacyFavorites = recents
    .filter((recent) => recent.kind === "players" && recent.favorite)
    .map(({ tag, name, clan }) => ({ kind: "players" as const, tag, name, clan }));
  const merged = [...favorites, ...legacyFavorites];
  const profiles = merged
    .filter((profile, index) => merged.findIndex((candidate) => profileKey(candidate) === profileKey(profile)) === index)
    .map((profile) => ({ ...profile, tag: normalizeTag(profile.tag), isDefault: false, createdAt: now, updatedAt: now }));
  return {
    version: 2,
    deviceSecret,
    migratedToSync: false,
    profiles,
    recents: recents
      .map((recent) => ({ ...recent, tag: normalizeTag(recent.tag) }))
      .sort((left, right) => right.visitedAt - left.visitedAt)
      .slice(0, MAX_RECENTS),
    preferences: defaultAlertPreferences,
  };
}

export function readLocalPersonalization(): LocalPersonalizationState {
  if (typeof window === "undefined") {
    return { version: 2, deviceSecret: "", migratedToSync: false, profiles: [], recents: [], preferences: defaultAlertPreferences };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isObject(parsed) && parsed.version === 2 && typeof parsed.deviceSecret === "string" && parsed.deviceSecret.length >= 40) {
      const preferences = isObject(parsed.preferences) ? parsed.preferences : {};
      return {
        version: 2,
        deviceSecret: parsed.deviceSecret,
        migratedToSync: parsed.migratedToSync === true,
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles.filter(isTracked) : [],
        recents: Array.isArray(parsed.recents) ? parsed.recents.filter(isRecent).slice(0, MAX_RECENTS) : [],
        preferences: {
          chestAlerts: preferences.chestAlerts === true,
          progressionAlerts: preferences.progressionAlerts === true,
          warAlerts: preferences.warAlerts === true,
        },
      };
    }
  } catch {
    // A corrupt or unavailable cache should not prevent the app from working.
  }
  const migrated = migrateLegacy(randomSecret());
  writeLocalPersonalization(migrated);
  return migrated;
}

export function writeLocalPersonalization(state: LocalPersonalizationState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The in-memory provider remains usable when storage is unavailable.
  }
}

export function replaceLocalDevice(): LocalPersonalizationState {
  const state: LocalPersonalizationState = {
    version: 2,
    deviceSecret: randomSecret(),
    migratedToSync: false,
    profiles: [],
    recents: [],
    preferences: defaultAlertPreferences,
  };
  writeLocalPersonalization(state);
  return state;
}
