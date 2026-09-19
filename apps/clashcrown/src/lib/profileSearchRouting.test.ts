import assert from "node:assert/strict";
import test from "node:test";
import { profileSearchDestination } from "./profileSearchRouting.ts";

const search = {
  term: "king",
  kind: "players" as const,
  open: true,
  highlight: 0,
  rows: [{ href: "/players/P0LYQ" }],
  results: { players: [{ tag: "P0LYQ" }, { tag: "2PP" }] },
};

test("Enter chooses the highlighted suggestion while the list is visible", () => {
  assert.equal(profileSearchDestination(search), "/players/P0LYQ");
});

test("Enter after Escape submits the query, not the hidden highlighted suggestion", () => {
  assert.equal(profileSearchDestination({ ...search, open: false }), "/players?q=king");
});

test("unselected player and clan lookups retain their existing destinations", () => {
  assert.equal(profileSearchDestination({ ...search, highlight: -1, results: { tag: "2PP", players: [] } }), "/players/2PP");
  assert.equal(profileSearchDestination({ ...search, highlight: -1, results: { players: [{ tag: "2PP" }] } }), "/players/2PP");
  assert.equal(profileSearchDestination({ ...search, highlight: -1, kind: "clans", term: "#2PP" }), "/clans/2PP");
  assert.equal(profileSearchDestination({ ...search, highlight: -1, kind: "clans", term: "royal team" }), "/clans/search?name=royal%20team");
});
