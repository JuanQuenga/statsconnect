import {
  mergeConnectedProfiles,
  type BrowserConnectedProfilesAdapter,
  type ConnectedProfile,
  type PersistedConnectedProfile,
} from "#connected-profiles";

type BrowserStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => unknown;
};

type BrowserConnectedProfilesOptions = {
  hostname: string;
  protocol: string;
  storage: BrowserStorage;
  readCookie: () => string;
  writeCookie: (value: string) => void;
  subscribeExternal: (listener: () => void) => () => void;
  notify: () => void;
};

const COOKIE_KEY = "statsconnect_connected_profiles";
const STORAGE_KEY = "statsconnect.connected-profiles.v2";
const LEGACY_COOKIE_KEY = "statsconnect_profiles";
const LEGACY_STORAGE_KEY = "statsconnect.profiles.v1";
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function cookieValue(cookie: string, key: string): string | null {
  const prefix = `${key}=`;
  const match = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return null;
  }
}

function isGame(value: unknown): value is ConnectedProfile["game"] {
  return value === "brawl-stars" || value === "clash-royale";
}

function parseProfiles(value: string | null, legacy: boolean): PersistedConnectedProfile[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const profiles: PersistedConnectedProfile[] = [];
    for (const candidate of parsed) {
      if (!candidate || typeof candidate !== "object") continue;
      const record = candidate as Record<string, unknown>;
      if (!isGame(record.game) || typeof record.tag !== "string" || typeof record.name !== "string") continue;
      profiles.push({
        game: record.game,
        tag: record.tag,
        name: record.name,
        updatedAt: !legacy && typeof record.updatedAt === "number" ? record.updatedAt : 0,
      });
    }
    return mergeConnectedProfiles(profiles);
  } catch {
    return [];
  }
}

function sharedCookieDomain(hostname: string): string {
  return hostname === "juanquenga.com" || hostname.endsWith(".juanquenga.com")
    ? "; Domain=.juanquenga.com"
    : "";
}

export function createBrowserConnectedProfilesAdapter(
  options: BrowserConnectedProfilesOptions,
): BrowserConnectedProfilesAdapter {
  let cachedProfiles: PersistedConnectedProfile[] | null = null;

  function write(profiles: readonly PersistedConnectedProfile[]): void {
    const normalized = mergeConnectedProfiles(profiles);
    const value = JSON.stringify(normalized);
    cachedProfiles = normalized;
    try {
      options.storage.setItem(STORAGE_KEY, value);
    } catch {
      // The cookie remains an independent persistence Adapter.
    }
    try {
      const secure = options.protocol === "https:" ? "; Secure" : "";
      options.writeCookie(
        `${COOKIE_KEY}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}${sharedCookieDomain(options.hostname)}`,
      );
    } catch {
      // In-memory state still updates when browser persistence is unavailable.
    }
    options.notify();
  }

  return {
    read: () => {
      if (cachedProfiles) return cachedProfiles;
      const cookie = options.readCookie();
      const current = cookieValue(cookie, COOKIE_KEY) ?? options.storage.getItem(STORAGE_KEY);
      if (current !== null) {
        cachedProfiles = parseProfiles(current, false);
        return cachedProfiles;
      }

      const legacy = cookieValue(cookie, LEGACY_COOKIE_KEY) ?? options.storage.getItem(LEGACY_STORAGE_KEY);
      const migrated = parseProfiles(legacy, true);
      cachedProfiles = migrated;
      if (legacy !== null) write(migrated);
      return cachedProfiles;
    },
    replace: write,
    subscribe: (listener) => options.subscribeExternal(() => {
      cachedProfiles = null;
      listener();
    }),
  };
}

let browserAdapter: BrowserConnectedProfilesAdapter | null = null;

export function getBrowserConnectedProfilesAdapter(): BrowserConnectedProfilesAdapter {
  if (browserAdapter) return browserAdapter;
  if (typeof window === "undefined") {
    let profiles: readonly PersistedConnectedProfile[] = [];
    const listeners = new Set<() => void>();
    browserAdapter = {
      read: () => profiles,
      replace: (next) => {
        profiles = mergeConnectedProfiles(next);
        for (const listener of listeners) listener();
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    return browserAdapter;
  }

  const eventName = "statsconnect:connected-profiles-change";
  browserAdapter = createBrowserConnectedProfilesAdapter({
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    storage: window.localStorage,
    readCookie: () => document.cookie,
    writeCookie: (value) => {
      document.cookie = value;
    },
    subscribeExternal: (listener) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY || event.key === LEGACY_STORAGE_KEY) listener();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(eventName, listener);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(eventName, listener);
      };
    },
    notify: () => window.dispatchEvent(new Event(eventName)),
  });
  return browserAdapter;
}

export function saveBrowserConnectedProfile(profile: ConnectedProfile): void {
  const adapter = getBrowserConnectedProfilesAdapter();
  const normalized = mergeConnectedProfiles([
    { ...profile, updatedAt: Date.now() },
    ...adapter.read(),
  ]);
  adapter.replace(normalized);
}

export function removeBrowserConnectedProfile(
  game: ConnectedProfile["game"],
  tag: string,
): void {
  const normalizedTag = tag.trim().replace(/^#/, "").toUpperCase();
  const adapter = getBrowserConnectedProfilesAdapter();
  adapter.replace(adapter.read().filter((profile) => (
    profile.game !== game || profile.tag !== normalizedTag
  )));
}
