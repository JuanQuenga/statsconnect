import { makeFunctionReference } from "convex/server";
import type {
  CardsPayload,
  ClanBundlePayload,
  ClanSearchPayload,
  ClanWarPayload,
  DeckMetaPayload,
  LeaderboardListPayload,
  LeaderboardPayload,
  LocationsPayload,
  PipelineStatusPayload,
  PlayerBundlePayload,
  PlayerSearchPayload,
  ProfileHistoryPoint,
  RankingKind,
  RankingsPayload,
  TopCardsPayload,
  TopDecksPayload,
  TopTowerTroopsPayload,
  TournamentsPayload
} from "@/lib/clash/types";
import type { MetaMode } from "@/lib/clash/battles";

export const convexUrl = (
  import.meta.env.VITE_CONVEX_URL ?? import.meta.env.NEXT_PUBLIC_CONVEX_URL ?? ""
).trim();
export const isConvexConfigured = convexUrl.startsWith("https://");

export const playerBundleAction = makeFunctionReference<
  "action",
  { tag: string; force?: boolean },
  PlayerBundlePayload
>("clash/clashApi:getPlayerBundle");

export const clanBundleAction = makeFunctionReference<
  "action",
  { tag: string; force?: boolean },
  ClanBundlePayload
>("clash/clashApi:getClanBundle");

export const cardsAction = makeFunctionReference<"action", { force?: boolean }, CardsPayload>("clash/clashApi:getCards");

export const clanWarAction = makeFunctionReference<
  "action",
  { tag: string; force?: boolean },
  ClanWarPayload
>("clash/clashApi:getClanWar");

export const locationsAction = makeFunctionReference<"action", { force?: boolean }, LocationsPayload>(
  "clash/clashApi:getLocations"
);

export const rankingsAction = makeFunctionReference<
  "action",
  { kind: RankingKind; locationId?: number; limit?: number; force?: boolean },
  RankingsPayload
>("clash/clashApi:getRankings");

export const leaderboardsAction = makeFunctionReference<"action", { force?: boolean }, LeaderboardListPayload>(
  "clash/clashApi:getLeaderboards"
);

export const leaderboardAction = makeFunctionReference<
  "action",
  { leaderboardId: number; limit?: number; force?: boolean },
  LeaderboardPayload
>("clash/clashApi:getLeaderboard");

export const searchClansAction = makeFunctionReference<
  "action",
  { name?: string; locationId?: number; minMembers?: number; maxMembers?: number; minScore?: number; limit?: number; force?: boolean },
  ClanSearchPayload
>("clash/clashApi:searchClans");

export const globalTournamentsAction = makeFunctionReference<"action", { force?: boolean }, TournamentsPayload>(
  "clash/clashApi:getGlobalTournaments"
);

export const searchTournamentsAction = makeFunctionReference<
  "action",
  { name: string; limit?: number; force?: boolean },
  TournamentsPayload
>("clash/clashApi:searchTournaments");

// --- Battle-log pipeline --------------------------------------------------

export const pipelineStatusQuery = makeFunctionReference<"query", Record<string, never>, PipelineStatusPayload>(
  "clash/meta:pipelineStatus"
);

export const topDecksQuery = makeFunctionReference<
  "query",
  { mode: MetaMode; windowDays?: number; limit?: number },
  TopDecksPayload
>("clash/meta:topDecks");

export const topCardsQuery = makeFunctionReference<
  "query",
  { mode: MetaMode; windowDays?: number; limit?: number },
  TopCardsPayload
>("clash/meta:topCards");

export const topTowerTroopsQuery = makeFunctionReference<
  "query",
  { mode: MetaMode; windowDays?: number; limit?: number },
  TopTowerTroopsPayload
>("clash/meta:topTowerTroops");

export const deckMetaQuery = makeFunctionReference<
  "query",
  { deckHash: string; mode: MetaMode; windowDays?: number },
  DeckMetaPayload
>("clash/meta:deckMeta");

// --- Player name directory ------------------------------------------------

export const searchPlayersQuery = makeFunctionReference<
  "query",
  { query: string; limit?: number },
  PlayerSearchPayload
>("clash/players:search");

export const directorySizeQuery = makeFunctionReference<"query", Record<string, never>, number>(
  "clash/players:directorySize"
);

// --- Profile history --------------------------------------------------

export const profileHistoryQuery = makeFunctionReference<
  "query",
  { kind: "player" | "clan"; tag: string },
  ProfileHistoryPoint[]
>("clash/cache:history");

export const seedTagMutation = makeFunctionReference<
  "mutation",
  { tag: string; key: string },
  { ok: boolean; message: string }
>("clash/meta:seedTag");

/** Matches GLOBAL_LOCATION_ID in convex/clashApi.ts. "International", not Europe. */
export const GLOBAL_LOCATION_ID = 57000006;

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const data = (error as Error & { data?: { message?: string } }).data;
    return data?.message ?? error.message.replace(/^\[CONVEX[^\]]*\]\s*/, "");
  }
  return "Something went wrong while loading Clash Royale data.";
}
