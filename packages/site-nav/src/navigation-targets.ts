import type { SiteId, SiteNavigationProfile } from "./SiteNavigation";

const DEFAULT_HUB_ORIGIN = "https://stats.juanquenga.com";

function normalizeOrigin(origin: string | undefined): string {
  return (origin?.trim() || DEFAULT_HUB_ORIGIN).replace(/\/$/, "");
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toUpperCase();
}

export function gameSwitcherHref(
  destination: SiteId | SiteNavigationProfile,
  hubOrigin?: string,
): string {
  const origin = normalizeOrigin(hubOrigin);
  if (destination === "statsconnect") return `${origin}/`;

  const game = typeof destination === "string" ? destination : destination.game;
  const launchRoute = `${origin}/launch/${game}`;
  if (typeof destination === "string") return launchRoute;

  const tag = normalizeTag(destination.tag);
  return tag ? `${launchRoute}?tag=${encodeURIComponent(tag)}` : launchRoute;
}
