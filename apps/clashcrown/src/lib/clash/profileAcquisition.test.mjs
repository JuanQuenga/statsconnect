import assert from "node:assert/strict";
import test from "node:test";
import { profileIdentity } from "./profileIdentity.ts";

test("profile identity normalizes equivalent player tags to one cache key", () => {
  assert.deepEqual(profileIdentity("player", " #p0lyq "), {
    kind: "player",
    tag: "P0LYQ",
    cacheKey: ["clash-profile", "player", "P0LYQ"],
  });
  assert.deepEqual(profileIdentity("player", "#P0LYQ").cacheKey, ["clash-profile", "player", "P0LYQ"]);
});

test("player and clan cache identities cannot collide", () => {
  assert.notDeepEqual(profileIdentity("player", "#2pp").cacheKey, profileIdentity("clan", "#2pp").cacheKey);
});

test("invalid profile tags fail before transport", () => {
  assert.throws(() => profileIdentity("player", "not-a-tag"), /valid Clash Royale tag/i);
});
