export const supportedLocales = ["en", "es"] as const;
export type Locale = (typeof supportedLocales)[number];

const STORAGE_KEY = "clashcrown-locale:v1";
const listeners = new Set<() => void>();

function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch {
    // Storage can be disabled; the browser language remains a safe fallback.
  }
  return window.navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

let currentLocale = detectLocale();
if (typeof document !== "undefined") document.documentElement.lang = currentLocale;

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale) {
  if (currentLocale === locale) return;
  currentLocale = locale;
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Keep the in-memory preference for this visit when storage is unavailable.
    }
  }
  for (const listener of listeners) listener();
}

