import assert from "node:assert/strict";
import test from "node:test";
import { abilityImageUrl, brawlerBorderUrl, brawlerHeroArtwork, brawlerPortraitUrl } from "./artwork.ts";

test("brawler detail heroes prefer full model art over catalog icons", () => {
  const artwork = brawlerHeroArtwork(16000095);

  assert.deepEqual(artwork, {
    artworkMaxWidth: undefined,
    fallbackSrc: "https://cdn.brawlify.com/brawlers/portraits/16000095.png",
    kind: "model",
    src: "https://cdn.brawlify.com/brawlers/model/16000095.png",
  });
});

test("Nori uses the 3D viewer with official feature art as its image fallback", () => {
  const artwork = brawlerHeroArtwork(16000107);

  assert.equal(artwork.kind, "model");
  assert.equal(
    artwork.src,
    "https://brawlstars.inbox.supercell.com/xdjcscmv3zo3/4CF9yj49X04L66kRTG2ZyI/5410496b3d48d6c65fec7072099e4f2e/800x433.png",
  );
  assert.equal(artwork.fallbackSrc, "https://cdn.brawlify.com/brawlers/portraits/16000107.png");
});

test("new brawlers use local official art while their CDN images are unavailable", () => {
  for (const id of [16000109, 16000110]) {
    const expected = `/assets/brawlers/portraits/${id}.png`;
    assert.equal(brawlerBorderUrl(id), expected);
    assert.equal(brawlerPortraitUrl(id), expected);
    assert.deepEqual(brawlerHeroArtwork(id), { artworkMaxWidth: 250, kind: "model", src: expected, fallbackSrc: expected });
  }
});

test("large cards use portraits and new abilities use available regular images", () => {
  assert.equal(brawlerPortraitUrl(16000000), "https://cdn.brawlify.com/brawlers/portraits/16000000.png");
  assert.equal(brawlerHeroArtwork(16000108).src, "https://cdn.brawlify.com/brawlers/portraits/16000108.png");
  assert.equal(abilityImageUrl("gadgets", 23001452), "https://cdn.brawlify.com/gadgets/regular/23001452.png");
  assert.equal(abilityImageUrl("star-powers", 23001450), "https://cdn.brawlify.com/star-powers/regular/23001450.png");
});
