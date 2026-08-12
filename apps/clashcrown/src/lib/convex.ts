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
import type { AlertPreferences, ProfileKind, RecentProfile, TrackedProfile } from "@/lib/recentProfiles";

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

// --- Capability-backed personalization -----------------------------------

export type PersonalizationState = {
  accountId: string;
  preferences: AlertPreferences;
  profiles: TrackedProfile[];
  recents: RecentProfile[];
  devices: Array<{ label: string; createdAt: number; lastSeenAt: number }>;
  updatedAt: number;
};

export type PersonalAlert = {
  type: "chest" | "progression" | "war";
  title: string;
  body: string;
};

type ProfileInput = Pick<TrackedProfile, "kind" | "tag" | "name" | "clan">;
type RecentInput = Pick<RecentProfile, "kind" | "tag" | "name" | "clan" | "visitedAt">;

export const ensurePersonalAccountMutation = makeFunctionReference<
  "mutation",
  { deviceSecret: string; deviceLabel: string; importedProfiles: ProfileInput[]; importedRecents: RecentInput[]; importedPreferences: AlertPreferences },
  string
>("clash/personalization:ensureAccount");

export const personalStateQuery = makeFunctionReference<
  "query",
  { deviceSecret: string },
  PersonalizationState | null
>("clash/personalization:getState");

export const savePersonalProfileMutation = makeFunctionReference<
  "mutation",
  { deviceSecret: string; profile: ProfileInput },
  null
>("clash/personalization:saveProfile");

export const removePersonalProfileMutation = makeFunctionReference<
  "mutation",
  { deviceSecret: string; kind: ProfileKind; tag: string },
  null
>("clash/personalization:removeProfile");

export const setDefaultPersonalProfileMutation = makeFunctionReference<
  "mutation",
  { deviceSecret: string; tag: string | null },
  null
>("clash/personalization:setDefaultProfile");

export const recordPersonalRecentMutation = makeFunctionReference<
  "mutation",
  { deviceSecret: string; recent: RecentInput },
  null
>("clash/personalization:recordRecent");

export const clearPersonalRecentsMutation = makeFunctionReference<
  "mutation",
  { deviceSecret: string },
  null
>("clash/personalization:clearRecents");

export const updatePersonalPreferencesMutation = makeFunctionReference<
  "mutation",
  { deviceSecret: string; preferences: AlertPreferences },
  null
>("clash/personalization:updatePreferences");

export const observePersonalProfileMutation = makeFunctionReference<
  "mutation",
  {
    deviceSecret: string;
    kind: ProfileKind;
    tag: string;
    name: string;
    trophies?: number;
    chestName?: string;
    chestIndex?: number;
    warTrophies?: number;
  },
  PersonalAlert[]
>("clash/personalization:observeProfile");

export const createPairingCodeMutation = makeFunctionReference<
  "mutation",
  { deviceSecret: string; codeSecret: string },
  { expiresAt: number }
>("clash/personalization:createPairingCode");

export const redeemPairingCodeMutation = makeFunctionReference<
  "mutation",
  { deviceSecret: string; codeSecret: string; deviceLabel: string },
  string
>("clash/personalization:redeemPairingCode");

export const clearPersonalAccountMutation = makeFunctionReference<
  "mutation",
  { deviceSecret: string },
  null
>("clash/personalization:clearAccount");

/** Matches GLOBAL_LOCATION_ID in convex/clashApi.ts. "International", not Europe. */
export const GLOBAL_LOCATION_ID = 57000006;

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const data = (error as Error & { data?: { message?: string } }).data;
    return data?.message ?? error.message.replace(/^\[CONVEX[^\]]*\]\s*/, "");
  }
  return "Something went wrong while loading Clash Royale data.";
}
