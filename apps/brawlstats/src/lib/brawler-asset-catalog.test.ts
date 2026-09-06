import assert from "node:assert/strict";
import test from "node:test";
import {
  BRAWLER_ASSET_CATALOG_PATH,
  brawlerAssetCatalogUrl,
  catalogAnimationKeys,
  catalogAnimationOptions,
  catalogEntriesForBrawler,
  catalogEntryHasRuntime,
  catalogEntryLabel,
  catalogEntryToViewerManifest,
  createBrawlerAssetCatalogRequestCache,
  loadBrawlerAssetCatalog,
  parseBrawlerAssetCatalog,
  selectCatalogViewerEntry,
} from "./brawler-asset-catalog.ts";

const ready = (url: string) => ({ kind: "ready" as const, url });
const unavailable = { kind: "unavailable" as const, reason: "not-captured" };

test("retains the source viewer's human-readable skin name", () => {
  const source = fixture();
  const catalog = parseBrawlerAssetCatalog({ ...source, defaults: source.defaults.map((entry) => ({ ...entry, skinId: "CrowWhite", displayName: "White Crow" })) });
  assert.equal(catalogEntryLabel(catalog.defaults[0]), "White Crow");
});

function fixture() {
  return {
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
        IdleAnim: { symbol: "CrowIdle", label: "Idle Animation", exported: ready("/assets/brawlers/3d/animations/16000012-CrowDefault/IdleAnim.glb") },
        WalkAnim: { symbol: "CrowWalk", exported: unavailable },
      },
      faces: {
        IdleFace: { symbol: "CrowStill", resolved: true, ready: false, atlas: unavailable, binary: unavailable, startFrame: 0, endFrame: -1, fps: 60 },
      },
      capabilities: { outline: { kind: "postprocess", enabled: true } },
      materialSlots: [{
        materialName: "character_mat",
        diffuse: true,
        lightmapDiffuse: true,
        specular: true,
        stencil: true,
        uvSource: "67/68",
        diffuseTexture: ready("/assets/brawlers/3d/textures/16000012-CrowDefault.png"),
        diffuseLightmap: ready("/assets/brawlers/3d/menu_diffuse_lightmap.png"),
        specularLightmap: ready("/assets/brawlers/3d/menu_specular_lightmap.png"),
      }],
      cameraScale: 290,
      faceFlags: { faceCoversWholeTexture: null, faceScaledUpTexture: null, disableHeadRotation: null },
    }],
    releasedSkins: [],
    skins: [],
  };
}

test("parses the generated catalog and exposes only converted animation selectors", () => {
  const catalog = parseBrawlerAssetCatalog(fixture());
  const entry = catalog.defaults[0];
  assert.ok(entry);
  assert.deepEqual(catalogAnimationKeys(entry), ["IdleAnim"]);
  const manifest = catalogEntryToViewerManifest(entry);
  assert.equal(manifest?.brawlerId, 16000012);
  assert.equal(manifest?.skinId, "CrowDefault");
  assert.equal(manifest?.baseModel.kind, "ready");
  assert.deepEqual(Object.keys(manifest?.animations ?? {}), ["IdleAnim"]);
  assert.equal(manifest?.animations.IdleAnim?.[1].kind, "unavailable");
  assert.equal(manifest?.face.kind, "unavailable");
  assert.equal(manifest?.outline.kind, "available");
  assert.equal(manifest?.animations.IdleAnim?.[6], 60);
  assert.equal(manifest?.cameraScale, 290);
  assert.equal(manifest?.assetGroup, "pinned-local");
  assert.equal(manifest?.materialSlots?.[0]?.materialName, "character_mat");
  assert.equal(manifest?.materialSlots?.[0]?.stencilUvPolicy, "2x-flip-y");
  assert.equal(manifest?.materialSlots?.[0]?.stencil, true);
  assert.equal(manifest?.materialSlots?.[0]?.diffuseLightmap?.kind, "ready");
  assert.equal(manifest?.materialSlots?.[0]?.diffuseLightmap?.kind === "ready" ? manifest.materialSlots[0].diffuseLightmap.url : "", "/assets/brawlers/3d/menu_diffuse_lightmap.png");

  const value = fixture();
  const flaggedValue = { ...value, defaults: [{ ...value.defaults[0], faceFlags: { faceCoversWholeTexture: "true", faceScaledUpTexture: "true", disableHeadRotation: null } }] };
  const flaggedManifest = catalogEntryToViewerManifest(parseBrawlerAssetCatalog(flaggedValue).defaults[0]);
  assert.deepEqual(flaggedManifest?.faceFlags, { coversWholeTexture: true, scaledUpTexture: true });
});

test("selects the reference render-target Y flip for bridged entries", () => {
  const value = fixture();
  const bridgeValue = { ...value, defaults: [{ ...value.defaults[0], assetGroup: "reference-bridge" }] };
  const manifest = catalogEntryToViewerManifest(parseBrawlerAssetCatalog(bridgeValue).defaults[0]);
  assert.equal(manifest?.assetGroup, "reference-bridge");
  assert.equal(manifest?.materialSlots?.[0]?.stencilUvPolicy, "flip-y");
});

test("transports source playback speed independently from body and face FPS", () => {
  const value = fixture();
  const entry = value.defaults[0];
  const spedUp = { ...value, defaults: [{ ...entry, animations: {
    IdleAnim: { ...entry.animations.IdleAnim, speed: 1.25, fps: 60, startFrame: 10, endFrame: 20 },
  } }] };
  const manifest = catalogEntryToViewerManifest(parseBrawlerAssetCatalog(spedUp).defaults[0]);
  assert.deepEqual(manifest?.animations.IdleAnim?.slice(3), [10, 20, "Idle Animation", 60, 60, 1.25]);
  assert.equal(catalogEntryToViewerManifest(parseBrawlerAssetCatalog(value).defaults[0])?.animations.IdleAnim?.[8], 1);
  for (const speed of [0, -1, NaN, Infinity, "1.25"]) {
    const invalid = { ...spedUp, defaults: [{ ...entry, animations: { IdleAnim: { ...entry.animations.IdleAnim, speed } } }] };
    assert.throws(() => parseBrawlerAssetCatalog(invalid), /positive finite multiplier/);
  }
});

test("keeps delivered catalog URLs under the unified 3D asset rewrite and preserves animation keys", () => {
  const catalog = parseBrawlerAssetCatalog(fixture());
  const entry = catalog.defaults[0];
  assert.ok(entry);
  assert.equal(BRAWLER_ASSET_CATALOG_PATH, "/assets/brawlers/3d/catalog.json");
  assert.match(brawlerAssetCatalogUrl(), /\/assets\/brawlers\/3d\/catalog\.json\?v=2$/);
  assert.deepEqual(catalogAnimationOptions(entry), [{ key: "IdleAnim", label: "Idle Animation" }]);
});

test("loads only the stable-ID runtime shard behind the compact catalog index", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  const value = fixture();
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.startsWith("/assets/brawlers/3d/catalog.json?")) return new Response(JSON.stringify({ schemaVersion: 1, kind: "index", brawlers: [{ brawlerId: 16000012, shard: "/assets/brawlers/3d/catalog/16000012.json" }] }));
    return new Response(JSON.stringify({ schemaVersion: 1, kind: "brawler", brawlerId: 16000012, defaults: value.defaults, releasedSkins: [] }));
  };
  try {
    const catalog = await loadBrawlerAssetCatalog(brawlerAssetCatalogUrl(), 16000012);
    assert.equal(catalog.defaults[0]?.brawlerId, 16000012);
    assert.deepEqual(requests, ["/assets/brawlers/3d/catalog.json?v=2", "/assets/brawlers/3d/catalog/16000012.json"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("rejects external asset URLs", () => {
  const value = fixture();
  (value.defaults[0] as { baseModel: unknown }).baseModel = ready("https://cdn.example.invalid/model.glb");
  assert.throws(() => parseBrawlerAssetCatalog(value), /same-origin/);
});

test("does not produce a runtime manifest for unavailable base models", () => {
  const value = fixture();
  (value.defaults[0] as { baseModel: unknown }).baseModel = unavailable;
  const entry = parseBrawlerAssetCatalog(value).defaults[0];
  assert.ok(entry);
  assert.equal(catalogEntryToViewerManifest(entry), undefined);
});

test("does not advertise a runtime until the local diffuse texture is delivered", () => {
  const value = fixture();
  (value.defaults[0] as { diffuseTexture: unknown }).diffuseTexture = unavailable;
  const entry = parseBrawlerAssetCatalog(value).defaults[0];
  assert.ok(entry);
  assert.equal(catalogEntryHasRuntime(entry), false);
  assert.equal(catalogEntryToViewerManifest(entry), undefined);
});

test("requires both face atlas and binary before enabling native face rendering", () => {
  const value = fixture();
  Object.assign(value.defaults[0].faces.IdleFace, {
    symbol: "CrowStill",
    resolved: true,
    ready: true,
    atlas: ready("/assets/brawlers/3d/faces/16000012-CrowDefault/atlas.png"),
    binary: ready("/assets/brawlers/3d/faces/16000012-CrowDefault/IdleFace.bin"),
    startFrame: 4,
    endFrame: 29,
    fps: 30,
  });
  const entry = parseBrawlerAssetCatalog(value).defaults[0];
  assert.ok(entry);
  const manifest = catalogEntryToViewerManifest(entry);
  assert.equal(manifest?.face.kind, "available");
  assert.equal(manifest?.animations.IdleAnim?.[1].kind, "ready");
  assert.equal(manifest?.animations.IdleAnim?.[2].kind, "ready");
  assert.equal(manifest?.animations.IdleAnim?.[3], 0);
  assert.equal(manifest?.animations.IdleAnim?.[4], -1);
  assert.equal(manifest?.animations.IdleAnim?.[6], 60);
  assert.equal(manifest?.animations.IdleAnim?.[7], 30);

  value.defaults[0].faces.IdleFace.binary = unavailable;
  value.defaults[0].faces.IdleFace.ready = false;
  const missingHalf = catalogEntryToViewerManifest(parseBrawlerAssetCatalog(value).defaults[0]);
  assert.ok(missingHalf);
  assert.equal(missingHalf.face.kind, "unavailable");
  assert.equal(missingHalf.animations.IdleAnim?.[1].kind, "ready");
  assert.equal(missingHalf.animations.IdleAnim?.[2].kind, "unavailable");
});

test("uses source-declared face associations for attack and custom animation keys", () => {
  const value = fixture();
  const source = value.defaults[0];
  const idleFace = { ...source.faces.IdleFace, ready: true, resolved: true, atlas: ready("/assets/idle.png"), binary: ready("/assets/idle.bin"), fps: 30 };
  const customFace = { ...idleFace, atlas: ready("/assets/taunt.png"), binary: ready("/assets/taunt.bin"), fps: 24 };
  const catalog = parseBrawlerAssetCatalog({ ...value, defaults: [{
    ...source,
    animations: {
      PrimarySkillAnim: { ...source.animations.IdleAnim, faceField: "IdleFace" },
      SecondarySkillAnim: { ...source.animations.IdleAnim, faceField: "IdleFace" },
      "ReferenceAnim:taunt": { ...source.animations.IdleAnim, faceField: "ReferenceFace:taunt" },
    },
    faces: { IdleFace: idleFace, "ReferenceFace:taunt": customFace },
  }] });
  const manifest = catalogEntryToViewerManifest(catalog.defaults[0]);
  assert.deepEqual(manifest?.animations.PrimarySkillAnim?.[1], idleFace.atlas);
  assert.deepEqual(manifest?.animations.SecondarySkillAnim?.[2], idleFace.binary);
  assert.deepEqual(manifest?.animations["ReferenceAnim:taunt"]?.[1], customFace.atlas);
  assert.deepEqual(manifest?.animations["ReferenceAnim:taunt"]?.[2], customFace.binary);
  assert.equal(manifest?.animations["ReferenceAnim:taunt"]?.[7], 24);
});

test("explicitly absent or missing face associations never fall back to the legacy role mapping", () => {
  const value = fixture();
  const source = value.defaults[0];
  const idleFace = { ...source.faces.IdleFace, ready: true, resolved: true, atlas: ready("/assets/idle.png"), binary: ready("/assets/idle.bin") };
  for (const faceField of [null, "MissingFace"]) {
    const catalog = parseBrawlerAssetCatalog({ ...value, defaults: [{
      ...source,
      animations: { IdleAnim: { ...source.animations.IdleAnim, faceField } },
      faces: { IdleFace: idleFace },
    }] });
    const manifest = catalogEntryToViewerManifest(catalog.defaults[0]);
    assert.equal(manifest?.animations.IdleAnim?.[1].kind, "unavailable");
    assert.equal(manifest?.animations.IdleAnim?.[2].kind, "unavailable");
  }
});

test("indexes every local skin by stable brawler ID and only advertises complete runtime entries", () => {
  const catalog = parseBrawlerAssetCatalog(fixture());
  const entry = catalog.defaults[0];
  assert.ok(entry);
  const withSkin = parseBrawlerAssetCatalog({
    ...catalog,
    releasedSkins: [{ ...entry, skinId: "CrowWhite", baseModel: unavailable }],
    skins: [{ ...entry, skinId: "CrowWhite" }],
  });
  const entries = catalogEntriesForBrawler(withSkin, 16000012);
  assert.deepEqual(entries.map((item) => item.skinId), ["CrowDefault", "CrowWhite"]);
  assert.equal(catalogEntryHasRuntime(entries[0]!), true);
  assert.equal(catalogEntryHasRuntime(entries[1]!), true);
  assert.equal(catalogEntryLabel(entries[0]!), "Crow (Default)");
  assert.equal(catalogEntriesForBrawler(withSkin, 16000018).length, 0);
});

test("selects complete skins and animation keys by stable IDs across brawlers", () => {
  const value = fixture();
  const crow = value.defaults[0];
  const colt = {
    ...crow,
    brawlerId: 16000001,
    skinId: "ColtDefault",
    character: "Colt",
    baseModel: ready("/assets/brawlers/3d/models/16000001-ColtDefault.glb"),
    diffuseTexture: ready("/assets/brawlers/3d/textures/16000001-ColtDefault.png"),
    animations: {
      AttackAnim: { symbol: "ColtAttack", label: "Attack", exported: ready("/assets/brawlers/3d/animations/16000001-ColtDefault/AttackAnim.glb") },
      IdleAnim: { symbol: "ColtIdle", label: "Idle", exported: ready("/assets/brawlers/3d/animations/16000001-ColtDefault/IdleAnim.glb") },
    },
  };
  const parsed = parseBrawlerAssetCatalog({
    ...value,
    defaults: [crow, colt],
    releasedSkins: [{
      ...crow,
      skinId: "CrowWhite",
      baseModel: ready("/assets/brawlers/3d/models/16000012-CrowWhite.glb"),
      diffuseTexture: ready("/assets/brawlers/3d/textures/16000012-CrowWhite.png"),
      animations: {
        AttackAnim: { symbol: "CrowAttack", label: "Attack", exported: ready("/assets/brawlers/3d/animations/16000012-CrowWhite/AttackAnim.glb") },
      },
    }],
    skins: [{ ...crow, skinId: "CrowIncomplete", diffuseTexture: unavailable }],
  });

  const white = selectCatalogViewerEntry(parsed, 16000012, "CrowWhite", "AttackAnim");
  assert.deepEqual(white.entries.map((entry) => entry.skinId), ["CrowDefault", "CrowWhite"]);
  assert.equal(white.selectedEntry?.skinId, "CrowWhite");
  assert.deepEqual(white.animationOptions, [{ key: "AttackAnim", label: "Attack" }]);
  assert.equal(white.activeAnimation, "AttackAnim");

  const crowDefault = selectCatalogViewerEntry(parsed, 16000012, "CrowWhite", "MissingAnim");
  assert.equal(crowDefault.selectedEntry?.skinId, "CrowWhite");
  assert.equal(crowDefault.activeAnimation, "AttackAnim");

  const coltSelection = selectCatalogViewerEntry(parsed, 16000001, undefined, undefined);
  assert.deepEqual(coltSelection.entries.map((entry) => entry.skinId), ["ColtDefault"]);
  assert.equal(coltSelection.selectedEntry?.skinId, "ColtDefault");
  assert.equal(coltSelection.activeAnimation, "AttackAnim");
  assert.equal(selectCatalogViewerEntry(parsed, 16000099, undefined, undefined).selectedEntry, undefined);
});

test("evicts rejected catalog requests so a later load can retry", async () => {
  let attempts = 0;
  const cache = createBrawlerAssetCatalogRequestCache(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary catalog failure");
    return { schemaVersion: 1, defaults: [], releasedSkins: [], skins: [] };
  });
  await assert.rejects(cache(16000012), /temporary catalog failure/);
  const catalog = await cache(16000012);
  assert.equal(attempts, 2);
  assert.deepEqual(catalog.defaults, []);
});
