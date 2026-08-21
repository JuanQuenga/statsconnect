import assert from "node:assert/strict";
import test from "node:test";

import { gameSwitcherHref } from "./navigation-targets.ts";

test("the Game Switcher sends game selections straight to same-origin game routes", () => {
  assert.equal(
    gameSwitcherHref("brawl-stars", "https://hub.example.test/"),
    "https://hub.example.test/bs/",
  );
  assert.equal(
    gameSwitcherHref("clash-royale", "https://hub.example.test"),
    "https://hub.example.test/cr/",
  );
});

test("the Game Switcher links saved profiles straight to their canonical routes", () => {
  assert.equal(
    gameSwitcherHref(
      { game: "brawl-stars", tag: "#2ygy", name: "Harmiox" },
      "https://hub.example.test",
    ),
    "https://hub.example.test/bs/players?tag=2YGY",
  );
  assert.equal(
    gameSwitcherHref(
      { game: "clash-royale", tag: "  #ABC123  ", name: "Linda" },
      "https://hub.example.test",
    ),
    "https://hub.example.test/cr/players/ABC123",
  );
});

test("the Game Switcher returns Hub selections to the Hub", () => {
  assert.equal(
    gameSwitcherHref("statsconnect", "https://hub.example.test/"),
    "https://hub.example.test/",
  );
});

test("the Game Switcher uses the production Hub when no origin is configured", () => {
  assert.equal(
    gameSwitcherHref("brawl-stars"),
    "https://stats.juanquenga.com/bs/",
  );
});
