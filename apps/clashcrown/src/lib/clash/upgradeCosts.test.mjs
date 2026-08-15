import assert from "node:assert/strict";
import test from "node:test";
import { buildCardUpgradePlan, MAX_CARD_LEVEL, upgradeCost } from "./upgradeCosts.ts";

test("a Common card upgrades from level 15 to the current level-16 maximum", () => {
  assert.equal(MAX_CARD_LEVEL, 16);
  assert.deepEqual(upgradeCost("Common", 15), {
    fromLevel: 15,
    toLevel: 16,
    cards: 7_500,
    gold: 120_000
  });
});

test("Champion upgrade costs use the post-Elite cards-and-gold table", () => {
  assert.deepEqual(upgradeCost("Champion", 12), {
    fromLevel: 12,
    toLevel: 13,
    cards: 5,
    gold: 40_000
  });
});

test("a level-16 card is maxed and has no remaining upgrade cost", () => {
  const plan = buildCardUpgradePlan({
    name: "Knight",
    rarity: "Common",
    image: "knight.png",
    elixir: 3,
    level: 16
  });

  assert.equal(plan.level, 16);
  assert.equal(plan.next, undefined);
  assert.equal(plan.cardsStillNeeded, 0);
  assert.equal(plan.goldStillNeeded, 0);
  assert.equal(plan.progress, 1);
});
