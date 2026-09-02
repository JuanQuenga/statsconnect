import {
  foldBattle,
  newFoldMaps,
  type FoldPerson,
  type FoldTeam,
} from "./foldPolicy.ts";
import {
  bucketBreakdown,
  combineStatRows,
  combineTeamRows,
  groupSum,
} from "./bucketPolicy.ts";

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}: expected ${right}, received ${left}`);
}

const DAY = 1_759_545_600_000; // 2026-01-05T00:00:00Z, any fixed instant works

function person(brawlerId: number, bucket: FoldPerson["bucket"], won: boolean): FoldPerson {
  return { brawlerId, bucket, won, isStar: false };
}

// One fresh 3v3 battle: two decided teams of three.
const blue = newFoldMaps();
const blueTeam: FoldTeam = {
  bucket: "1000+",
  brawlerIds: [16_000_001, 16_000_002, 16_000_003],
  won: true,
  people: [
    person(16_000_001, "1000+", true),
    person(16_000_002, "500-999", true),
    person(16_000_003, "0-499", true),
  ],
};
const redTeam: FoldTeam = {
  bucket: "1000+",
  brawlerIds: [16_000_004, 16_000_005, 16_000_006],
  won: false,
  people: [
    person(16_000_004, "1000+", false),
    person(16_000_005, "500-999", false),
    person(16_000_006, "0-499", false),
  ],
};
foldBattle(blue, {
  mapId: 15_000_001,
  trendDay: 20_260_105,
  observedAt: DAY,
  people: [...blueTeam.people, ...redTeam.people],
  statTeams: [blueTeam, redTeam],
  matchupTeams: [blueTeam, redTeam],
});

// The halved fan-out, asserted as the exact read/write pairs one 3v3 folds:
// 6 brawler + 6 daily brawler + 2 team + 18 matchup + 18 daily matchup = 50,
// down from ~100 when every fold also wrote a redundant "all" row.
equal(blue.brawlerDeltas.size, 6, "one lifetime row per participant");
equal(blue.dailyBrawlerDeltas.size, 6, "one daily row per participant");
equal(blue.teamDeltas.size, 2, "one team row per side");
equal(blue.matchupDeltas.size, 18, "one matchup row per ordered cross-team pair");
equal(blue.dailyMatchupDeltas.size, 18, "one daily matchup row per ordered cross-team pair");
equal(
  blue.brawlerDeltas.size +
    blue.dailyBrawlerDeltas.size +
    blue.teamDeltas.size +
    blue.matchupDeltas.size +
    blue.dailyMatchupDeltas.size,
  50,
  "a fresh 3v3 folds at most 50 aggregate pairs",
);

// Drawn matches keep matchup rows but with neither side credited.
const drawn = newFoldMaps();
const drawnTeam: FoldTeam = { ...blueTeam, won: null };
const drawnRed: FoldTeam = { ...redTeam, won: null };
foldBattle(drawn, {
  mapId: 15_000_001,
  trendDay: null,
  observedAt: null,
  people: [...blueTeam.people, ...redTeam.people],
  statTeams: null,
  matchupTeams: [drawnTeam, drawnRed],
});
equal(drawn.matchupDeltas.size, 18, "draws still fold matchup rows");
equal(drawn.dailyMatchupDeltas.size, 0, "undated battles skip daily rows");
deepEqual(
  [...drawn.matchupDeltas.values()].every((delta) => delta.wins === 0 && delta.losses === 0),
  true,
  "draws credit neither side",
);

// Bucket rows partition observations, so summing them reconstructs "all".
deepEqual(bucketBreakdown("all"), ["0-499", "500-999", "1000+"], "all expands to every bucket");
deepEqual(bucketBreakdown("500-999"), ["500-999"], "a concrete bucket reads only itself");

const bucketRows = [
  { key: "m1:16000000", bucket: "0-499", wins: 3, losses: 1, picks: 4, starPlayer: 1 },
  { key: "m1:16000000", bucket: "500-999", wins: 8, losses: 2, picks: 10, starPlayer: 2 },
  { key: "m1:16000000", bucket: "1000+", wins: 20, losses: 6, picks: 26, starPlayer: 4 },
  { key: "m1:16000001", bucket: "1000+", wins: 1, losses: 1, picks: 2, starPlayer: 0 },
];
const merged = groupSum(bucketRows, (row) => row.key, combineStatRows);
equal(merged.length, 2, "grouping collapses bucket rows per brawler");
const reconstructed = merged.find((row) => row.key === "m1:16000000");
deepEqual(
  reconstructed && { wins: reconstructed.wins, losses: reconstructed.losses, picks: reconstructed.picks, starPlayer: reconstructed.starPlayer },
  { wins: 31, losses: 9, picks: 40, starPlayer: 7 },
  "summed buckets reproduce the legacy all-bucket totals",
);

const teamRows = [
  { key: "t1", wins: 2, losses: 3, picks: 5 },
  { key: "t1", wins: 4, losses: 1, picks: 5 },
];
const mergedTeams = groupSum(teamRows, (row) => row.key, combineTeamRows);
deepEqual(
  mergedTeams,
  [{ key: "t1", wins: 6, losses: 4, picks: 10 }],
  "team rows merge picks, wins, and losses",
);

console.log("ok - ingest fold bounds and all-bucket reconstruction");
