/** Local cache and migration layer for ClashCrown personalization. */

import { readVersioned, safeGet, safeRemove, safeSet, writeVersioned } from "@statsconnect/site-storage";

/** Single source of truth for profile-tag normalization across personalization code. */
export function normalizeTag(tag: string): string {
  return tag.replace(/^#/, "").trim().toUpperCase();
}

const STORAGE_KEY = "clash-crown:personalization";
const STORAGE_VERSION = 2;
const LEGACY_FLAT_KEY = "clash-crown:personalization:v2";
const LEGACY_RECENTS_KEY = "clash-crown:recent-profiles";
const LEGACY_FAVORITES_KEY = "clash-crown:favorite-profiles";

export type ProfileKind = "players" | "clans";

export const MAX_RECENTS = 12;

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
  const raw = safeGet(key);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Accepts the pre-envelope flat v2 payload so existing users migrate in place. */
function parseFlatV2(value: unknown): LocalPersonalizationState | undefined {
  if (!isObject(value) || typeof value.deviceSecret !== "string" || value.deviceSecret.length < 40) {
    return undefined;
  }
  const preferences = isObject(value.preferences) ? value.preferences : {};
  return {
    deviceSecret: value.deviceSecret,
    migratedToSync: value.migratedToSync === true,
    profiles: Array.isArray(value.profiles) ? value.profiles.filter(isTracked) : [],
    recents: Array.isArray(value.recents) ? value.recents.filter(isRecent).slice(0, MAX_RECENTS) : [],
    preferences: {
      chestAlerts: preferences.chestAlerts === true,
      progressionAlerts: preferences.progressionAlerts === true,
      warAlerts: preferences.warAlerts === true,
    },
  };
}

function parseEnvelope(value: unknown): LocalPersonalizationState | undefined {
  if (!isObject(value)) return undefined;
  const flat = parseFlatV2(value);
  if (!flat) return undefined;
  // The old flat shape carried `version` alongside the data; ignore it.
  return flat;
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

export function emptyLocalPersonalizationState(): LocalPersonalizationState {
  return { deviceSecret: "", migratedToSync: false, profiles: [], recents: [], preferences: defaultAlertPreferences };
}

export function readLocalPersonalization(): LocalPersonalizationState {
  if (typeof window === "undefined") return emptyLocalPersonalizationState();

  const enveloped = readVersioned(safeGet(STORAGE_KEY), STORAGE_VERSION, parseEnvelope);
  if (enveloped) return enveloped;

  // One-time re-wrap of the pre-envelope flat v2 payload.
  try {
    const raw = window.localStorage.getItem(LEGACY_FLAT_KEY);
    if (raw !== null) {
      const legacyState = parseFlatV2(JSON.parse(raw));
      if (legacyState) {
        writeLocalPersonalization(legacyState);
        safeRemove(LEGACY_FLAT_KEY);
        return legacyState;
      }
    }
  } catch {
    // Fall through to legacy-key migration below.
  }

  const migrated = migrateLegacy(randomSecret());
  writeLocalPersonalization(migrated);
  return migrated;
}

export function writeLocalPersonalization(state: LocalPersonalizationState) {
  safeSet(STORAGE_KEY, writeVersioned(STORAGE_VERSION, state));
}

export function replaceLocalDevice(): LocalPersonalizationState {
  const state: LocalPersonalizationState = {
    ...emptyLocalPersonalizationState(),
    deviceSecret: randomSecret(),
  };
  writeLocalPersonalization(state);
  return state;
}
