import type { GameId } from "./contracts";
import { normalizeTag } from "./tags";

const DEFAULT_ORIGINS: Record<GameId, string> = {
  "brawl-stars": "https://brawlstats.juanquenga.com",
  "clash-royale": "https://clashcrown.juanquenga.com",
};

function origin(game: GameId): string {
  const configured = game === "brawl-stars"
    ? import.meta.env.VITE_BRAWLSTATS_ORIGIN
    : import.meta.env.VITE_CLASHCROWN_ORIGIN;

  return (configured?.trim() || DEFAULT_ORIGINS[game]).replace(/\/$/, "");
}

export function hubLaunchPath(game: GameId, playerTag?: string): string {
  if (!playerTag) return `/launch/${game}`;
  return `/launch/${game}?tag=${encodeURIComponent(normalizeTag(playerTag))}`;
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
