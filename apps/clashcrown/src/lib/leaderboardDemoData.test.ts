import assert from "node:assert/strict";
import test from "node:test";
import { demoClanWarRankings, demoClans, demoClansForLocation, demoLeaderboards, demoLocations, demoPlayers, demoPlayersForBoard, demoRankingHref } from "./leaderboardDemoData.ts";

test("demo leaderboard data is deterministic and complete enough for each desk", () => {
  assert.equal(demoLeaderboards.length, 2);
  assert.equal(demoPlayers.length, 12);
  assert.equal(demoClans.length, 12);
  assert.equal(demoClanWarRankings.length, demoClans.length);
  assert.equal(demoLocations[0].name, "Global");
  assert.deepEqual(demoPlayers.slice(0, 3).map((row) => row.rank), [1, 2, 3]);
  assert.deepEqual(demoClans.slice(0, 3).map((row) => row.rank), [1, 2, 3]);
});

test("demo rows use local-safe tags and never the score sentinel", () => {
  assert.ok(demoPlayers.every((row) => row.tag.startsWith("#CCDEMO")));
  assert.ok(demoClans.every((row) => row.tag.startsWith("#CLANDEMO")));
  assert.ok(demoPlayers.every((row) => row.score !== 2_147_483_647));
});

test("demo board and region selectors change the underlying rows", () => {
  assert.notDeepEqual(demoPlayersForBoard(demoLeaderboards[0].id), demoPlayersForBoard(demoLeaderboards[1].id));
  assert.ok(demoClansForLocation(demoClans, demoLocations[1].id).every((row) => row.location?.id === demoLocations[1].id));
  assert.notEqual(demoClansForLocation(demoClans, demoLocations[1].id).length, demoClans.length);
});

test("demo ranking links resolve to the built-in profile fixtures", () => {
  assert.equal(demoRankingHref("players"), "/players/CCDEMO");
  assert.equal(demoRankingHref("clans"), "/clans/CCDEMO");
  assert.equal(demoRankingHref("clanwars"), "/clans/CCDEMO");
});
