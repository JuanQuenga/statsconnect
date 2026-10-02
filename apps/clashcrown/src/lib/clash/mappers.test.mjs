import assert from "node:assert/strict";
import test from "node:test";
import { mapCard } from "./mappers.ts";

test("API rarity-relative card levels become in-game display levels", () => {
  for (const [rarity, level, maxLevel, expected] of [
    ["common", 13, 16, 13],
    ["rare", 12, 14, 14],
    ["epic", 8, 11, 13],
    ["legendary", 5, 8, 13],
    ["champion", 3, 6, 13],
  ]) {
    const card = mapCard({ name: "API card", rarity, level, maxLevel });
    assert.equal(card.level, expected, rarity);
    assert.equal(card.maxLevel, 16, rarity);
  }
});

test("catalog cards without a player level keep that level absent", () => {
  const card = mapCard({ name: "The Log", rarity: "legendary", maxLevel: 8 });
  assert.equal(card.level, undefined);
  assert.equal(card.maxLevel, 16);
});
