import type { Card } from "@/lib/mock-data";

export type UpgradeRarity = Card["rarity"];
export type UpgradeTargetLevel = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

export const MAX_CARD_LEVEL = 16;

export const UPGRADE_TARGET_LEVELS: readonly UpgradeTargetLevel[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
];

/** The level at which each rarity first becomes available. */
export const START_LEVELS: Readonly<Record<UpgradeRarity, number>> = {
  Common: 1,
  Rare: 3,
  Epic: 6,
  Legendary: 9,
  Champion: 11
};

/** Copies required to reach each target level. Zero means that level is not valid for that rarity. */
export const CARDS_REQUIRED: Readonly<Record<UpgradeRarity, Readonly<Record<UpgradeTargetLevel, number>>>> = {
  Common: { 2: 2, 3: 4, 4: 10, 5: 20, 6: 50, 7: 100, 8: 200, 9: 400, 10: 800, 11: 1_000, 12: 1_500, 13: 2_500, 14: 3_500, 15: 5_500, 16: 7_500 },
  Rare: { 2: 0, 3: 0, 4: 2, 5: 4, 6: 10, 7: 20, 8: 50, 9: 100, 10: 200, 11: 300, 12: 400, 13: 550, 14: 750, 15: 1_000, 16: 1_400 },
  Epic: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 2, 8: 4, 9: 10, 10: 20, 11: 30, 12: 50, 13: 70, 14: 100, 15: 130, 16: 180 },
  Legendary: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 2, 11: 4, 12: 6, 13: 9, 14: 12, 15: 14, 16: 20 },
  Champion: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 2, 13: 5, 14: 8, 15: 11, 16: 15 }
};

/** Gold required to reach each target level after the November 2025 progression update. */
export const GOLD_REQUIRED: Readonly<Record<UpgradeRarity, Readonly<Record<UpgradeTargetLevel, number>>>> = {
  Common: { 2: 5, 3: 20, 4: 50, 5: 150, 6: 400, 7: 1_000, 8: 2_000, 9: 4_000, 10: 8_000, 11: 15_000, 12: 25_000, 13: 40_000, 14: 60_000, 15: 90_000, 16: 120_000 },
  Rare: { 2: 0, 3: 0, 4: 50, 5: 150, 6: 400, 7: 1_000, 8: 2_000, 9: 4_000, 10: 8_000, 11: 15_000, 12: 25_000, 13: 40_000, 14: 60_000, 15: 90_000, 16: 120_000 },
  Epic: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 2_000, 9: 4_000, 10: 8_000, 11: 15_000, 12: 25_000, 13: 40_000, 14: 60_000, 15: 90_000, 16: 120_000 },
  Legendary: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 5_000, 11: 15_000, 12: 25_000, 13: 40_000, 14: 60_000, 15: 90_000, 16: 120_000 },
  Champion: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 25_000, 13: 40_000, 14: 60_000, 15: 90_000, 16: 120_000 }
};

export type UpgradeCost = {
  fromLevel: number;
  toLevel: number;
  cards: number;
  gold: number;
};

export type CardUpgradePlan = {
  card: Card;
  rarity: UpgradeRarity;
  level?: number;
  count: number;
  next: UpgradeCost | undefined;
  ready: boolean;
  cardsStillNeeded: number;
  goldStillNeeded: number;
  progress: number;
};

function isUpgradeTargetLevel(value: number): value is UpgradeTargetLevel {
  return UPGRADE_TARGET_LEVELS.includes(value as UpgradeTargetLevel);
}

export function upgradeCost(rarity: UpgradeRarity, fromLevel: number): UpgradeCost | undefined {
  const toLevel = fromLevel + 1;
  if (!isUpgradeTargetLevel(toLevel)) return undefined;

  const cards = CARDS_REQUIRED[rarity][toLevel];
  const gold = GOLD_REQUIRED[rarity][toLevel];
  if (cards === 0 && gold === 0) return undefined;
  return { fromLevel, toLevel, cards, gold };
}

function wholeNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function validLevel(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(MAX_CARD_LEVEL, Math.max(1, Math.floor(value)));
}

function upgradePath(rarity: UpgradeRarity, level: number) {
  const path: UpgradeCost[] = [];
  for (let fromLevel = level; fromLevel < MAX_CARD_LEVEL; fromLevel += 1) {
    const cost = upgradeCost(rarity, fromLevel);
    if (cost) path.push(cost);
  }
  return path;
}

export function buildCardUpgradePlan(card: Card): CardUpgradePlan {
  const level = validLevel(card.level);
  const count = wholeNumber(card.count, 0);
  if (level === undefined) {
    return {
      card,
      rarity: card.rarity,
      level: undefined,
      count,
      next: undefined,
      ready: false,
      cardsStillNeeded: 0,
      goldStillNeeded: 0,
      progress: 0
    };
  }

  const normalizedLevel = Math.max(level, START_LEVELS[card.rarity]);
  const next = upgradeCost(card.rarity, normalizedLevel);
  const path = upgradePath(card.rarity, normalizedLevel);
  const cardsStillNeeded = path.reduce((total, cost, index) => total + (index === 0 ? Math.max(0, cost.cards - count) : cost.cards), 0);
  const goldStillNeeded = path.reduce((total, cost) => total + cost.gold, 0);
  const levelSpan = MAX_CARD_LEVEL - START_LEVELS[card.rarity];
  const nextProgress = next && next.cards > 0 ? Math.min(1, count / next.cards) : 0;
  const progress = Math.min(1, Math.max(0, (normalizedLevel - START_LEVELS[card.rarity] + nextProgress) / levelSpan));

  return {
    card,
    rarity: card.rarity,
    level: normalizedLevel,
    count,
    next,
    ready: Boolean(next && count >= next.cards),
    cardsStillNeeded,
    goldStillNeeded,
    progress
  };
}

export function buildUpgradePlans(cards: Card[]) {
  return cards.map(buildCardUpgradePlan);
}
