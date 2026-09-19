import type { SiteId, SiteNavigationProfile } from "./SiteNavigation";

const DEFAULT_HUB_ORIGIN = "https://statsconnect.app";

function normalizeOrigin(origin: string | undefined): string {
  const value = (origin?.trim() || DEFAULT_HUB_ORIGIN).replace(/\/$/, "");
  return ["https://bs.statsconnect.app", "https://cr.statsconnect.app"].includes(value)
    ? DEFAULT_HUB_ORIGIN
    : value;
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

function gameDestinationPath(
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
  const tag = typeof destination === "string" ? undefined : normalizeTag(destination.tag) || undefined;
  return gameDestinationHref(game, tag, origin);
}

export function gameDestinationHref(
  game: Exclude<SiteId, "statsconnect">,
  tag?: string,
  hubOrigin?: string,
): string {
  const origin = normalizeOrigin(hubOrigin);
  const path = gameDestinationPath(game, tag ? normalizeTag(tag) : undefined);
  if (origin !== DEFAULT_HUB_ORIGIN) return `${origin}${path}`;
  const subdomain = game === "brawl-stars" ? "bs" : "cr";
  return `https://${subdomain}.statsconnect.app${path.slice(3)}`;
}

export function gameAssetHref(
  game: Exclude<SiteId, "statsconnect">,
  options: GameAssetHrefOptions = {},
): string {
  const root = gameDestinationPath(game).replace(/\/$/, "");

  // Build assets retain their namespace even when game pages live at host root.
  const assetOrigin = options.applicationOrigin ?? options.hubOrigin;
  if (assetOrigin && normalizeOrigin(assetOrigin) === DEFAULT_HUB_ORIGIN) {
    return `${gameSwitcherHref(game)}${root.slice(1)}/`;
  }

  if (options.currentSite === game) {
    if (options.applicationShell && options.applicationOrigin) {
      return `${normalizeOrigin(options.applicationOrigin)}${root}/`;
    }

    const pathname = options.currentPathname ?? "";
    return pathname === root || pathname.startsWith(`${root}/`) ? `${root}/` : "/";
  }

  const origin = normalizeOrigin(options.hubOrigin);
  return origin === DEFAULT_HUB_ORIGIN
    ? `${gameSwitcherHref(game)}${root.slice(1)}/`
    : `${origin}${root}/`;
}
