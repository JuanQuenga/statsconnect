// Route labels carry product meaning; dynamic segments can contain player tags.
const routeSegments = new Set([
  "bs", "cr", "games", "brawl-stars", "clash-royale", "connect", "launch",
  "privacy", "settings", "connections", "players", "compare", "upgrades",
  "history", "clans", "manage", "war", "search", "clubs", "bands", "brawlers",
  "maps", "gamemodes", "leaderboards", "progression", "meta", "assistant",
  "beta", "tournaments", "guides", "decks", "tools", "cards", "news",
]);

// Exact public hosts only: arbitrary subdomains and registrable domains can carry identifiers.
const appHosts = new Set([
  "statsconnect.app", "bs.statsconnect.app", "cr.statsconnect.app", "www.statsconnect.app",
  "stats.juanquenga.com", "brawlstats.juanquenga.com", "clashcrown.juanquenga.com",
]);
const attributionHosts = new Set([
  ...appHosts,
  "google.com", "www.google.com", "bing.com", "www.bing.com",
  "duckduckgo.com", "www.duckduckgo.com",
]);

function normalizedHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function safeOrigin(parsed: URL): string {
  const hostname = normalizedHostname(parsed.hostname);
  // Never retain credentials, arbitrary ports, preview names, IPs, or unknown hosts.
  return appHosts.has(hostname) ? `${parsed.protocol}//${hostname}` : "https://redacted.invalid";
}

function safeReferringDomain(hostname: string): string | undefined {
  const normalized = normalizedHostname(hostname);
  return attributionHosts.has(normalized) ? normalized : undefined;
}

function isWebUrl(parsed: URL): boolean {
  return parsed.protocol === "https:" || parsed.protocol === "http:";
}

export function safePathname(pathname: string): string {
  return pathname.split("/").map((segment) => {
    if (!segment) return "";
    return routeSegments.has(segment) ? segment : ":id";
  }).join("/");
}

export function safeUrl(value: string): string {
  try {
    const parsed = new URL(value, "https://statsconnect.app");
    if (!isWebUrl(parsed)) return "[redacted URL]";
    return `${safeOrigin(parsed)}${safePathname(parsed.pathname)}`;
  } catch {
    return "[redacted URL]";
  }
}

// Preserve static source filenames so Sentry can resolve stack frames and source maps.
export function safeSourceUrl(value: string): string {
  try {
    const parsed = new URL(value, "https://statsconnect.app");
    if (!isWebUrl(parsed)) return "[redacted URL]";
    if (/^\/(?:bs\/|cr\/)?(?:assets|_assets)\/[a-zA-Z0-9_.-]+\.[cm]?js$/i.test(parsed.pathname)) {
      return `${safeOrigin(parsed)}${parsed.pathname}`;
    }
  } catch { /* Fall through to conservative route redaction. */ }
  return safeUrl(value);
}

const sdkProperties = new Set([
  "token", "distinct_id", "$session_id", "$window_id", "$lib", "$lib_version", "$geoip_disable",
  "$browser", "$browser_version", "$os", "$os_version", "$device_type",
  "$screen_height", "$screen_width", "$viewport_height", "$viewport_width",
  "$insert_id", "$time", "$process_person_profile", "$is_identified",
]);

export function safeAnalyticsProperties(properties: Record<string, unknown>): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (sdkProperties.has(key) && ["string", "number", "boolean"].includes(typeof value)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") safe[key] = value;
    }
  }
  if (typeof properties.$current_url === "string") safe.$current_url = safeUrl(properties.$current_url);
  if (typeof properties.$pathname === "string") safe.$pathname = safePathname(properties.$pathname);
  if (typeof properties.$referring_domain === "string") {
    const domain = safeReferringDomain(properties.$referring_domain);
    if (domain) safe.$referring_domain = domain;
  }
  if (typeof properties.$referrer === "string") {
    // The original referrer takes precedence over any SDK-provided copy, even when omitted.
    delete safe.$referring_domain;
    try {
      const referrer = new URL(properties.$referrer);
      const domain = isWebUrl(referrer) ? safeReferringDomain(referrer.hostname) : undefined;
      if (domain) safe.$referring_domain = domain;
    } catch { /* No supported referrer. */ }
  }
  if (properties.game === "brawl-stars" || properties.game === "clash-royale") safe.game = properties.game;
  if (properties.stage === "preview" || properties.stage === "save") safe.stage = properties.stage;
  if (["production", "preview", "development", "test"].includes(String(properties.environment))) {
    if (typeof properties.environment === "string") safe.environment = properties.environment;
  }
  if (["invalid-tag", "not-found", "network", "unknown"].includes(String(properties.reason))) {
    if (typeof properties.reason === "string") safe.reason = properties.reason;
  }
  return safe;
}
