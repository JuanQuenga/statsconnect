import assert from "node:assert/strict";
import test from "node:test";

import { playerBattleObservation } from "../convex/clash/lib/playerActivity.ts";

function participant(tag, crowns) {
  return { tag, crowns, cards: [] };
}

test("player activity records a result from either side of a battle", () => {
  const battle = {
    battleTime: "20260821T143000.000Z",
    type: "PvP",
    gameMode: { id: 72000006, name: "Ladder" },
    team: [participant("#P0LYQ", 3)],
    opponent: [participant("#2PP", 1)],
  };

  assert.deepEqual(playerBattleObservation(battle, "P0LYQ"), {
    fingerprint: "1787322600000:2PP~P0LYQ:PvP:72000006",
    battleTime: 1787322600000,
    result: "win",
  });
  assert.equal(playerBattleObservation(battle, "#2PP")?.result, "loss");
});

test("player activity includes draws and non-meta modes", () => {
  const battle = {
    battleTime: "20260820T010203.000Z",
    type: "clanMate",
    gameMode: { name: "Touchdown" },
    team: [participant("#P0LYQ", 1), participant("#8JCUV", 1)],
    opponent: [participant("#2PP", 1), participant("#9GRJ", 1)],
  };

  assert.equal(playerBattleObservation(battle, "P0LYQ")?.result, "draw");
  assert.equal(playerBattleObservation(battle, "missing"), undefined);
});
