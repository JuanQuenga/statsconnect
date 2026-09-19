export type ApplicationId = "statsconnect" | "brawl-stars" | "clash-royale";
type GameId = Exclude<ApplicationId, "statsconnect">;

const gameHosts: Record<GameId, string> = {
  "brawl-stars": "bs.statsconnect.app",
  "clash-royale": "cr.statsconnect.app",
};

export function applicationForLocation(hostname: string, pathname: string): ApplicationId {
  if (hostname === gameHosts["brawl-stars"]) return "brawl-stars";
  if (hostname === gameHosts["clash-royale"]) return "clash-royale";
  if (pathname === "/bs" || pathname.startsWith("/bs/")) return "brawl-stars";
  if (pathname === "/cr" || pathname.startsWith("/cr/")) return "clash-royale";
  return "statsconnect";
}

// Asset namespaces remain stable even when a game owns its hostname's root.
export function gameRouteBase(game: GameId, assetBase: string, hostname: string): string {
  return hostname === gameHosts[game] ? "/" : assetBase.replace(/\/$/, "") || "/";
}

export function gameRoutePath(game: GameId, assetBase: string, hostname: string, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const base = gameRouteBase(game, assetBase, hostname);
  return `${base === "/" ? "" : base}${path}`;
}
