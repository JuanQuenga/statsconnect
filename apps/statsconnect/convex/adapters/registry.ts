import { brawlAdapter } from "./brawl";
import { clashAdapter } from "./clash";
import { createStubAdapter } from "./stub";
import type { GameAdapter, GameId } from "./types";

declare const process: { env: Record<string, string | undefined> };

export function getAdapter(game: GameId): GameAdapter {
  if (process.env.STATSCONNECT_ADAPTER_MODE === "stub") {
    return createStubAdapter(game);
  }
  return game === "clash-royale" ? clashAdapter : brawlAdapter;
}
