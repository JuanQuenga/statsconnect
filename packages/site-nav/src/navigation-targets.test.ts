import assert from "node:assert/strict";
import test from "node:test";

import { gameAssetHref, gameDestinationHref, gameSwitcherHref } from "./navigation-targets.ts";

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
    "https://bs.statsconnect.app/",
  );
});

test("production navigation uses game subdomains and root-level player routes", () => {
  assert.equal(gameSwitcherHref("clash-royale"), "https://cr.statsconnect.app/");
  assert.equal(gameSwitcherHref("statsconnect", "https://cr.statsconnect.app"), "https://statsconnect.app/");
  assert.equal(gameDestinationHref("clash-royale", "#ABC"), "https://cr.statsconnect.app/players/ABC");
  assert.equal(gameDestinationHref("brawl-stars", "#ABC"), "https://bs.statsconnect.app/players?tag=ABC");
  assert.equal(gameSwitcherHref("clash-royale", "https://bs.statsconnect.app"), "https://cr.statsconnect.app/");
  assert.equal(gameAssetHref("clash-royale", { applicationOrigin: "https://cr.statsconnect.app", applicationShell: true }), "https://cr.statsconnect.app/cr/");
});

test("game assets stay local for standalone root and /cr deployments", () => {
  assert.equal(
    gameAssetHref("clash-royale", {
      currentPathname: "/news",
      currentSite: "clash-royale",
    }) + "apple-touch-icon-blue.png",
    "/apple-touch-icon-blue.png",
  );
  assert.equal(
    gameAssetHref("clash-royale", {
      currentPathname: "/cr/news",
      currentSite: "clash-royale",
    }) + "apple-touch-icon-blue.png",
    "/cr/apple-touch-icon-blue.png",
  );
});

test("game assets use the unified application origin when the shell mounts a game", () => {
  assert.equal(
    gameAssetHref("clash-royale", {
      applicationOrigin: "https://stats.example.test",
      applicationShell: true,
      currentPathname: "/cr/news",
      currentSite: "clash-royale",
    }) + "apple-touch-icon-blue.png",
    "https://stats.example.test/cr/apple-touch-icon-blue.png",
  );
});
