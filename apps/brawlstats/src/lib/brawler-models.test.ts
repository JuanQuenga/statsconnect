import assert from "node:assert/strict";
import test from "node:test";
import {
  BRAWLER_MODEL_ASSETS,
  brawlerModel3dAsset,
  brawlerModel3dUrl,
} from "./brawler-models.ts";

test("indexes only verified default models from the standard glTF catalog", () => {
  assert.equal(Object.keys(BRAWLER_MODEL_ASSETS).length, 47);
  assert.deepEqual(brawlerModel3dAsset(16000000), {
    modelFilename: "shelly_redux_geo.glb",
    textureFilename: "shelly_redux_tex.ktx",
  });
  assert.equal(brawlerModel3dUrl(16000000), "https://raw.githubusercontent.com/tailsjs/brawl-stars-assets/master/55.243/sc3d/shelly_redux_geo.glb");
});

test("leaves unsupported and newer brawlers on their official PNG fallback", () => {
  assert.equal(brawlerModel3dAsset(16000005), undefined);
  assert.equal(brawlerModel3dUrl(16000082), undefined);
  assert.equal(brawlerModel3dUrl(16000108), undefined);
});

test("rejects fractional and unsafe IDs", () => {
  assert.equal(brawlerModel3dAsset(Number.NaN), undefined);
  assert.equal(brawlerModel3dAsset(16000012.5), undefined);
  assert.equal(brawlerModel3dAsset(Number.MAX_SAFE_INTEGER + 1), undefined);
});

test("keeps every source filename explicit and immutable", () => {
  for (const [id, asset] of Object.entries(BRAWLER_MODEL_ASSETS)) {
    assert.match(asset.modelFilename, /_geo\.glb$/);
    assert.match(asset.textureFilename, /_tex\.ktx$/);
    assert.equal(brawlerModel3dAsset(Number(id)), asset);
  }
});
