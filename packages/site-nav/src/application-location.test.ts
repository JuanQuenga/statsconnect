import assert from "node:assert/strict";
import test from "node:test";
import { applicationForLocation, gameRouteBase, gameRoutePath } from "./application-location.ts";

test("canonical game hosts own all root routes", () => {
  assert.equal(applicationForLocation("bs.statsconnect.app", "/players"), "brawl-stars");
  assert.equal(applicationForLocation("cr.statsconnect.app", "/cards"), "clash-royale");
  assert.equal(applicationForLocation("bs.statsconnect.app", "/cr/cards"), "brawl-stars");
});

test("hub and custom previews preserve path-based app selection", () => {
  assert.equal(applicationForLocation("statsconnect.app", "/"), "statsconnect");
  assert.equal(applicationForLocation("preview.vercel.app", "/bs/players"), "brawl-stars");
  assert.equal(applicationForLocation("localhost", "/cr"), "clash-royale");
  assert.equal(applicationForLocation("bs.statsconnect.app.example.com", "/players"), "statsconnect");
});

test("game routes use root only on the matching canonical host", () => {
  assert.equal(gameRouteBase("brawl-stars", "/bs/", "bs.statsconnect.app"), "/");
  assert.equal(gameRouteBase("clash-royale", "/cr/", "cr.statsconnect.app"), "/");
  assert.equal(gameRouteBase("brawl-stars", "/bs/", "localhost"), "/bs");
  assert.equal(gameRouteBase("brawl-stars", "/", "localhost"), "/");
  assert.equal(gameRoutePath("clash-royale", "/cr/", "cr.statsconnect.app", "/players/PY?x=1#stats"), "/players/PY?x=1#stats");
  assert.equal(gameRoutePath("clash-royale", "/cr/", "preview.vercel.app", "/players/PY"), "/cr/players/PY");
  assert.equal(gameRoutePath("clash-royale", "/cr/", "cr.statsconnect.app", "https://example.com/"), "https://example.com/");
  assert.equal(gameRoutePath("clash-royale", "/cr/", "cr.statsconnect.app", "//example.com/"), "//example.com/");
});
