import type { SiteId, SiteNavigationProfile } from "./SiteNavigation";

const DEFAULT_HUB_ORIGIN = "https://stats.juanquenga.com";

function normalizeOrigin(origin: string | undefined): string {
  return (origin?.trim() || DEFAULT_HUB_ORIGIN).replace(/\/$/, "");
}

type GameAssetHrefOptions = {
  applicationOrigin?: string;
  applicationShell?: boolean;
  currentPathname?: string;
  currentSite?: SiteId;
  hubOrigin?: string;
};

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

export function gameAssetHref(
  game: Exclude<SiteId, "statsconnect">,
  options: GameAssetHrefOptions = {},
): string {
  const root = gameDestinationPath(game).replace(/\/$/, "");

  if (options.currentSite === game) {
    if (options.applicationShell && options.applicationOrigin) {
      return `${normalizeOrigin(options.applicationOrigin)}${root}/`;
    }

    const pathname = options.currentPathname ?? "";
    return pathname === root || pathname.startsWith(`${root}/`) ? `${root}/` : "/";
  }

  return `${normalizeOrigin(options.hubOrigin)}${root}/`;
}
