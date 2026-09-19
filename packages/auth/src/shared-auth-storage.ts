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

const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function sharedCookieDomain(hostname: string): string | null {
  for (const domain of ["statsconnect.app", "juanquenga.com"]) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) return `.${domain}`;
  }
  return null;
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
  const domain = sharedCookieDomain(options.hostname);
  if (!domain) return options.legacyStorage;

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
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; Domain=${domain}; SameSite=Lax${secure}`,
      );
    },
  };
  return storage;
}
