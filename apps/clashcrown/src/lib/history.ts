import { makeFunctionReference } from "convex/server";

export type PathSnapshot = {
  trophies?: number;
  bestTrophies?: number;
  rank?: number | null;
};

export type PlayerHistorySnapshot = {
  id: string;
  source: "api_profile" | "battle_log" | "legacy_trophy";
  observedAt: number;
  lastObservedAt: number;
  name: string;
  trophies?: number;
  bestTrophies?: number;
  expLevel?: number;
  arenaName?: string;
  clanTag?: string;
  clanName?: string;
  currentDeck?: Array<{ id: number; level?: number; evolutionLevel?: number }>;
  collection?: {
    cardsOwned: number;
    totalLevels: number;
    maxedCards: number;
    evolvedCards: number;
    starLevels: number;
  };
  totals?: {
    wins?: number;
    losses?: number;
    battleCount?: number;
    threeCrownWins?: number;
    challengeCardsWon?: number;
    tournamentCardsWon?: number;
    donations?: number;
    donationsReceived?: number;
    totalDonations?: number;
    warDayWins?: number;
    clanCardsCollected?: number;
  };
  path?: { current?: PathSnapshot; last?: PathSnapshot; best?: PathSnapshot };
};

export type HistoricalLeaderboard = {
  key: string;
  kind: "event" | "players" | "clans" | "clanwars";
  name: string;
  boardId?: number;
  locationId?: number;
  firstObservedAt: number;
  lastObservedAt: number;
  snapshotCount: number;
};

export type HistoricalLeaderboardSnapshot = {
  id: string;
  observedAt: number;
  lastObservedAt: number;
  entryCount: number;
  baseline: boolean;
};

export type HistoricalLeaderboardEntry = {
  rank: number;
  previousRank?: number;
  rankChange?: number;
  tag: string;
  name: string;
  score?: number;
  previousScore?: number;
  scoreChange?: number;
  trophies?: number;
  clanTag?: string;
  clanName?: string;
};

export type HistoricalLeaderboardDetail = {
  board: HistoricalLeaderboard;
  snapshot: HistoricalLeaderboardSnapshot;
  comparedAt: number | null;
  entries: HistoricalLeaderboardEntry[];
};

export const playerHistoryQuery = makeFunctionReference<
  "query",
  { tag: string; limit?: number },
  PlayerHistorySnapshot[]
>("clash/history:playerHistory");

export const leaderboardBoardsQuery = makeFunctionReference<
  "query",
  { limit?: number },
  HistoricalLeaderboard[]
>("clash/history:listLeaderboardBoards");

export const leaderboardSnapshotsQuery = makeFunctionReference<
  "query",
  { boardKey: string; limit?: number },
  HistoricalLeaderboardSnapshot[]
>("clash/history:listLeaderboardSnapshots");

export const leaderboardSnapshotQuery = makeFunctionReference<
  "query",
  { snapshotId: string; compareToId?: string; limit?: number },
  HistoricalLeaderboardDetail | null
>("clash/history:getLeaderboardSnapshot");
