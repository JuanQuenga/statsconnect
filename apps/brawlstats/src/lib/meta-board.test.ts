import assert from "node:assert/strict";
import test from "node:test";
import {
  assignTiers,
  brawlerBestMaps,
  brawlerMatchups,
  brawlerModes,
  buildMetaBoard,
  median,
  metaHighlights,
  modesWithData,
  quadrantOf,
  sampleFloor,
  sortBoardRows,
  topPicksForMap,
  wilsonBounds,
  wilsonLowerBound,
  type Tier,
} from "./meta-board.ts";
import type { BrawlerMapStat, BrawlerMatchupStat } from "./types.ts";

const GEM = 48000000;
const BALL = 48000005;
const mapModes = new Map<number, number | undefined>([[1, GEM], [2, GEM], [3, BALL], [4, undefined]]);

function stat(mapId: number, brawlerId: number, wins: number, losses: number, starPlayer = 0): BrawlerMapStat {
  return { mapId, brawlerId, wins, losses, picks: wins + losses, starPlayer, winRate: 0, starRate: 0, trophyBucket: "all" };
}

function matchup(mapId: number, brawlerId: number, opponentBrawlerId: number, wins: number, losses: number): BrawlerMatchupStat {
  return { mapId, brawlerId, opponentBrawlerId, wins, losses, picks: wins + losses, winRate: 0, trophyBucket: "all" };
}

test("Wilson lower bound rewards sample size and stays within 0–100", () => {
  assert.equal(wilsonLowerBound(0, 0), 0);
  assert.ok(wilsonLowerBound(60, 100) > wilsonLowerBound(6, 10));
  assert.ok(wilsonLowerBound(600, 1000) < 60);
  const [lower, upper] = wilsonBounds(10, 10);
  assert.ok(lower > 60 && lower < 100);
  assert.equal(upper, 100);
  assert.ok(Math.abs(wilsonLowerBound(50, 100) - 40.38) < 0.05);
});

test("sample floor is the API minimum or 0.25% of picks, whichever is larger", () => {
  assert.equal(sampleFloor(1_000, 25), 25);
  assert.equal(sampleFloor(100_000, 25), 250);
});

test("board aggregates brawlers across maps and respects the mode filter", () => {
  const current = [stat(1, 10, 30, 20, 5), stat(2, 10, 10, 10), stat(3, 10, 5, 45), stat(1, 20, 20, 30)];
  const all = buildMetaBoard({ current, scope: { mapModes }, minPicks: 1 });
  const gem = buildMetaBoard({ current, scope: { mapModes, modeId: GEM }, minPicks: 1 });

  assert.equal(all.totalPicks, 170);
  const allTen = all.rows.find((row) => row.brawlerId === 10)!;
  assert.equal(allTen.picks, 120);
  assert.equal(gem.totalPicks, 120);
  const gemTen = gem.rows.find((row) => row.brawlerId === 10)!;
  assert.equal(gemTen.picks, 70);
  assert.equal(gemTen.winRate, (40 / 70) * 100);
  assert.equal(gemTen.useRate, (70 / 120) * 100);
  assert.equal(gemTen.starRate, (5 / 70) * 100);
  assert.equal(gem.hasPrevious, false);
  assert.equal(gemTen.useDelta, null);
});

test("rows under the sample floor are listed but never tiered", () => {
  const board = buildMetaBoard({ current: [stat(1, 10, 60, 40), stat(1, 20, 3, 0)], scope: { mapModes }, minPicks: 25 });
  const small = board.rows.find((row) => row.brawlerId === 20)!;
  assert.equal(small.qualified, false);
  assert.equal(small.tier, null);
  assert.equal(board.rows.find((row) => row.brawlerId === 10)!.tier, "S");
});

test("tiers follow score percentiles: 10% S, 20% A, 30% B, 25% C, 15% D", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({ score: 100 - index, picks: 100, qualified: true, tier: null as Tier | null }));
  assignTiers(rows);
  const counts = rows.reduce<Record<string, number>>((all, row) => ({ ...all, [row.tier!]: (all[row.tier!] || 0) + 1 }), {});
  assert.deepEqual(counts, { S: 2, A: 4, B: 6, C: 5, D: 3 });
  assert.equal(rows[0].tier, "S");
  assert.equal(rows[19].tier, "D");
});

test("use-rate deltas need a comparable previous sample", () => {
  const current = [stat(1, 10, 50, 50), stat(1, 20, 50, 50), stat(1, 30, 50, 50)];
  const previous = [stat(1, 10, 20, 20), stat(1, 20, 80, 80), stat(1, 30, 1, 1)];
  const board = buildMetaBoard({ current, previous, scope: { mapModes }, minPicks: 25 });
  const byId = new Map(board.rows.map((row) => [row.brawlerId, row]));

  assert.ok(Math.abs(byId.get(10)!.useDelta! - (100 / 3 - 40 / 202 * 100)) < 1e-9);
  assert.ok(byId.get(20)!.useDelta! < 0);
  assert.equal(byId.get(30)!.useDelta, null, "2 previous picks is below the previous-period floor");

  const highlights = metaHighlights(board);
  assert.equal(highlights.riser?.brawlerId, 10);
  assert.equal(highlights.faller?.brawlerId, 20);
});

test("highlights pick the best score, most picked, and a low-use hidden gem", () => {
  const current = [
    stat(1, 10, 560, 440), // popular, solid
    stat(1, 20, 1_300, 1_700), // most picked, losing
    stat(1, 30, 70, 30), // rare, winning
    stat(1, 40, 26, 24),
    stat(1, 50, 40, 60),
  ];
  const highlights = metaHighlights(buildMetaBoard({ current, scope: { mapModes }, minPicks: 25 }));
  assert.equal(highlights.best?.brawlerId, 30);
  assert.equal(highlights.mostPicked?.brawlerId, 20);
  assert.deepEqual(highlights.leaders.map((row) => row.brawlerId), [30, 10]);
  assert.equal(highlights.gem?.brawlerId, 40);
  assert.equal(highlights.riser, null);
  assert.equal(highlights.qualifiedCount, 5);
});

test("sorting keeps rows without a delta at the bottom in both directions", () => {
  const board = buildMetaBoard({
    current: [stat(1, 10, 60, 40), stat(1, 20, 40, 60), stat(1, 30, 50, 50)],
    previous: [stat(1, 10, 15, 15), stat(1, 20, 90, 90)],
    scope: { mapModes },
    minPicks: 25,
  });
  assert.deepEqual(sortBoardRows(board.rows, "delta", "desc").map((row) => row.brawlerId), [10, 20, 30]);
  assert.deepEqual(sortBoardRows(board.rows, "delta", "asc").map((row) => row.brawlerId), [20, 10, 30]);
  assert.deepEqual(sortBoardRows(board.rows, "win", "asc").map((row) => row.brawlerId), [20, 30, 10]);
});

test("median and quadrants", () => {
  assert.equal(median([]), 0);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(quadrantOf({ winRate: 55, useRate: 3 }, 2), "staples");
  assert.equal(quadrantOf({ winRate: 55, useRate: 1 }, 2), "gems");
  assert.equal(quadrantOf({ winRate: 45, useRate: 3 }, 2), "overplayed");
  assert.equal(quadrantOf({ winRate: 45, useRate: 1 }, 2), "avoid");
});

test("modes with data are ordered by volume and skip unmapped maps", () => {
  assert.deepEqual(modesWithData([stat(1, 10, 5, 5), stat(3, 10, 30, 30), stat(4, 10, 99, 99)], mapModes), [
    { modeId: BALL, picks: 60 },
    { modeId: GEM, picks: 10 },
  ]);
});

test("top picks for a live map are floored and ranked by score", () => {
  const stats = [stat(1, 10, 70, 30), stat(1, 20, 9, 1), stat(1, 30, 55, 45), stat(2, 40, 90, 10)];
  assert.deepEqual(topPicksForMap(stats, 1, 25).map((row) => row.brawlerId), [10, 30]);
  assert.deepEqual(topPicksForMap(stats, 9, 25), []);
});

test("brawler breakdowns: modes ignore the filter, maps respect it", () => {
  const stats = [stat(1, 10, 30, 20), stat(2, 10, 15, 15), stat(3, 10, 40, 10), stat(1, 20, 50, 50)];
  const modes = brawlerModes(stats, 10, mapModes, 25);
  assert.deepEqual(modes.map((row) => [row.modeId, row.picks]), [[BALL, 50], [GEM, 80]]);
  assert.deepEqual(brawlerBestMaps(stats, 10, { mapModes }, 25).map((row) => row.mapId), [3, 1, 2]);
  assert.deepEqual(brawlerBestMaps(stats, 10, { mapModes, modeId: GEM }, 25).map((row) => row.mapId), [1, 2]);
});

test("matchups aggregate across in-scope maps and split into best and worst", () => {
  const matchups = [
    matchup(1, 10, 20, 20, 5),
    matchup(2, 10, 20, 10, 5),
    matchup(1, 10, 30, 5, 25),
    matchup(1, 10, 40, 3, 2),
    matchup(3, 10, 50, 1, 30),
    matchup(1, 99, 20, 50, 0),
  ];
  const all = brawlerMatchups(matchups, 10, { mapModes });
  assert.deepEqual(all.best.map((row) => [row.opponentId, row.picks]), [[20, 40]]);
  assert.deepEqual(all.worst.map((row) => row.opponentId), [50, 30]);
  const gem = brawlerMatchups(matchups, 10, { mapModes, modeId: GEM });
  assert.deepEqual(gem.worst.map((row) => row.opponentId), [30]);
});
