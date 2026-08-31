import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCardMetaRecords,
  filterCardCatalog,
  normalizeFiltersForSegment,
  rankLabel,
  rankCardMetaRows,
  selectCardMetaScope,
  statusForUsage,
  type CardFilters,
  type CardMetaRecord,
  type TopCardStat
} from "./cardMetaSelectors.ts";
import type { Card } from "./clash/domain.ts";

const cardStats: TopCardStat[] = [
  { cardId: 1, uses: 100, wins: 56, winRate: 0.56, usageRate: 0.5 },
  { cardId: 2, uses: 0, wins: 0, winRate: 0, usageRate: 0 }
];

function row(overrides: Partial<CardMetaRecord> = {}): CardMetaRecord {
  return {
    cardId: 1,
    rank: 1,
    uses: 100,
    wins: 55,
    winRate: 0.55,
    usageRate: 0.5,
    tier: "A",
    score: 0.52,
    movement: null,
    status: { kind: "observed" },
    ...overrides
  };
}

test("distinguishes a missing stat from an observed zero-use row", () => {
  const records = buildCardMetaRecords({ cards: cardStats, sampleFloor: 5 });

  assert.equal(records.get(3), undefined);
  assert.deepEqual(statusForUsage(undefined, 5), { kind: "not-observed" });
  assert.deepEqual(statusForUsage(0, 5), { kind: "insufficient", minimumUses: 5 });
  assert.deepEqual(records.get(2)?.status, { kind: "insufficient", minimumUses: 5 });
});

test("rising and declining rankings only include cards with directional movement", () => {
  const rows = [
    row({ cardId: 1, movement: { cardId: 1, recentUses: 70, previousUses: 40, recentWinRate: 0.55, previousWinRate: 0.5, usageDelta: 0.2, winRateDelta: 0.05 } }),
    row({ cardId: 2, movement: { cardId: 2, recentUses: 40, previousUses: 70, recentWinRate: 0.5, previousWinRate: 0.55, usageDelta: -0.2, winRateDelta: -0.05 } }),
    row({ cardId: 3, movement: null })
  ];

  assert.deepEqual(rankCardMetaRows(rows, "rising").map((item) => item.cardId), [1]);
  assert.deepEqual(rankCardMetaRows(rows, "declining").map((item) => item.cardId), [2]);
});

test("ranking ties resolve by sample and then card id", () => {
  const rows = [
    row({ cardId: 9, uses: 20, usageRate: 0.2, score: 0.4 }),
    row({ cardId: 3, uses: 40, usageRate: 0.2, score: 0.4 }),
    row({ cardId: 4, uses: 40, usageRate: 0.2, score: 0.4 })
  ];

  assert.deepEqual(rankCardMetaRows(rows, "popularity").map((item) => item.cardId), [3, 4, 9]);
  assert.deepEqual(rankCardMetaRows(rows, "performance").map((item) => item.cardId), [3, 4, 9]);
});

test("performance rankings require an observed confidence-adjusted score", () => {
  const rows = [
    row({ cardId: 1, winRate: 0.58, score: 0.43 }),
    row({ cardId: 2, winRate: 0.99, score: null }),
    row({ cardId: 3, winRate: 0.95, score: 0.9, status: { kind: "insufficient", minimumUses: 50 } })
  ];

  assert.deepEqual(rankCardMetaRows(rows, "performance").map((item) => item.cardId), [1]);
});

test("catalog filters cover rarity, elixir, evolution, hero, and search", () => {
  const cards: Card[] = [
    { id: 1, name: "Knight", elixir: 3, rarity: "Rare", image: "/knight.png" },
    { id: 2, name: "Evolved Knight", elixir: 3, rarity: "Rare", image: "/evo.png", isEvolution: true },
    { id: 3, name: "Archer Queen", elixir: 5, rarity: "Champion", image: "/queen.png", heroImage: "/hero.png" },
    { id: 4, name: "Golem", elixir: 8, rarity: "Epic", image: "/golem.png" }
  ];

  assert.deepEqual(filterCardCatalog(cards, { query: "knight", rarity: "All", elixir: "All", variant: "All" }).map((item) => item.id), [1, 2]);
  assert.deepEqual(filterCardCatalog(cards, { query: "", rarity: "Rare", elixir: "All", variant: "Evolutions" }).map((item) => item.id), [2]);
  assert.deepEqual(filterCardCatalog(cards, { query: "", rarity: "All", elixir: "6+", variant: "Base" }).map((item) => item.id), [4]);
  assert.deepEqual(filterCardCatalog(cards, { query: "", rarity: "All", elixir: "All", variant: "Heroes" }).map((item) => item.id), [3]);
});

test("switching to Tower Troops clears the irrelevant card variant filter", () => {
  const filters: CardFilters = { query: "", rarity: "All", elixir: "All", variant: "Heroes" };

  assert.deepEqual(normalizeFiltersForSegment("towerTroops", filters), { ...filters, variant: "All" });
  assert.deepEqual(normalizeFiltersForSegment("cards", filters), filters);
});

test("nullable ranks render as an em dash instead of #null", () => {
  assert.equal(rankLabel(3), "#3");
  assert.equal(rankLabel(null), "—");
  assert.equal(rankLabel(undefined), "—");
});

test("tower card detail scope uses tower observations and deck vocabulary", () => {
  const towerRow = row({ cardId: 99, rank: 1 });
  const scope = selectCardMetaScope({
    cardId: 99,
    isTowerTroop: true,
    regular: { byId: new Map([[99, row({ cardId: 99 })]]), decksObserved: 800, ranked: 20, loading: false },
    tower: { byId: new Map([[99, towerRow]]), decksObserved: 120, loading: false }
  });

  assert.equal(scope.record, towerRow);
  assert.equal(scope.decksObserved, 120);
  assert.equal(scope.ranked, 1);
  assert.equal(scope.countLabel, "decks");
});
