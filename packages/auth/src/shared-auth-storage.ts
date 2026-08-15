export type AuthStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => unknown;
};

type SharedAuthStorageOptions = {
  hostname: string;
  protocol: string;
  readCookie: () => string;
  writeCookie: (value: string) => void;
  legacyStorage: AuthStorage;
};

const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function usesSharedAuthCookie(hostname: string): boolean {
  return hostname === "juanquenga.com" || hostname.endsWith(".juanquenga.com");
}

function readCookieValue(cookie: string, key: string): string | null {
  const prefix = `${encodeURIComponent(key)}=`;
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

export function createSharedAuthStorage(options: SharedAuthStorageOptions): AuthStorage {
  if (!usesSharedAuthCookie(options.hostname)) return options.legacyStorage;

  const storage: AuthStorage = {
    getItem: (key) => {
      const sharedValue = readCookieValue(options.readCookie(), key);
      if (sharedValue !== null) return sharedValue;
      const legacyValue = options.legacyStorage.getItem(key);
      if (legacyValue !== null) storage.setItem(key, legacyValue);
      return legacyValue;
    },
    setItem: (key, value) => {
      const secure = options.protocol === "https:" ? "; Secure" : "";
      options.writeCookie(
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; Domain=.juanquenga.com; SameSite=Lax${secure}`,
      );
    },
  };
  return storage;
}
