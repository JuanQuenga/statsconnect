import assert from "node:assert/strict";
import test from "node:test";
import { mapCard, mapPlayerBundle } from "./mappers.ts";

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

/** Minimal bundle fixture shaped like the backend's PlayerBundlePayload. */
function bundleWithDeck(deck, battles = []) {
  return {
    player: { data: { tag: "#TEST88", name: "Tester", currentDeck: deck }, fetchedAt: 0, stale: false },
    battles: { data: battles, fetchedAt: 0, stale: false },
    chests: { data: {}, fetchedAt: 0, stale: false },
  };
}

const sevenCards = ["Bats", "Cannon", "Minion Giant", "Rune Giant", "Skeletons", "Poison", "Barbarian Barrel"]
  .map((name, index) => ({ id: 26000000 + index, name }));

test("a seven-card deck gets a placeholder slot for the card the API omitted", () => {
  const player = mapPlayerBundle(bundleWithDeck(sevenCards));
  assert.equal(player.deck.length, 8);
  const slot = player.deck.at(-1);
  assert.equal(slot.name, "Unknown Card");
  assert.equal(slot.image, "/images/cards/unknown.png");
  assert.equal(slot.id, undefined);
});

test("the omitted slot is restored from the battle log's full deck", () => {
  const littlePrince = { id: 26000093, name: "Little Prince", rarity: "champion" };
  const battle = {
    team: [{ tag: "#TEST88", cards: [...sevenCards, littlePrince] }],
    opponent: [{ tag: "#FOE", cards: [] }],
  };
  const player = mapPlayerBundle(bundleWithDeck(sevenCards, [battle]));
  assert.equal(player.deck.length, 8);
  const slot = player.deck.at(-1);
  assert.equal(slot.name, "Little Prince");
  assert.equal(slot.id, 26000093);
  assert.notEqual(slot.image, "/images/cards/unknown.png");
});

test("battle decks that don't match the truncated profile leave the placeholder", () => {
  const differentDeck = {
    team: [{ tag: "#TEST88", cards: [{ id: 1, name: "Knight" }, ...sevenCards.slice(1), { id: 99, name: "Giant" }] }],
    opponent: [{ tag: "#FOE", cards: [] }],
  };
  const player = mapPlayerBundle(bundleWithDeck(sevenCards, [differentDeck]));
  assert.equal(player.deck.length, 8);
  assert.equal(player.deck.at(-1).name, "Unknown Card");
});

test("full and genuinely short decks are padded nowhere", () => {
  assert.equal(mapPlayerBundle(bundleWithDeck([...sevenCards, { id: 1, name: "Knight" }])).deck.length, 8);
  assert.equal(mapPlayerBundle(bundleWithDeck(sevenCards.slice(0, 3))).deck.length, 3);
});
