import { api } from "../../../../packages/backend/convex/_generated/api";

/**
 * The Clash Game Site's single Interface to its namespaced Platform Backend
 * functions. Function identity and generated types belong here, rather than
 * being reconstructed as strings at each caller.
 */
export const clashBackend = {
  profiles: {
    player: api.clash.clashApi.getPlayerBundle,
    clan: api.clash.clashApi.getClanBundle,
    clanWar: api.clash.clashApi.getClanWar,
  },
  catalog: {
    cards: api.clash.clashApi.getCards,
    locations: api.clash.clashApi.getLocations,
    rankings: api.clash.clashApi.getRankings,
    leaderboards: api.clash.clashApi.getLeaderboards,
    leaderboard: api.clash.clashApi.getLeaderboard,
    searchClans: api.clash.clashApi.searchClans,
    globalTournaments: api.clash.clashApi.getGlobalTournaments,
    searchTournaments: api.clash.clashApi.searchTournaments,
    officialNews: api.clash.news.getOfficialNews,
  },
  meta: {
    pipelineStatus: api.clash.meta.pipelineStatus,
    topDecks: api.clash.meta.topDecks,
    topCards: api.clash.meta.topCards,
    topTowerTroops: api.clash.meta.topTowerTroops,
    deckMeta: api.clash.meta.deckMeta,
    deckMatchups: api.clash.meta.deckMatchups,
    discoverDecks: api.clash.meta.discoverDecks,
    seedTag: api.clash.meta.seedTag,
  },
  analytics: {
    cardReport: api.clash.analytics.cardReport,
    towerReport: api.clash.analytics.towerReport,
    deckReport: api.clash.analytics.deckReport,
    cardDetail: api.clash.analytics.cardDetail,
  },
  players: {
    search: api.clash.players.search,
    directorySize: api.clash.players.directorySize,
  },
  history: {
    profile: api.clash.cache.history,
    player: api.clash.history.playerHistory,
    leaderboardBoards: api.clash.history.listLeaderboardBoards,
    leaderboardSnapshots: api.clash.history.listLeaderboardSnapshots,
    leaderboardSnapshot: api.clash.history.getLeaderboardSnapshot,
  },
  clanManagement: {
    observe: api.clash.clanManagementActions.observe,
    dashboard: api.clash.clanManagement.dashboard,
  },
  personalization: {
    ensureAccount: api.clash.personalization.ensureAccount,
    getState: api.clash.personalization.getState,
    saveProfile: api.clash.personalization.saveProfile,
    removeProfile: api.clash.personalization.removeProfile,
    setDefaultProfile: api.clash.personalization.setDefaultProfile,
    recordRecent: api.clash.personalization.recordRecent,
    clearRecents: api.clash.personalization.clearRecents,
    updatePreferences: api.clash.personalization.updatePreferences,
    observeProfile: api.clash.personalization.observeProfile,
    createPairingCode: api.clash.personalization.createPairingCode,
    redeemPairingCode: api.clash.personalization.redeemPairingCode,
    clearAccount: api.clash.personalization.clearAccount,
  },
} as const;
