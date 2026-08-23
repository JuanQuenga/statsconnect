import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogAnimationOptions,
  catalogEntryHasRuntime,
  catalogEntryToViewerManifest,
  parseBrawlerAssetCatalog,
} from "./brawler-asset-catalog.ts";

test("catalog-driven viewer exposes a local interactive manifest by stable brawler ID", () => {
  const ready = (url: string) => ({ kind: "ready" as const, url });
  const catalog = parseBrawlerAssetCatalog({
    schemaVersion: 1,
    defaults: [{
      brawlerId: 16000012,
      skinId: "CrowDefault",
      character: "Crow",
      publicCharacter: "Crow",
      released: true,
      baseModel: ready("/assets/brawlers/3d/models/16000012-CrowDefault.glb"),
      diffuseTexture: ready("/assets/brawlers/3d/textures/16000012-CrowDefault.png"),
      animations: {
        IdleAnim: { symbol: "CrowIdle", label: "Idle Anim", exported: ready("/assets/brawlers/3d/animations/16000012-CrowDefault/IdleAnim.glb") },
      },
      faces: {},
      capabilities: { outline: { kind: "postprocess", enabled: true } },
      cameraScale: 290,
    }],
    releasedSkins: [],
    skins: [],
  });
  const entry = catalog.defaults[0];
  assert.ok(entry);
  assert.equal(catalogEntryHasRuntime(entry), true);
  assert.deepEqual(catalogAnimationOptions(entry), [{ key: "IdleAnim", label: "Idle Anim" }]);
  const manifest = catalogEntryToViewerManifest(entry);
  assert.equal(manifest?.brawlerId, 16000012);
  assert.equal(manifest?.baseModel.kind, "ready");
  assert.equal(manifest?.animations.IdleAnim?.[0].kind, "ready");
  assert.equal(manifest?.outline.kind, "available");
});
