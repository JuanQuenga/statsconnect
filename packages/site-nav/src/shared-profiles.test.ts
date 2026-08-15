import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSharedProfiles,
  serializeSharedProfiles,
  sharedProfileHref,
  stripSupercellColorTags,
  updateSharedProfiles,
} from "./shared-profiles.ts";

test("Supercell color markup is removed without changing ordinary text", () => {
  assert.equal(stripSupercellColorTags("Only<c3>Pro</c>"), "OnlyPro");
  assert.equal(stripSupercellColorTags("<cff00aa>Player</c>"), "Player");
  assert.equal(stripSupercellColorTags("1 < 2"), "1 < 2");
});

test("saving a player adds their in-game username under the correct game", () => {
  const profiles = updateSharedProfiles([], {
    type: "save",
    profile: {
      game: "brawl-stars",
      tag: "#2YGY",
      name: "Harmiox",
    },
  });

  assert.deepEqual(profiles, [
    {
      game: "brawl-stars",
      tag: "2YGY",
      name: "Harmiox",
    },
  ]);
});

test("saved tabs never expose Supercell color markup", () => {
  const profiles = updateSharedProfiles([], {
    type: "save",
    profile: {
      game: "clash-royale",
      tag: "#2YGY",
      name: "<c9>Harmiox</c>",
    },
  });

  assert.equal(profiles[0]?.name, "Harmiox");
});

test("saving an existing game tag refreshes its username without duplicating the tab", () => {
  const profiles = updateSharedProfiles(
    [{ game: "clash-royale", tag: "2YGY", name: "Old name" }],
    {
      type: "save",
      profile: { game: "clash-royale", tag: "#2ygy", name: "Harmiox" },
    },
  );

  assert.deepEqual(profiles, [
    { game: "clash-royale", tag: "2YGY", name: "Harmiox" },
  ]);
});

test("removing a saved player removes only that game's matching tab", () => {
  const profiles = updateSharedProfiles(
    [
      { game: "brawl-stars", tag: "2YGY", name: "Harmiox" },
      { game: "clash-royale", tag: "2YGY", name: "Harmiox" },
      { game: "brawl-stars", tag: "ABC123", name: "Steve" },
    ],
    { type: "remove", game: "brawl-stars", tag: "#2ygy" },
  );

  assert.deepEqual(profiles, [
    { game: "clash-royale", tag: "2YGY", name: "Harmiox" },
    { game: "brawl-stars", tag: "ABC123", name: "Steve" },
  ]);
});

test("saved profile tabs open the correct live player route", () => {
  const origins = {
    "brawl-stars": "https://brawlstats.juanquenga.com",
    "clash-royale": "https://clashcrown.juanquenga.com",
  } as const;

  assert.equal(
    sharedProfileHref(
      { game: "brawl-stars", tag: "2YGY", name: "Harmiox" },
      origins,
    ),
    "https://brawlstats.juanquenga.com/players?tag=%232YGY",
  );
  assert.equal(
    sharedProfileHref(
      { game: "clash-royale", tag: "2YGY", name: "Harmiox" },
      origins,
    ),
    "https://clashcrown.juanquenga.com/players/2YGY",
  );
});

test("shared profile storage round-trips public player names and tags", () => {
  const stored = serializeSharedProfiles([
    { game: "brawl-stars", tag: "#2ygy", name: "Harmiox" },
    { game: "clash-royale", tag: "ABC123", name: "Linda" },
  ]);

  assert.deepEqual(parseSharedProfiles(stored), [
    { game: "brawl-stars", tag: "2YGY", name: "Harmiox" },
    { game: "clash-royale", tag: "ABC123", name: "Linda" },
  ]);
});
