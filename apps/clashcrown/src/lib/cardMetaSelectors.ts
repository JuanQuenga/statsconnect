import type { FunctionReturnType } from "convex/server";
import type { Card } from "@/lib/clash/domain";
import type { topCardsQuery, topTowerTroopsQuery } from "@/lib/convex";
import type { CardMover, CardReport } from "@/lib/analytics";

export type TopCardStat = NonNullable<FunctionReturnType<typeof topCardsQuery>>["cards"][number];
export type TopTowerTroopStat = NonNullable<FunctionReturnType<typeof topTowerTroopsQuery>>["towerTroops"][number];

export type CardMetaTab = "popularity" | "performance" | "rising" | "declining";
export const CARD_META_TABS: readonly CardMetaTab[] = ["popularity", "performance", "rising", "declining"];

export type CardMetaTier = "S" | "A" | "B" | "C";

export type CardMetaStatus =
  | { kind: "observed" }
  | { kind: "insufficient"; minimumUses: number }
  | { kind: "not-observed" };

export type CardMetaRecord = {
  cardId: number;
  rank: number | null;
  uses: number;
  wins: number;
  winRate: number;
  usageRate: number;
  tier: CardMetaTier | null;
  score: number | null;
  movement: CardMover | null;
  status: CardMetaStatus;
};

export type CardMetaScope = {
  record: CardMetaRecord | undefined;
  decksObserved: number;
  ranked: number;
  loading: boolean;
  countLabel: "games" | "decks";
};

/** Selects the correct denominator and occurrence vocabulary for a card detail. */
export function selectCardMetaScope(input: {
  cardId: number | undefined;
  isTowerTroop: boolean;
  regular: { byId: ReadonlyMap<number, CardMetaRecord>; decksObserved: number; ranked: number; loading: boolean };
  tower: { byId: ReadonlyMap<number, CardMetaRecord>; decksObserved: number; loading: boolean };
}): CardMetaScope {
  if (input.isTowerTroop) {
    return {
      record: input.cardId === undefined ? undefined : input.tower.byId.get(input.cardId),
      decksObserved: input.tower.decksObserved,
      ranked: input.tower.byId.size,
      loading: input.tower.loading,
      countLabel: "decks"
    };
  }
  return {
    record: input.cardId === undefined ? undefined : input.regular.byId.get(input.cardId),
    decksObserved: input.regular.decksObserved,
    ranked: input.regular.ranked,
    loading: input.regular.loading,
    countLabel: "games"
  };
}

export type CardMetaInput = {
  cards: readonly TopCardStat[];
  report?: CardReport;
  sampleFloor?: number;
};

export type CardFilterRarity = "All" | Card["rarity"];
export type CardFilterElixir = "All" | "1" | "2" | "3" | "4" | "5" | "6+";
export type CardFilterVariant = "All" | "Evolutions" | "Heroes" | "Base";
export type CardCatalogSegment = "cards" | "towerTroops";

export type CardFilters = {
  query: string;
  rarity: CardFilterRarity;
  elixir: CardFilterElixir;
  variant: CardFilterVariant;
};

/** Tower Troops do not have regular-card evolution/hero variants. */
export function normalizeFiltersForSegment(segment: CardCatalogSegment, filters: CardFilters): CardFilters {
  return segment === "towerTroops" && filters.variant !== "All"
    ? { ...filters, variant: "All" }
    : filters;
}

export function statusForUsage(uses: number | undefined, minimumUses: number | undefined): CardMetaStatus {
  if (uses === undefined) return { kind: "not-observed" };
  const minimum = minimumUses ?? 0;
  return uses < minimum ? { kind: "insufficient", minimumUses: minimum } : { kind: "observed" };
}

function baseRecord(
  row: Pick<TopCardStat, "cardId" | "uses" | "wins" | "winRate" | "usageRate">,
  rank: number | null,
  minimumUses: number | undefined
): CardMetaRecord {
  return {
    cardId: row.cardId,
    rank,
    uses: row.uses,
    wins: row.wins,
    winRate: row.winRate,
    usageRate: row.usageRate,
    tier: null,
    score: null,
    movement: null,
    status: statusForUsage(row.uses, minimumUses)
  };
}

function applyReportFields(record: CardMetaRecord, report: CardReport | undefined, minimumUses: number | undefined) {
  const tier = report?.tiers.find((row) => row.cardId === record.cardId);
  const movement = [...(report?.risers ?? []), ...(report?.decliners ?? [])].find(
    (row) => row.cardId === record.cardId
  );
  return {
    ...record,
    tier: tier?.tier ?? null,
    score: tier?.score ?? null,
    movement: movement ?? null,
    status: statusForUsage(record.uses, minimumUses)
  } satisfies CardMetaRecord;
}

/**
 * Joins the popularity query with the deeper report without inventing rows.
 * A report tier can appear outside the popularity query's limit, so those
 * rows are included with a null popularity rank and the report's own sample.
 */
export function buildCardMetaRecords(input: CardMetaInput): Map<number, CardMetaRecord> {
  const minimumUses = input.report?.minTierUses ?? input.sampleFloor;
  const records = new Map<number, CardMetaRecord>();

  for (const [index, row] of input.cards.entries()) {
    records.set(row.cardId, applyReportFields(baseRecord(row, index + 1, minimumUses), input.report, minimumUses));
  }

  for (const row of input.report?.tiers ?? []) {
    if (records.has(row.cardId)) continue;
    records.set(
      row.cardId,
      applyReportFields(baseRecord(row, null, minimumUses), input.report, minimumUses)
    );
  }

  return records;
}

function scoreForSort(row: CardMetaRecord) {
  return row.score ?? Number.NEGATIVE_INFINITY;
}

function movementForSort(row: CardMetaRecord) {
  return row.movement?.usageDelta ?? Number.NEGATIVE_INFINITY;
}

/** Stable, deterministic ranking used by the board and covered independently of React. */
export function rankCardMetaRows(rows: readonly CardMetaRecord[], tab: CardMetaTab): CardMetaRecord[] {
  const eligible = rows.filter((row) => {
    if (tab === "performance") return row.status.kind === "observed" && row.score !== null;
    if (tab === "rising") return row.status.kind === "observed" && (row.movement?.usageDelta ?? 0) > 0;
    if (tab === "declining") return row.status.kind === "observed" && (row.movement?.usageDelta ?? 0) < 0;
    if (row.status.kind === "not-observed") return false;
    return true;
  });

  return [...eligible].sort((left, right) => {
    if (tab === "popularity") {
      return right.usageRate - left.usageRate || right.uses - left.uses || left.cardId - right.cardId;
    }
    if (tab === "performance") {
      return scoreForSort(right) - scoreForSort(left) || right.uses - left.uses || left.cardId - right.cardId;
    }
    if (tab === "rising") {
      return movementForSort(right) - movementForSort(left) || right.uses - left.uses || left.cardId - right.cardId;
    }
    return movementForSort(left) - movementForSort(right) || right.uses - left.uses || left.cardId - right.cardId;
  });
}

function hasEvolution(card: Card) {
  return card.isEvolution === true || card.variant === "Evolution" || card.canEvolve === true || card.evolutionImage !== undefined;
}

function hasHero(card: Card) {
  return card.variant === "Hero" || card.heroImage !== undefined;
}

export function filterCardCatalog(cards: readonly Card[], filters: CardFilters): Card[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return cards.filter((card) => {
    if (query && !card.name.toLocaleLowerCase().includes(query)) return false;
    if (filters.rarity !== "All" && card.rarity !== filters.rarity) return false;
    if (filters.elixir !== "All") {
      if (filters.elixir === "6+" ? card.elixir < 6 : card.elixir !== Number(filters.elixir)) return false;
    }
    if (filters.variant === "Evolutions" && !hasEvolution(card)) return false;
    if (filters.variant === "Heroes" && !hasHero(card)) return false;
    if (filters.variant === "Base" && (hasEvolution(card) || hasHero(card))) return false;
    return true;
  });
}

export function cardMetaTabLabel(tab: CardMetaTab) {
  const labels: Record<CardMetaTab, string> = {
    popularity: "Popularity",
    performance: "Performance",
    rising: "Rising",
    declining: "Declining"
  };
  return labels[tab];
}

export function movementLabel(row: CardMetaRecord) {
  const delta = row.movement?.usageDelta;
  if (delta === undefined || delta === 0) return "No movement data";
  const points = `${Math.abs(delta * 100).toFixed(1)} pp`;
  return delta > 0 ? `+${points}` : `−${points}`;
}

export function tierLabel(row: CardMetaRecord) {
  return row.tier ? `${row.tier} tier` : "Tier not established";
}

/** Renders nullable API ranks without leaking a literal `#null` into the UI. */
export function rankLabel(rank: number | null | undefined) {
  return typeof rank === "number" && Number.isFinite(rank) ? `#${rank}` : "—";
}
