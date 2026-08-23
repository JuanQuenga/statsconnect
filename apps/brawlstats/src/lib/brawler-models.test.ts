import assert from "node:assert/strict";
import test from "node:test";
import {
  BRAWLER_MODEL_ASSETS,
  brawlerModel3dAsset,
  brawlerModel3dUrl,
} from "./brawler-models.ts";

test("indexes only the four runtime-verified local models", () => {
  assert.deepEqual(Object.keys(BRAWLER_MODEL_ASSETS).map(Number), [
    16000018, 16000022, 16000045, 16000080,
  ]);
  assert.deepEqual(brawlerModel3dAsset(16000080), { filename: "16000080.glb" });
  assert.equal(brawlerModel3dUrl(16000080), "/assets/brawlers/3d/16000080.glb");
});

test("leaves unsupported and newer brawlers on their official PNG fallback", () => {
  assert.equal(brawlerModel3dAsset(16000000), undefined);
  assert.equal(brawlerModel3dAsset(16000012), undefined);
  assert.equal(brawlerModel3dAsset(16000053), undefined);
  assert.equal(brawlerModel3dUrl(16000082), undefined);
  assert.equal(brawlerModel3dUrl(16000108), undefined);
});

test("uses one self-contained local GLB per registered model", () => {
  for (const [id, asset] of Object.entries(BRAWLER_MODEL_ASSETS)) {
    assert.equal(asset.filename, `${id}.glb`);
    assert.equal(brawlerModel3dUrl(Number(id)), `/assets/brawlers/3d/${id}.glb`);
  }
});

test("rejects fractional and unsafe IDs", () => {
  assert.equal(brawlerModel3dAsset(Number.NaN), undefined);
  assert.equal(brawlerModel3dAsset(16000012.5), undefined);
  assert.equal(brawlerModel3dAsset(Number.MAX_SAFE_INTEGER + 1), undefined);
});

test("keeps every source filename explicit and immutable", () => {
  for (const [id, asset] of Object.entries(BRAWLER_MODEL_ASSETS)) {
    assert.match(asset.filename, /^160000\d+\.glb$/);
    assert.equal(brawlerModel3dAsset(Number(id)), asset);
  }
});
