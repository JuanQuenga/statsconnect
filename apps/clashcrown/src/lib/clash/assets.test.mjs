import assert from "node:assert/strict";
import test from "node:test";
import { arenaImage, cardArtFallbacks, highestAvailableCardArt, leagueImage, selectCardArt } from "./assets.ts";

test("current Trophy Road arenas do not fall back to Training Camp", () => {
  assert.equal(
    arenaImage({ id: 54000143, name: "Little Prince's Tavern", rawName: "Arena_L17" }),
    "/images/arenas/arena31.png"
  );
  assert.equal(arenaImage({ name: "Little Prince's Tavern" }), "/images/arenas/arena31.png");
  assert.equal(
    arenaImage({ id: 54000144, name: "Spirit Square", rawName: "Arena_L18" }),
    "/images/arenas/arena24.png"
  );
  assert.equal(arenaImage({ name: "Spirit Square" }), "/images/arenas/arena24.png");
});

test("arena resolution supports API subtitles and internal names", () => {
  assert.equal(arenaImage({ name: "Royal Crypt" }), "/images/arenas/arena17.png");
  assert.equal(arenaImage({ rawName: "Arena_L3" }), "/images/arenas/arena17.png");
  assert.equal(arenaImage({ name: "Arena 32" }), "/images/arenas/arena24.png");
  assert.equal(arenaImage(), "/images/arenas/arena0.png");
});

test("ranked league images use the matching vendored badge", () => {
  assert.equal(leagueImage(1), "/images/arenas/league1.png");
  assert.equal(leagueImage(10), "/images/arenas/league10.png");
  assert.equal(leagueImage(99), "/images/arenas/league10.png");
  assert.equal(leagueImage(), "/images/arenas/league10.png");
});

test("catalog cards show the highest available portrait tier", () => {
  assert.equal(
    highestAvailableCardArt({
      image: "base.png",
      evolutionImage: "evolution.png",
      heroImage: "hero.png"
    }),
    "hero.png"
  );
  assert.equal(
    highestAvailableCardArt({ image: "base.png", evolutionImage: "evolution.png" }),
    "evolution.png"
  );
  assert.equal(highestAvailableCardArt({ image: "base.png" }), "base.png");
});

test("a base collection card keeps its base art when variants are merely available", () => {
  assert.deepEqual(
    selectCardArt({
      image: "base.png",
      evolutionImage: "evolution.png",
      heroImage: "hero.png"
    }),
    { src: "base.png", variant: undefined }
  );
});

test("an active Hero uses gold Hero art even when Evolution art also exists", () => {
  assert.deepEqual(
    selectCardArt({
      image: "active-slot.png",
      variant: "Hero",
      evolutionImage: "evolution.png",
      heroImage: "hero.png"
    }),
    { src: "hero.png", variant: "Hero" }
  );
});

test("an active Evolution uses its purple Evolution art", () => {
  assert.deepEqual(
    selectCardArt({
      image: "active-slot.png",
      variant: "Evolution",
      evolutionImage: "evolution.png"
    }),
    { src: "evolution.png", variant: "Evolution" }
  );
});

test("an active variant keeps its variant treatment when only the API-selected image is available", () => {
  assert.deepEqual(
    selectCardArt({ image: "api-selected-hero.png", variant: "Hero" }),
    { src: "api-selected-hero.png", variant: "Hero" }
  );
});

test("card art falls back to matching vendored portraits before the unknown placeholder", () => {
  assert.deepEqual(cardArtFallbacks({ name: "Elite Barbarians" }), [
    "/images/cards/elite-barbarians.png",
    "/images/cards/unknown.png"
  ]);
  assert.deepEqual(cardArtFallbacks({ name: "Battle Ram", variant: "Evolution" }), [
    "/images/cards/battle-ram-ev1.png",
    "/images/cards/battle-ram.png",
    "/images/cards/unknown.png"
  ]);
});
