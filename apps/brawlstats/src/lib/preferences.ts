import { useSyncExternalStore } from "react";
import { removeConnectedProfile, saveConnectedProfile } from "@statsconnect/auth";

export const supportedLocales = ["en", "es", "de", "fr", "pt", "ja", "ko"] as const;
export type Locale = (typeof supportedLocales)[number];

export type SavedProfile = {
  tag: string;
  name?: string;
  iconId?: number;
  trophies?: number;
  savedAt: number;
};

export type Preferences = {
  locale: Locale;
  alertsEnabled: boolean;
  savedProfiles: SavedProfile[];
  recentProfiles: SavedProfile[];
};

const STORAGE_KEY = "brawlstats.preferences.v1";
const fallbackPreferences: Preferences = {
  locale: "en",
  alertsEnabled: false,
  savedProfiles: [],
  recentProfiles: [],
};

let cache: Preferences | null = null;
const listeners = new Set<() => void>();

function cleanTag(value: string): string {
  return value.trim().toUpperCase().replace(/^#/, "");
}

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && supportedLocales.includes(value as Locale);
}

function profileList(value: unknown): SavedProfile[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      tag: cleanTag(String(item.tag || "")),
      name: typeof item.name === "string" ? item.name : undefined,
      iconId: typeof item.iconId === "number" ? item.iconId : undefined,
      trophies: typeof item.trophies === "number" ? item.trophies : undefined,
      savedAt: typeof item.savedAt === "number" ? item.savedAt : Date.now(),
    }))
    .filter((item) => item.tag)
    .slice(0, 20);
}

function readPreferences(): Preferences {
  if (cache) return cache;
  if (typeof window === "undefined") return fallbackPreferences;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, unknown>;
    cache = {
      locale: isLocale(parsed.locale) ? parsed.locale : fallbackPreferences.locale,
      alertsEnabled: parsed.alertsEnabled === true,
      savedProfiles: profileList(parsed.savedProfiles),
      recentProfiles: profileList(parsed.recentProfiles),
    };
  } catch {
    cache = fallbackPreferences;
  }
  return cache;
}

function writePreferences(next: Preferences) {
  cache = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  listeners.forEach((listener) => listener());
}

function updatePreferences(update: (current: Preferences) => Preferences) {
  writePreferences(update(readPreferences()));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    cache = null;
    listeners.forEach((listener) => listener());
  });
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, readPreferences, () => fallbackPreferences);
}

export function setLocale(locale: Locale) {
  updatePreferences((current) => ({ ...current, locale }));
}

export function setAlertsEnabled(alertsEnabled: boolean) {
  updatePreferences((current) => ({ ...current, alertsEnabled }));
}

export function saveProfile(profile: Omit<SavedProfile, "savedAt">) {
  const tag = cleanTag(profile.tag);
  if (!tag) return;
  updatePreferences((current) => ({
    ...current,
    savedProfiles: [
      { ...profile, tag, savedAt: Date.now() },
      ...current.savedProfiles.filter((item) => item.tag !== tag),
    ].slice(0, 20),
  }));
  if (profile.name?.trim()) {
    saveConnectedProfile({ game: "brawl-stars", tag, name: profile.name });
  }
}

export function removeSavedProfile(tag: string) {
  const clean = cleanTag(tag);
  updatePreferences((current) => ({
    ...current,
    savedProfiles: current.savedProfiles.filter((item) => item.tag !== clean),
  }));
  removeConnectedProfile("brawl-stars", clean);
}

export function rememberRecentProfile(profile: Omit<SavedProfile, "savedAt">) {
  const tag = cleanTag(profile.tag);
  if (!tag) return;
  updatePreferences((current) => ({
    ...current,
    recentProfiles: [
      { ...profile, tag, savedAt: Date.now() },
      ...current.recentProfiles.filter((item) => item.tag !== tag),
    ].slice(0, 8),
  }));
}

export function exportPreferences(): string {
  return JSON.stringify(readPreferences(), null, 2);
}

export function importPreferences(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    writePreferences({
      locale: isLocale(parsed.locale) ? parsed.locale : "en",
      alertsEnabled: parsed.alertsEnabled === true,
      savedProfiles: profileList(parsed.savedProfiles),
      recentProfiles: profileList(parsed.recentProfiles),
    });
    return true;
  } catch {
    return false;
  }
}
