import assert from "node:assert/strict";
import test from "node:test";
import { mergeSavedProfiles } from "./sync-profiles.ts";

test("merges guest and account profiles by game and tag while keeping the newest name", () => {
  assert.deepEqual(
    mergeSavedProfiles(
      [
        { game: "brawl-stars", tag: "#ABC", name: "Old name", updatedAt: 10 },
        { game: "clash-royale", tag: "XYZ", name: "Linda", updatedAt: 30 },
      ],
      [
        { game: "brawl-stars", tag: "abc", name: "Harmiox", updatedAt: 20 },
        { game: "brawl-stars", tag: "DEF", name: "Steve", updatedAt: 15 },
      ],
    ),
    [
      { game: "clash-royale", tag: "XYZ", name: "Linda", updatedAt: 30 },
      { game: "brawl-stars", tag: "ABC", name: "Harmiox", updatedAt: 20 },
      { game: "brawl-stars", tag: "DEF", name: "Steve", updatedAt: 15 },
    ],
  );
});
