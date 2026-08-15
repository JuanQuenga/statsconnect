export type SharedProfileGame = "brawl-stars" | "clash-royale";

export type SharedProfile = {
  game: SharedProfileGame;
  tag: string;
  name: string;
};

export type SharedProfileOrigins = Record<SharedProfileGame, string>;

const MAX_PROFILES_PER_GAME = 8;

function isSharedProfileGame(value: unknown): value is SharedProfileGame {
  return value === "brawl-stars" || value === "clash-royale";
}

export type SharedProfileUpdate =
  | { type: "save"; profile: SharedProfile }
  | { type: "remove"; game: SharedProfileGame; tag: string };

const COOKIE_KEY = "statsconnect_profiles";
const STORAGE_KEY = "statsconnect.profiles.v1";
const CHANGE_EVENT = "statsconnect:profiles-change";
let cachedValue: string | null = null;
let cachedProfiles: SharedProfile[] = [];

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toUpperCase();
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, "");
}

function normalizeProfile(value: unknown): SharedProfile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isSharedProfileGame(record.game)) return null;
  if (typeof record.tag !== "string" || typeof record.name !== "string") return null;
  const tag = normalizeTag(record.tag).slice(0, 24);
  const name = record.name.trim().slice(0, 48);
  return tag && name ? { game: record.game, tag, name } : null;
}

function boundedProfiles(values: readonly unknown[]): SharedProfile[] {
  const counts: Record<SharedProfileGame, number> = {
    "brawl-stars": 0,
    "clash-royale": 0,
  };
  const profiles: SharedProfile[] = [];
  for (const value of values) {
    const profile = normalizeProfile(value);
    if (!profile || counts[profile.game] >= MAX_PROFILES_PER_GAME) continue;
    if (profiles.some((candidate) => candidate.game === profile.game && candidate.tag === profile.tag)) continue;
    counts[profile.game] += 1;
    profiles.push(profile);
  }
  return profiles;
}

export function serializeSharedProfiles(profiles: readonly SharedProfile[]): string {
  return JSON.stringify(boundedProfiles(profiles));
}

export function parseSharedProfiles(value: string | null | undefined): SharedProfile[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? boundedProfiles(parsed) : [];
  } catch {
    return [];
  }
}

function cookieValue(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${COOKIE_KEY}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return null;
  }
}

function storedValue(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return cookieValue() ?? window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cookieValue();
  }
}

export function readSharedProfiles(): SharedProfile[] {
  const value = storedValue();
  if (value === cachedValue) return cachedProfiles;
  cachedValue = value;
  cachedProfiles = parseSharedProfiles(value);
  return cachedProfiles;
}

function sharedCookieDomain(): string {
  if (typeof window === "undefined") return "";
  const hostname = window.location.hostname;
  return hostname === "juanquenga.com" || hostname.endsWith(".juanquenga.com")
    ? "; Domain=.juanquenga.com"
    : "";
}

function writeSharedProfiles(profiles: readonly SharedProfile[], update?: SharedProfileUpdate): void {
  if (typeof window === "undefined") return;
  const value = serializeSharedProfiles(profiles);
  cachedValue = value;
  cachedProfiles = parseSharedProfiles(value);
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}${sharedCookieDomain()}`;
  } catch {
    // The current app still updates in memory when browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: update }));
}

export function saveSharedProfile(profile: SharedProfile): void {
  const current = readSharedProfiles();
  const update = { type: "save", profile } as const;
  const next = updateSharedProfiles(current, update);
  if (serializeSharedProfiles(current) !== serializeSharedProfiles(next)) writeSharedProfiles(next, update);
}

export function removeSharedProfile(game: SharedProfileGame, tag: string): void {
  const current = readSharedProfiles();
  const update = { type: "remove", game, tag } as const;
  const next = updateSharedProfiles(current, update);
  if (serializeSharedProfiles(current) !== serializeSharedProfiles(next)) writeSharedProfiles(next, update);
}

export function replaceSharedProfiles(profiles: readonly SharedProfile[]): void {
  writeSharedProfiles(profiles);
}

export function subscribeSharedProfiles(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const notifyExternal = () => {
    cachedValue = null;
    listener();
  };
  window.addEventListener("storage", notifyExternal);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", notifyExternal);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

export function subscribeSharedProfileUpdates(listener: (update: SharedProfileUpdate) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const notify = (event: Event) => {
    if (!(event instanceof CustomEvent) || !event.detail) return;
    listener(event.detail as SharedProfileUpdate);
  };
  window.addEventListener(CHANGE_EVENT, notify);
  return () => window.removeEventListener(CHANGE_EVENT, notify);
}

export function sharedProfileHref(
  profile: SharedProfile,
  origins: SharedProfileOrigins,
): string {
  const origin = normalizeOrigin(origins[profile.game]);
  const tag = normalizeTag(profile.tag);
  return profile.game === "brawl-stars"
    ? `${origin}/players?tag=${encodeURIComponent(`#${tag}`)}`
    : `${origin}/players/${encodeURIComponent(tag)}`;
}

export function updateSharedProfiles(
  current: readonly SharedProfile[],
  update: SharedProfileUpdate,
): SharedProfile[] {
  if (update.type === "remove") {
    const tag = normalizeTag(update.tag);
    return current.filter((profile) => (
      profile.game !== update.game || normalizeTag(profile.tag) !== tag
    ));
  }

  const profile = {
    ...update.profile,
    tag: normalizeTag(update.profile.tag),
    name: update.profile.name.trim(),
  };
  return [
    profile,
    ...current.filter((candidate) => (
      candidate.game !== profile.game || normalizeTag(candidate.tag) !== profile.tag
    )),
  ];
}
