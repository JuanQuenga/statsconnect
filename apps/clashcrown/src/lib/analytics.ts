import { makeFunctionReference } from "convex/server";
import type { MetaMode } from "./clash/battles";

export type TrendPoint = {
  day: number;
  uses: number;
  wins: number;
  winRate: number | null;
  usageRate: number;
};

export type EntityTrend = {
  id: string;
  uses: number;
  wins: number;
  winRate: number;
  usageRate: number;
  points: TrendPoint[];
};

export type CardMover = {
  cardId: number;
  recentUses: number;
  previousUses: number;
  recentWinRate: number;
  previousWinRate: number;
  usageDelta: number;
  winRateDelta: number;
};

export type TierRow = {
  cardId: number;
  tier: "S" | "A" | "B" | "C";
  uses: number;
  wins: number;
  winRate: number;
  usageRate: number;
  score: number;
};

export type DeckSummary = {
  deckHash: string;
  cardIds: number[];
  evolutionIds: number[];
  uses: number;
  wins: number;
  winRate: number;
  usageRate: number;
};

export type Archetype = {
  id: string;
  coreCardIds: number[];
  uses: number;
  wins: number;
  winRate: number;
  usageRate: number;
  usageDelta: number;
  points: TrendPoint[];
  representativeDecks: DeckSummary[];
};

export type CardReport = {
  windowDays: number;
  recentDecks: number;
  previousDecks: number;
  minTierUses: number;
  minMoverUses: number;
  truncated: boolean;
  tiers: TierRow[];
  risers: CardMover[];
  decliners: CardMover[];
  trends: EntityTrend[];
  methodology: string;
};

export type TowerReport = {
  windowDays: number;
  decksObserved: number;
  truncated: boolean;
  trends: EntityTrend[];
};

export type DeckReport = {
  windowDays: number;
  recentDecks: number;
  previousDecks: number;
  minArchetypeUses: number;
  truncated: boolean;
  deckTrends: EntityTrend[];
  archetypes: Archetype[];
  methodology: string;
};

export type RelatedCardStat = { cardId: number; uses: number; wins: number; winRate: number };

export type CardDetailReport = {
  windowDays: number;
  minPairUses: number;
  minCounterUses: number;
  truncated: boolean;
  trend: TrendPoint[];
  topDecks: DeckSummary[];
  pairings: RelatedCardStat[];
  counters: RelatedCardStat[];
  evolution: null | {
    uses: number;
    wins: number;
    winRate: number;
    baseUses: number;
    baseWins: number;
    baseWinRate: number | null;
  };
};

type ReportArgs = { mode: MetaMode; windowDays?: number };

export const cardReportQuery = makeFunctionReference<"query", ReportArgs, CardReport>("clash/analytics:cardReport");
export const towerReportQuery = makeFunctionReference<"query", ReportArgs, TowerReport>("clash/analytics:towerReport");
export const deckReportQuery = makeFunctionReference<"query", ReportArgs, DeckReport>("clash/analytics:deckReport");
export const cardDetailQuery = makeFunctionReference<
  "query",
  ReportArgs & { cardId: number },
  CardDetailReport
>("clash/analytics:cardDetail");
