import type { GameId } from "./contracts";
import { normalizeTag } from "./tags";

const DEFAULT_ORIGINS: Record<GameId, string> = {
  "brawl-stars": "https://brawlstats.io",
  "clash-royale": "https://clashcrown.vercel.app",
};

function origin(game: GameId): string {
  const configured = game === "brawl-stars"
    ? import.meta.env.VITE_BRAWLSTATS_ORIGIN
    : import.meta.env.VITE_CLASHCROWN_ORIGIN;

  return (configured?.trim() || DEFAULT_ORIGINS[game]).replace(/\/$/, "");
}

export function hubLaunchPath(game: GameId): `/launch/${GameId}` {
  return `/launch/${game}`;
}

export function destinationUrl(game: GameId, playerTag: string): string {
  const tag = normalizeTag(playerTag);
  const url = game === "brawl-stars"
    ? new URL("/players", origin(game))
    : new URL(`/players/${encodeURIComponent(tag)}`, origin(game));

  if (game === "brawl-stars") url.searchParams.set("tag", tag);
  url.searchParams.set("from", "statsconnect");
  return url.toString();
}
