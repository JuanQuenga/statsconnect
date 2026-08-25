import assert from "node:assert/strict";
import test from "node:test";
import { brawlerHeroArtwork } from "./artwork.ts";

test("brawler detail heroes prefer full model art over catalog icons", () => {
  const artwork = brawlerHeroArtwork(16000095, {
    imageUrl: "https://cdn.example/border.png",
    imageUrl2: "https://cdn.example/borderless.png",
  });

  assert.deepEqual(artwork, {
    fallbackSrc: "https://cdn.example/borderless.png",
    kind: "model",
    src: "https://cdn.brawlify.com/brawlers/model/16000095.png",
  });
});

test("brawler detail heroes keep supported feature art ahead of model art", () => {
  const artwork = brawlerHeroArtwork(16000107, {});

  assert.equal(artwork.kind, "feature");
  assert.equal(
    artwork.src,
    "https://brawlstars.inbox.supercell.com/xdjcscmv3zo3/4CF9yj49X04L66kRTG2ZyI/5410496b3d48d6c65fec7072099e4f2e/800x433.png",
  );
  assert.equal(artwork.fallbackSrc, "https://cdn.brawlify.com/brawlers/borders/16000107.png");
});
