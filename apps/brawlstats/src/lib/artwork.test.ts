import assert from "node:assert/strict";
import test from "node:test";
import { brawlerCardFallbackUrl, brawlerHeroArtwork } from "./artwork.ts";

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

test("Nori uses the 3D viewer with official feature art as its image fallback", () => {
  const artwork = brawlerHeroArtwork(16000107, {});

  assert.equal(artwork.kind, "model");
  assert.equal(
    artwork.src,
    "https://brawlstars.inbox.supercell.com/xdjcscmv3zo3/4CF9yj49X04L66kRTG2ZyI/5410496b3d48d6c65fec7072099e4f2e/800x433.png",
  );
  assert.equal(artwork.fallbackSrc, "https://cdn.brawlify.com/brawlers/borders/16000107.png");
});

test("new brawlers use official art while their Brawlify images are unavailable", () => {
  for (const [id, image] of [
    [16000109, "BS-Cosmo.png?v=1787919511"],
    [16000110, "BS-Vince.png?v=1787919601"],
  ] as const) {
    const artwork = brawlerHeroArtwork(id, {});
    assert.equal(artwork.kind, "model");
    assert.equal(artwork.src, `https://support.supercell.com/images/${image}`);
  }
});

test("card fallback uses official art for new brawlers and catalog images for others", () => {
  assert.match(brawlerCardFallbackUrl(16000109, { imageUrl2: "https://cdn.example/stale.png" }), /BS-Cosmo\.png/);
  assert.equal(brawlerCardFallbackUrl(16000000, { imageUrl2: "https://cdn.example/shelly.png" }), "https://cdn.example/shelly.png");
});
