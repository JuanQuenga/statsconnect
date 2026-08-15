import assert from "node:assert/strict";
import test from "node:test";
import { highestAvailableCardArt, selectCardArt } from "./assets.ts";

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
