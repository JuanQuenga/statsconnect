import type { FunctionReturnType } from "convex/server";
import { clashBackend } from "@/lib/platformBackend";

export const cardReportQuery = clashBackend.analytics.cardReport;
export const towerReportQuery = clashBackend.analytics.towerReport;
export const deckReportQuery = clashBackend.analytics.deckReport;
export const cardDetailQuery = clashBackend.analytics.cardDetail;

export type CardReport = FunctionReturnType<typeof cardReportQuery>;
export type TowerReport = FunctionReturnType<typeof towerReportQuery>;
export type DeckReport = FunctionReturnType<typeof deckReportQuery>;
export type CardDetailReport = FunctionReturnType<typeof cardDetailQuery>;
export type TrendPoint = CardReport["trends"][number]["points"][number];
export type EntityTrend = CardReport["trends"][number];
export type CardMover = CardReport["risers"][number];
export type TierRow = CardReport["tiers"][number];
export type Archetype = DeckReport["archetypes"][number];
export type DeckSummary = CardDetailReport["topDecks"][number];
export type RelatedCardStat = CardDetailReport["pairings"][number];
