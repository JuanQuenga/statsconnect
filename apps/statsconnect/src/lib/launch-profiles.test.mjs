import assert from "node:assert/strict";
import test from "node:test";

import { profileForLaunch } from "./launch-profiles.ts";

const profiles = [
  { game: "brawl-stars", tag: "2YGY", name: "Harmiox" },
  { game: "brawl-stars", tag: "ABC123", name: "Steve" },
  { game: "clash-royale", tag: "2YGY", name: "Linda" },
];

test("a Launch Route without a tag selects the first connected profile for its game", () => {
  assert.equal(profileForLaunch(profiles, "brawl-stars"), profiles[0]);
  assert.equal(profileForLaunch(profiles, "clash-royale"), profiles[2]);
});

test("a Launch Route with a tag selects the matching connected profile", () => {
  assert.equal(profileForLaunch(profiles, "brawl-stars", "  #abc123 "), profiles[1]);
});

test("a tagged Launch Route does not fall back to another connected profile", () => {
  assert.equal(profileForLaunch(profiles, "brawl-stars", "  #  "), undefined);
  assert.equal(profileForLaunch(profiles, "brawl-stars", "missing"), undefined);
  assert.equal(profileForLaunch(profiles, "clash-royale", "ABC123"), undefined);
});
