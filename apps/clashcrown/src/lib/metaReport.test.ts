import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMetaMap,
  buildMetaSummary,
  centredBarExtent,
  classifyQuadrant,
  deckBuilderHref,
  medianOf,
  nextMetaState,
  parseIdList,
  parseMetaQuery,
  relativeAge,
  selectMetaPulse,
  serializeMetaQuery,
  toggleCardFilter,
  topUsedCardIds,
  type MetaState,
  type SummaryInput
} from "./metaReport.ts";

const defaults: MetaState = {
  mode: "pathOfLegends",
  windowDays: 7,
  view: "overview",
  sort: "rating",
  include: [],
  exclude: []
};

test("parseMetaQuery falls back to defaults for missing or invalid values", () => {
  assert.deepEqual(parseMetaQuery({}), defaults);
  assert.deepEqual(parseMetaQuery({ mode: "nope", window: "30", view: "x", sort: "y" }), defaults);
});

test("parseMetaQuery accepts router-parsed numbers and arrays", () => {
  const state = parseMetaQuery({ mode: "ladder", window: 1, view: "decks", sort: "winRate", card: 26000000, exclude: ["28000000,26000000"] });
  assert.equal(state.mode, "ladder");
  assert.equal(state.windowDays, 1);
  assert.equal(state.view, "decks");
  assert.equal(state.sort, "winRate");
  assert.deepEqual(state.include, [26000000]);
  // A card cannot be required and excluded at once; include wins.
  assert.deepEqual(state.exclude, [28000000]);
});

test("a bare archetype param opens the archetypes view (legacy links)", () => {
  assert.equal(parseMetaQuery({ archetype: "1-2" }).view, "archetypes");
  assert.equal(parseMetaQuery({ archetype: "1-2" }).archetype, "1-2");
  assert.equal(parseMetaQuery({ archetype: "1-2", view: "decks" }).archetype, undefined);
});

test("parseIdList dedupes, drops junk and caps at eight", () => {
  assert.deepEqual(parseIdList("3, 1,3,abc,-4,0,2.5"), [3, 1]);
  assert.deepEqual(parseIdList("1,2,3,4,5,6,7,8,9,10"), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(parseIdList(undefined), []);
});

test("serializeMetaQuery omits defaults and round-trips", () => {
  assert.deepEqual(Object.values(serializeMetaQuery(defaults)).filter(Boolean), []);
  const state: MetaState = { ...defaults, mode: "ladder", windowDays: 1, view: "decks", sort: "popularity", include: [5, 6], exclude: [7] };
  const query = serializeMetaQuery(state);
  assert.equal(query.card, "5,6");
  assert.equal(query.window, "1");
  assert.deepEqual(parseMetaQuery(query), state);
});

test("nextMetaState drops archetype on mode change or leaving the view", () => {
  const current: MetaState = { ...defaults, view: "archetypes", archetype: "1-2" };
  assert.equal(nextMetaState(current, { mode: "ladder" }).archetype, undefined);
  assert.equal(nextMetaState(current, { view: "decks" }).archetype, undefined);
  assert.equal(nextMetaState(current, { sort: "winRate" }).archetype, "1-2");
});

test("toggleCardFilter moves a card between include and exclude", () => {
  const added = toggleCardFilter({ include: [1], exclude: [2] }, 2, "include");
  assert.deepEqual(added, { include: [1, 2], exclude: [] });
  assert.deepEqual(toggleCardFilter(added, 1, "include"), { include: [2], exclude: [] });
  assert.deepEqual(toggleCardFilter(added, 1, "exclude"), { include: [2], exclude: [1] });
});

test("deckBuilderHref seeds the /decks builder", () => {
  assert.equal(deckBuilderHref([1, 2, 3]), "/decks?tool=builder&deck=1,2,3");
  assert.equal(deckBuilderHref([]), "/decks?tool=builder");
});

test("selectMetaPulse picks each highlight by its documented rule", () => {
  const decks = [
    { deckHash: "a", uses: 900, winRate: 0.49, usageRate: 0.04, rating: 0.5 },
    { deckHash: "b", uses: 300, winRate: 0.58, usageRate: 0.01, rating: 0.61 },
    { deckHash: "c", uses: 900, winRate: 0.52, usageRate: 0.04, rating: 0.55 }
  ];
  const tiers = [
    { cardId: 10, tier: "A" as const, uses: 50, winRate: 0.7, score: 0.6 },
    { cardId: 11, tier: "S" as const, uses: 500, winRate: 0.56, score: 0.54 },
    { cardId: 12, tier: "S" as const, uses: 800, winRate: 0.55, score: 0.53 }
  ];
  const risers = [
    { cardId: 20, usageDelta: 0.01, winRateDelta: 0 },
    { cardId: 21, usageDelta: 0.03, winRateDelta: 0.01 }
  ];
  const archetypes = [
    { id: "x", uses: 1000, usageRate: 0.1, usageDelta: -0.01, winRate: 0.5 },
    { id: "y", uses: 400, usageRate: 0.04, usageDelta: 0.02, winRate: 0.53 }
  ];
  const pulse = selectMetaPulse({ decks, tiers, risers, archetypes });
  assert.equal(pulse.mostPlayed?.deckHash, "c");
  assert.equal(pulse.bestRated?.deckHash, "b");
  assert.equal(pulse.strongestCard?.cardId, 11);
  assert.equal(pulse.risingCard?.cardId, 21);
  assert.equal(pulse.hottestArchetype?.id, "y");
  assert.equal(pulse.leadArchetype?.id, "x");
});

test("selectMetaPulse returns nulls on empty data and ignores shrinking archetypes", () => {
  const pulse = selectMetaPulse({
    decks: [],
    tiers: [],
    risers: [],
    archetypes: [{ id: "x", uses: 1, usageRate: 0.1, usageDelta: -0.2, winRate: 0.5 }]
  });
  assert.equal(pulse.mostPlayed, null);
  assert.equal(pulse.strongestCard, null);
  assert.equal(pulse.hottestArchetype, null);
  assert.equal(pulse.leadArchetype?.id, "x");
});

test("topUsedCardIds orders by uses", () => {
  assert.deepEqual(topUsedCardIds([{ cardId: 1, uses: 5 }, { cardId: 2, uses: 9 }, { cardId: 3, uses: 7 }], 2), [2, 3]);
});

test("quadrants split at the usage median and an even win rate", () => {
  assert.equal(classifyQuadrant({ usageRate: 0.2, winRate: 0.52 }, 0.1), "staple");
  assert.equal(classifyQuadrant({ usageRate: 0.05, winRate: 0.5 }, 0.1), "gem");
  assert.equal(classifyQuadrant({ usageRate: 0.1, winRate: 0.49 }, 0.1), "overplayed");
  assert.equal(classifyQuadrant({ usageRate: 0.05, winRate: 0.4 }, 0.1), "struggling");
  assert.equal(medianOf([3, 1, 2]), 2);
  assert.equal(medianOf([4, 1, 2, 3]), 2.5);
  assert.equal(medianOf([]), 0);
});

test("buildMetaMap groups points and keeps 50% inside the win domain", () => {
  const map = buildMetaMap([
    { id: 1, usageRate: 0.3, winRate: 0.53, uses: 300 },
    { id: 2, usageRate: 0.1, winRate: 0.55, uses: 100 },
    { id: 3, usageRate: 0.2, winRate: 0.52, uses: 200 }
  ]);
  assert.equal(map.usageThreshold, 0.2);
  assert.deepEqual(map.groups.staple.map((point) => point.id), [1, 3]);
  assert.deepEqual(map.groups.gem.map((point) => point.id), [2]);
  assert.ok(map.winDomain[0] <= 0.5 && map.winDomain[1] >= 0.55);
});

test("centredBarExtent grows from 50% and saturates at the span", () => {
  assert.deepEqual(centredBarExtent(0.5), { direction: "even", extent: 0 });
  assert.equal(centredBarExtent(0.55).direction, "up");
  assert.ok(Math.abs(centredBarExtent(0.55).extent - 0.5) < 1e-9);
  assert.deepEqual(centredBarExtent(0.2), { direction: "down", extent: 1 });
});

test("relativeAge picks the largest sensible unit", () => {
  const now = 10 * 24 * 3600 * 1000;
  assert.deepEqual(relativeAge(now - 5 * 60000, now), { value: -5, unit: "minute" });
  assert.deepEqual(relativeAge(now - 3 * 3600000, now), { value: -3, unit: "hour" });
  assert.deepEqual(relativeAge(now - 3 * 86400000, now), { value: -3, unit: "day" });
});

const summaryInput: SummaryInput = {
  modeName: "Path of Legends",
  windowDays: 7,
  decksObserved: 12345,
  leadArchetype: { name: "Hog Rider + Earthquake", usageRate: 0.142, winRate: 0.513 },
  mostPlayed: { deckHash: "a", usageRate: 0.03, winRate: 0.5, uses: 900 },
  bestRated: { deckHash: "b", winRate: 0.574, uses: 410 },
  strongestCard: { name: "Goblin Barrel", winRate: 0.552, uses: 5400 },
  riser: { name: "Royal Recruits", usageDelta: 0.021 },
  decliner: { name: "Mega Knight", usageDelta: -0.013 }
};

test("buildMetaSummary reads the numbers back as prose", () => {
  const sentences = buildMetaSummary(summaryInput, "en");
  assert.equal(sentences.length, 4);
  assert.equal(
    sentences[0],
    "Across 12,345 decks observed in Path of Legends over the last 7 days, Hog Rider + Earthquake is the most-played archetype: it shows up in 14.2% of games and wins 51.3% of them."
  );
  assert.match(sentences[1], /best-rated deck, which weighs win rate against sample size, wins 57\.4% across 410 games/);
  assert.match(sentences[2], /^Goblin Barrel tops the card tier list with a 55\.2% win rate over 5,400 games\.$/);
  assert.equal(sentences[3], "Royal Recruits is the biggest climber, up 2.1 usage points on the previous week, while Mega Knight fell 1.3 points.");
});

test("buildMetaSummary notes when the best-rated deck is also the most played", () => {
  const sentences = buildMetaSummary({ ...summaryInput, bestRated: { deckHash: "a", winRate: 0.5, uses: 900 } }, "en");
  assert.match(sentences[1], /^The most-played list is also the best-rated deck/);
});

test("buildMetaSummary degrades to one sentence with no decks, and localizes", () => {
  const empty = buildMetaSummary({ modeName: "Challenges", windowDays: 1, decksObserved: 40 }, "en");
  assert.deepEqual(empty, ["Across 40 decks observed in Challenges over the last 24 hours, there are not yet enough games to rank decks."]);
  const spanish = buildMetaSummary(summaryInput, "es");
  assert.equal(spanish.length, 4);
  assert.match(spanish[0], /^En 12\.345 mazos observados en Path of Legends durante los últimos 7 días/);
  assert.match(spanish[3], /la semana anterior/);
});
