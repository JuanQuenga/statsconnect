import { clashBackend } from "@/lib/platformBackend";

export const convexUrl = (
  import.meta.env.VITE_CONVEX_URL ?? import.meta.env.NEXT_PUBLIC_CONVEX_URL ?? ""
).trim();
export const isConvexConfigured = convexUrl.startsWith("https://");
/** Explicit local-only fixture mode for reviewing data-heavy UI without Convex. */
export const isClashDemoDataMode = import.meta.env.DEV && import.meta.env.VITE_CLASHCROWN_DATA_MODE === "demo";

export const playerBundleAction = clashBackend.profiles.player;
export const clanBundleAction = clashBackend.profiles.clan;
export const cardsAction = clashBackend.catalog.cards;
export const clanWarAction = clashBackend.profiles.clanWar;
export const locationsAction = clashBackend.catalog.locations;
export const rankingsAction = clashBackend.catalog.rankings;
export const leaderboardsAction = clashBackend.catalog.leaderboards;
export const leaderboardAction = clashBackend.catalog.leaderboard;
export const searchClansAction = clashBackend.catalog.searchClans;
export const globalTournamentsAction = clashBackend.catalog.globalTournaments;
export const searchTournamentsAction = clashBackend.catalog.searchTournaments;

// --- Battle-log pipeline --------------------------------------------------

export const pipelineStatusQuery = clashBackend.meta.pipelineStatus;
export const topDecksQuery = clashBackend.meta.topDecks;
export const topCardsQuery = clashBackend.meta.topCards;
export const topTowerTroopsQuery = clashBackend.meta.topTowerTroops;
export const deckMetaQuery = clashBackend.meta.deckMeta;

// --- Player name directory ------------------------------------------------

export const searchPlayersQuery = clashBackend.players.search;
export const directorySizeQuery = clashBackend.players.directorySize;

// --- Profile history --------------------------------------------------

export const profileHistoryQuery = clashBackend.history.profile;
export const seedTagMutation = clashBackend.meta.seedTag;

// --- Capability-backed personalization -----------------------------------

export const ensurePersonalAccountMutation = clashBackend.personalization.ensureAccount;
export const personalStateQuery = clashBackend.personalization.getState;
export const savePersonalProfileMutation = clashBackend.personalization.saveProfile;
export const removePersonalProfileMutation = clashBackend.personalization.removeProfile;
export const setDefaultPersonalProfileMutation = clashBackend.personalization.setDefaultProfile;
export const recordPersonalRecentMutation = clashBackend.personalization.recordRecent;
export const clearPersonalRecentsMutation = clashBackend.personalization.clearRecents;
export const updatePersonalPreferencesMutation = clashBackend.personalization.updatePreferences;
export const observePersonalProfileMutation = clashBackend.personalization.observeProfile;
export const createPairingCodeMutation = clashBackend.personalization.createPairingCode;
export const redeemPairingCodeMutation = clashBackend.personalization.redeemPairingCode;
export const clearPersonalAccountMutation = clashBackend.personalization.clearAccount;

/** Matches GLOBAL_LOCATION_ID in convex/clashApi.ts. "International", not Europe. */
export const GLOBAL_LOCATION_ID = 57000006;

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const data = (error as Error & { data?: { message?: string } }).data;
    const message = (data?.message ?? error.message)
      .replace(/^\[CONVEX[^\]]*\]\s*/, "")
      .replace(/^\[Request ID:[^\]]+\]\s*/, "")
      .trim();
    if (/^(server error|called by client)/i.test(message) || /server error\s+called by client/i.test(message)) {
      return "The Clash Royale data service could not complete this request. Please try again.";
    }
    return message || "Something went wrong while loading Clash Royale data.";
  }
  return "Something went wrong while loading Clash Royale data.";
}
