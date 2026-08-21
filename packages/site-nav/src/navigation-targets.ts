import type { SiteId, SiteNavigationProfile } from "./SiteNavigation";

const DEFAULT_HUB_ORIGIN = "https://stats.juanquenga.com";

function normalizeOrigin(origin: string | undefined): string {
  return (origin?.trim() || DEFAULT_HUB_ORIGIN).replace(/\/$/, "");
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toUpperCase();
}

export function gameDestinationPath(
  game: Exclude<SiteId, "statsconnect">,
  tag?: string,
): string {
  const root = game === "brawl-stars" ? "/bs" : "/cr";
  if (!tag) return `${root}/`;

  return game === "brawl-stars"
    ? `${root}/players?tag=${encodeURIComponent(tag)}`
    : `${root}/players/${encodeURIComponent(tag)}`;
}

export function gameSwitcherHref(
  destination: SiteId | SiteNavigationProfile,
  hubOrigin?: string,
): string {
  const origin = normalizeOrigin(hubOrigin);
  if (destination === "statsconnect") return `${origin}/`;

  const game = typeof destination === "string" ? destination : destination.game;
  if (typeof destination === "string") return `${origin}${gameDestinationPath(game)}`;

  const tag = normalizeTag(destination.tag);
  return `${origin}${gameDestinationPath(game, tag || undefined)}`;
}
