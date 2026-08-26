import type { ApiClanRanking, ApiLocation, ApiLeaderboard, ApiPlayerRanking, RankingKind } from "@/lib/clash/types";

/**
 * Deterministic, intentionally synthetic data for reviewing the rankings UI.
 * It is only selected by the explicit VITE_CLASHCROWN_DATA_MODE=demo dev flag;
 * live Convex responses never fall through to these rows.
 */

export const demoLocations = [
  { id: 57000006, name: "Global" },
  { id: 57000001, name: "United States", isCountry: true, countryCode: "US" },
  { id: 57000021, name: "Canada", isCountry: true, countryCode: "CA" },
] satisfies ApiLocation[];

export const demoLeaderboards = [
  { id: 900001, name: "Path of Legends · Demo Season" },
  { id: 900000, name: "Season Preview · Demo" },
] satisfies ApiLeaderboard[];

type DemoPlayerSeed = readonly [tag: string, name: string, rank: number, previousRank: number, score: number, clanName: string];

const demoPlayerSeeds = [
  ["#CCDEMO01", "Crown Architect", 1, 2, 18_420, "Blue Keepers"],
  ["#CCDEMO02", "River Runner", 2, 1, 18_105, "Three Musketeers"],
  ["#CCDEMO03", "Tower Scholar", 3, 4, 17_980, "The Night Watch"],
  ["#CCDEMO04", "Royal Circuit", 4, 3, 17_744, "Blue Keepers"],
  ["#CCDEMO05", "Elixir Pilot", 5, 7, 17_502, "Arena Lab"],
  ["#CCDEMO06", "Bridge Captain", 6, 5, 17_311, "Crown Theory"],
  ["#CCDEMO07", "Spell Weaver", 7, 9, 17_096, "Arena Lab"],
  ["#CCDEMO08", "Golden Knight", 8, 6, 16_884, "The Night Watch"],
  ["#CCDEMO09", "Ladder Cartographer", 9, 12, 16_702, "Crown Theory"],
  ["#CCDEMO10", "Duel Mechanic", 10, 10, 16_530, "Three Musketeers"],
  ["#CCDEMO11", "Chest Strategist", 11, 8, 16_401, "Blue Keepers"],
  ["#CCDEMO12", "Arena Gardener", 12, 14, 16_288, "Crown Theory"],
 ] satisfies DemoPlayerSeed[];

export const demoPlayers = demoPlayerSeeds.map(([tag, name, rank, previousRank, score, clanName]) => ({
  tag,
  name,
  rank,
  previousRank,
  score,
  clan: { tag: `#${clanName.replaceAll(" ", "").toUpperCase()}`, name: clanName },
})) satisfies ApiPlayerRanking[];

const demoClanRankings = [
  ["#CLANDEMO01", "Blue Keepers", 1, 2, 68_420, 2_910, 48, "Global"],
  ["#CLANDEMO02", "The Night Watch", 2, 1, 66_880, 2_840, 50, "United States"],
  ["#CLANDEMO03", "Arena Lab", 3, 4, 64_215, 2_760, 46, "Canada"],
  ["#CLANDEMO04", "Crown Theory", 4, 5, 62_901, 2_702, 49, "Global"],
  ["#CLANDEMO05", "Three Musketeers", 5, 3, 61_574, 2_654, 45, "United States"],
  ["#CLANDEMO06", "Goblin Workshop", 6, 7, 59_998, 2_590, 44, "Global"],
  ["#CLANDEMO07", "Tower Union", 7, 8, 58_740, 2_514, 47, "Canada"],
  ["#CLANDEMO08", "Elixir Exchange", 8, 6, 57_203, 2_468, 43, "United States"],
  ["#CLANDEMO09", "Royal Assembly", 9, 10, 56_009, 2_401, 41, "Global"],
  ["#CLANDEMO10", "Bridge District", 10, 9, 54_776, 2_330, 40, "Canada"],
  ["#CLANDEMO11", "The Draft House", 11, 12, 53_201, 2_288, 39, "United States"],
  ["#CLANDEMO12", "Cannon Commons", 12, 11, 51_990, 2_201, 38, "Global"],
] satisfies ReadonlyArray<readonly [string, string, number, number, number, number, number, string]>;

function location(name: string): ApiLocation {
  return demoLocations.find((item) => item.name === name) ?? demoLocations[0];
}

export const demoClans: ApiClanRanking[] = demoClanRankings.map(([tag, name, rank, previousRank, clanScore, clanWarTrophies, members, locationName], index) => ({
  tag,
  name,
  rank,
  previousRank,
  clanScore,
  clanWarTrophies,
  members,
  location: location(locationName),
  badgeId: 16000004 + (index % 9),
}));

export const demoClanWarRankings = demoClans.map((row) => ({
  ...row,
  clanScore: row.clanScore ? row.clanScore - 1200 : row.clanScore,
  clanWarTrophies: row.clanWarTrophies ? row.clanWarTrophies + 80 : row.clanWarTrophies,
}));

/** The second board intentionally changes order and scores so its picker is testable. */
export function demoPlayersForBoard(boardId: number): ApiPlayerRanking[] {
  if (boardId === demoLeaderboards[0].id) return demoPlayers;
  return [...demoPlayers].reverse().map((row, index) => ({
    ...row,
    rank: index + 1,
    previousRank: row.rank,
    score: row.score ? row.score - 1_200 - index * 17 : row.score,
  }));
}

/** Global keeps the complete sample; country selections return that region's rows. */
export function demoClansForLocation(rows: ApiClanRanking[], locationId: number): ApiClanRanking[] {
  if (locationId === demoLocations[0].id) return rows;
  return rows
    .filter((row) => row.location?.id === locationId)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Demo ranking links intentionally resolve to the existing CCDEMO profile fixtures. */
export function demoRankingHref(kind: RankingKind): string {
  return kind === "players" ? "/players/CCDEMO" : "/clans/CCDEMO";
}
