import { displayTag, normalizeTag } from "./tags";
import type {
  AdapterResult,
  GameAdapter,
  GameId,
  ProfileSummary,
} from "./types";

function hashTag(tag: string): number {
  let hash = 2166136261;
  for (const character of tag) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function cache<T>(data: T): AdapterResult<T> {
  const fetchedAt = Date.now();
  return {
    data,
    cache: { state: "stub", fetchedAt, expiresAt: fetchedAt + 60_000 },
  };
}

function summaryFor(game: GameId, tag: string): ProfileSummary {
  const seed = hashTag(tag);
  const isClash = game === "clash-royale";
  return {
    game,
    playerTag: displayTag(tag),
    display: {
      name: `${isClash ? "Royale" : "Brawler"} ${tag.slice(-4)}`,
      avatarUrl: null,
      headline: {
        label: "Trophies",
        value: (isClash ? 6_200 : 28_000) + (seed % (isClash ? 1_800 : 18_000)),
      },
      affiliation: {
        name: isClash ? "Northwind Clan" : "Signal Club",
        tag: `#${tag.slice(0, Math.min(8, tag.length))}`,
      },
    },
  };
}

export function createStubAdapter(game: GameId): GameAdapter {
  return {
    game,
    normalizeTag,
    getProfileSummary: async (input) => cache(summaryFor(game, normalizeTag(input))),
  };
}
