const CANONICAL_STATS_CONNECT_ORIGIN = "https://stats.juanquenga.com";

// Keep the old custom hosts trusted while their external permanent redirects roll out.
// They are migration compatibility only; new links and auth callbacks use the canonical host.
const LEGACY_STATS_CONNECT_ORIGINS = [
  "https://brawlstats.juanquenga.com",
  "https://clashcrown.juanquenga.com",
] as const;

export function authTrustedOrigins(siteUrl: string): string[] {
  return Array.from(new Set([
    siteUrl,
    CANONICAL_STATS_CONNECT_ORIGIN,
    ...LEGACY_STATS_CONNECT_ORIGINS,
  ]));
}

export { CANONICAL_STATS_CONNECT_ORIGIN, LEGACY_STATS_CONNECT_ORIGINS };
