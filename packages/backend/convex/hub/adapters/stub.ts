import { displayTag, normalizeTag } from "./tags";
import type {
  AdapterLoadResult,
  AdapterResult,
  GameAdapter,
  GameId,
  ProfileItem,
  ProfileStats,
  ProfileSummary,
  RecentMatch,
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

const clashCards = [
  "Knight",
  "Archers",
  "Fireball",
  "The Log",
  "Hog Rider",
  "Cannon",
  "Ice Spirit",
  "Skeletons",
  "Musketeer",
  "Valkyrie",
  "Zap",
  "Mini P.E.K.K.A",
];

const brawlers = [
  "Shelly",
  "Colt",
  "Nita",
  "Bull",
  "Jessie",
  "Brock",
  "Dynamike",
  "Bo",
  "Poco",
  "El Primo",
  "Barley",
  "Rosa",
];

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

function rosterFor(game: GameId, tag: string): ProfileItem[] {
  const seed = hashTag(tag);
  const names = game === "clash-royale" ? clashCards : brawlers;
  return names.map((name, index) => ({
    kind: game === "clash-royale" ? "card" : "brawler",
    id: `${game}-${index + 1}`,
    name,
    level: game === "clash-royale" ? 11 + ((seed + index) % 4) : 7 + ((seed + index) % 5),
    rank: game === "brawl-stars" ? 18 + ((seed + index * 3) % 18) : null,
    score: game === "brawl-stars" ? 450 + ((seed + index * 29) % 650) : null,
    bestScore: game === "brawl-stars" ? 600 + ((seed + index * 37) % 700) : null,
    imageUrl: null,
  }));
}

function matchesFor(game: GameId, tag: string): RecentMatch[] {
  const seed = hashTag(tag);
  const modes = game === "clash-royale"
    ? ["Ladder", "Path of Legends", "Classic Challenge", "2v2"]
    : ["Gem Grab", "Brawl Ball", "Knockout", "Showdown"];
  return Array.from({ length: 8 }, (_, index) => {
    const result = (seed + index) % 5 === 0 ? "loss" : "win";
    return {
      id: `${game}-${tag}-${index}`,
      occurredAt: Date.now() - index * 3_600_000,
      mode: modes[index % modes.length] ?? "Battle",
      map: game === "brawl-stars" ? ["Hard Rock Mine", "Super Beach", "Goldarm Gulch"][index % 3] ?? null : null,
      result,
      rank: null,
      scoreDelta: result === "win" ? 7 + (index % 3) : -5 - (index % 2),
    };
  });
}

function statsFor(game: GameId, tag: string): ProfileStats {
  const summary = summaryFor(game, tag);
  const seed = hashTag(tag);
  const trophies = summary.display.headline?.value ?? 0;
  const roster = rosterFor(game, tag);
  return {
    game,
    playerTag: displayTag(tag),
    summary,
    metrics: game === "clash-royale"
      ? [
          { key: "trophies", label: "Trophies", value: trophies, format: "integer" },
          { key: "best-trophies", label: "Best trophies", value: trophies + 183, format: "integer" },
          { key: "wins", label: "Wins", value: 1_900 + (seed % 2_400), format: "integer" },
          { key: "losses", label: "Losses", value: 1_400 + (seed % 1_800), format: "integer" },
          { key: "battle-count", label: "Battle count", value: 4_700 + (seed % 3_000), format: "integer" },
          { key: "three-crown-wins", label: "Three-crown wins", value: 540 + (seed % 900), format: "integer" },
          { key: "exp-level", label: "Experience level", value: 48 + (seed % 23), format: "integer" },
        ]
      : [
          { key: "trophies", label: "Trophies", value: trophies, format: "integer" },
          { key: "highest-trophies", label: "Highest trophies", value: trophies + 640, format: "integer" },
          { key: "exp-level", label: "Experience level", value: 120 + (seed % 180), format: "integer" },
          { key: "exp-points", label: "Experience points", value: 90_000 + (seed % 140_000), format: "integer" },
          { key: "3v3-wins", label: "3v3 wins", value: 4_000 + (seed % 8_000), format: "integer" },
          { key: "solo-wins", label: "Solo wins", value: 340 + (seed % 900), format: "integer" },
          { key: "duo-wins", label: "Duo wins", value: 520 + (seed % 1_200), format: "integer" },
        ],
    roster,
    currentLoadout: game === "clash-royale" ? roster.slice(0, 8) : [],
    recentMatches: matchesFor(game, tag),
    upcoming: game === "clash-royale"
      ? ["Silver Chest", "Gold Crate", "Golden Chest", "Magical Chest", "Giant Chest"].map((label, index) => ({ index: index + 1, label }))
      : [],
    warnings: ["Showing deterministic sample data. Connect live credentials to refresh from the game service."],
  };
}

export function createStubAdapter(game: GameId): GameAdapter {
  return {
    game,
    normalizeTag,
    connectProfile: async (input) => cache(summaryFor(game, normalizeTag(input))),
    getProfileSummary: async (input) => cache(summaryFor(game, normalizeTag(input))),
    getStats: async (input): Promise<AdapterLoadResult<ProfileStats>> => {
      const stats = statsFor(game, normalizeTag(input));
      return {
        ...cache(stats),
        primed: [{ resource: "summary", data: stats.summary }],
      };
    },
  };
}
