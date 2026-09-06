import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { buildReferenceBridge } from "./build-reference-asset-bridge.mjs";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "reference-bridge-test-"));
  const charactersCsv = path.join(root, "characters.csv");
  writeFileSync(charactersCsv, [
    "Name,Type,Disabled,DefaultSkin",
    "string,string,bool,string",
    "ShotgunGirl,Hero,false,ShellyDefault",
    "Colt,Hero,false,ColtDefault",
    "FixtureTwo,Hero,true,FixtureTwoDefault",
    "FixtureThree,Hero,true,FixtureThreeDefault",
    "FixtureFour,Hero,true,FixtureFourDefault",
    "FixtureFive,Hero,true,FixtureFiveDefault",
    "FixtureSix,Hero,true,FixtureSixDefault",
    "FixtureSeven,Hero,true,FixtureSevenDefault",
    "FixtureEight,Hero,true,FixtureEightDefault",
    "FixtureNine,Hero,true,FixtureNineDefault",
    "FixtureTen,Hero,true,FixtureTenDefault",
    "FixtureEleven,Hero,true,FixtureElevenDefault",
    "Crow,Hero,false,CrowDefault",
    "",
  ].join("\n"));
  const sourceDir = path.join(root, "source");
  await mkdir(sourceDir, { recursive: true });
  const makeAsset = async (name, value) => {
    const file = path.join(sourceDir, name);
    await writeFile(file, value);
    return { path: file, sha256: digest(value), sourceKind: "reference-preprocessed", assetSetId: "capture-68.250" };
  };
  const entries = [];
  for (const [character, skinId, route] of [["Crow", "CrowDefault", "crow_(default)"], ["ShotgunGirl", "ShellyDefault", "shelly_(default)"], ["Colt", "ColtDefault", "colt_(default)"]]) {
    entries.push({
      route,
      character,
      skinId,
      sourceKind: "reference-preprocessed",
      assetSetId: "capture-68.250",
      sourceUrl: `https://reference.invalid/skins/${route}`,
      license: { status: "diagnostic-only", notice: "third-party game assets; local QA only" },
      assets: {
        geometry: await makeAsset(`${skinId}-geometry.glb`, `${character}-geometry`),
        texture: await makeAsset(`${skinId}-texture.png`, `${character}-texture`),
        face: await makeAsset(`${skinId}-face`, `${character}-face`),
        animations: { idle: await makeAsset(`${skinId}-idle.glb`, `${character}-idle`) },
      },
    });
  }
  return { root, charactersCsv, inventory: { captureId: "temporary-three-sample", routes: entries } };
}

test("maps Crow and two non-Crow samples to stable IDs and mirrors same-origin assets", async () => {
  const source = await fixture();
  const outputDir = path.join(source.root, "generated");
  try {
    const auditOutput = path.join(source.root, "bridge.audit.json");
    const result = await buildReferenceBridge({ inventory: source.inventory, charactersCsv: source.charactersCsv, outputDir, auditOutput });
    assert.deepEqual(result.coverage.covered.map((entry) => entry.brawlerId), [16000012, 16000000, 16000001]);
    assert.equal(result.coverage.totalRoutes, 3);
    assert.equal(result.coverage.coveredRoutes, 3);
    assert.equal(result.entries.every((entry) => entry.status === "ready"), true);
    assert.equal(result.entries.every((entry) => entry.runtimeEligible === false), true);
    const crow = result.entries[0];
    assert.equal(crow.assets.geometry.url, "/assets/brawlers/3d/reference-bridge/16000012/CrowDefault/geometry/CrowDefault-geometry.glb");
    assert.equal(crow.assets.geometry.sha256.length, 64);
    assert.equal(crow.assets.animations.idle.kind, "ready");
    assert.equal(JSON.stringify(result).includes("https://"), false);
    const audit = JSON.parse(readFileSync(auditOutput, "utf8"));
    assert.equal(audit.entries[0].sourceUrl, "https://reference.invalid/skins/crow_(default)");
    assert.equal(audit.entries[0].localAssets.find((asset) => asset.role === "face").sha256.length, 64);
    assert.equal(readFileSync(path.join(outputDir, "16000012", "CrowDefault", "face", "CrowDefault-face.bin"), "utf8"), "Crow-face");
  } finally {
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("fails closed when a face is mixed with pinned-local geometry", async () => {
  const source = await fixture();
  try {
    const mixed = structuredClone(source.inventory);
    mixed.routes[0].assets.face.sourceKind = "pinned-local";
    const result = await buildReferenceBridge({ inventory: mixed, charactersCsv: source.charactersCsv, outputDir: path.join(source.root, "generated") });
    assert.equal(result.entries[0].status, "unavailable");
    assert.match(result.entries[0].reason.join(";"), /mixes source kinds|sourceKind differs/);
    assert.deepEqual(result.entries[0].assets, {});
    assert.equal(result.coverage.coveredRoutes, 2);
  } finally {
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("rejects a hash mismatch and unmapped route without emitting a ready group", async () => {
  const source = await fixture();
  try {
    const invalid = structuredClone(source.inventory);
    invalid.routes[0].assets.geometry.sha256 = "0".repeat(64);
    invalid.routes.push({
      route: "unknown_(default)",
      character: "NotInPinnedCsv",
      skinId: "UnknownDefault",
      sourceKind: "reference-preprocessed",
      assetSetId: "capture-68.250",
      assets: {},
    });
    const result = await buildReferenceBridge({ inventory: invalid, charactersCsv: source.charactersCsv, outputDir: path.join(source.root, "generated") });
    assert.equal(result.entries[0].status, "unavailable");
    assert.match(result.entries[0].reason.join(";"), /sha256/);
    assert.equal(result.entries[3].status, "unavailable");
    assert.match(result.entries[3].reason.join(";"), /not present in pinned characters CSV/);
    assert.equal(result.coverage.coveredRoutes, 2);
  } finally {
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("content-addresses face atlas/materials and preserves route animation metadata", async () => {
  const source = await fixture();
  try {
    const entry = source.inventory.routes[0];
    const atlasPath = path.join(source.root, "face-atlas.png");
    const materialPath = path.join(source.root, "lightmap.png");
    writeFileSync(atlasPath, "atlas");
    writeFileSync(materialPath, "lightmap");
    entry.assets.faceAtlas = { path: atlasPath, sourceKind: entry.sourceKind, assetSetId: entry.assetSetId };
    entry.assets.materials = { menu_diffuse_lightmap: { path: materialPath, sourceKind: entry.sourceKind, assetSetId: entry.assetSetId } };
    entry.assets.animations.idle.label = "Idle Anim";
    entry.assets.animations.idle.startFrame = 1;
    entry.assets.animations.idle.endFrame = 29;
    entry.materialSlots = [{ materialName: "character_mat", diffuseTexture: "texture", diffuseLightmap: "material:menu_diffuse_lightmap" }];
    entry.geometryMetadata = { uvSource: "default", uvRange: { min: [0, 0], max: [1, 1] } };
    const outputDir = path.join(source.root, "generated");
    const result = await buildReferenceBridge({ inventory: source.inventory, charactersCsv: source.charactersCsv, outputDir, publicPrefix: "/assets/brawlers/3d", storagePrefix: "reference-bridge", contentAddressed: true });
    const bridged = result.entries[0];
    assert.equal(bridged.status, "ready");
    assert.match(bridged.assets.face.url, /\.[a-f0-9]{64}\.bin$/);
    assert.match(bridged.assets.faceAtlas.url, /face-atlas\.[a-f0-9]{64}\.png$/);
    assert.match(bridged.assets.materials.menu_diffuse_lightmap.url, /lightmap\.[a-f0-9]{64}\.png$/);
    assert.equal(bridged.animationMetadata.idle.label, "Idle Anim");
    assert.equal(bridged.animationMetadata.idle.endFrame, 29);
    assert.equal(bridged.materialSlots[0].diffuseLightmap.kind, "ready");
    assert.equal(bridged.materialSlots[0].diffuseTexture.kind, "ready");
    assert.deepEqual(bridged.geometryMetadata, entry.geometryMetadata);
    assert.equal(existsSync(path.join(outputDir, bridged.assets.faceAtlas.url.replace("/assets/brawlers/3d/", ""))), true);
  } finally {
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("deduplicated delivery shares identical bytes without losing package identity", async () => {
  const source = await fixture();
  try {
    source.inventory.routes[1].assets.texture = { ...source.inventory.routes[0].assets.texture };
    const outputDir = path.join(source.root, "generated");
    const result = await buildReferenceBridge({ inventory: source.inventory, charactersCsv: source.charactersCsv, outputDir, contentAddressed: true, deduplicateAssets: true });
    assert.equal(result.coverage.coveredRoutes, 3);
    const [crow, shelly] = result.entries;
    assert.equal(crow.assets.texture.url, shelly.assets.texture.url);
    assert.match(crow.assets.texture.url, /\/objects\/[a-f0-9]{64}\.png$/);
    assert.match(crow.assets.face.url, /\/objects\/[a-f0-9]{64}\.bin$/);
    assert.equal(crow.skinId, "CrowDefault");
    assert.equal(shelly.skinId, "ShellyDefault");
    assert.equal(crow.source.contentAddressed, true);
    assert.equal(crow.cameraScale, source.inventory.routes[0].cameraScale ?? 1);
  } finally {
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("a missing optional cinematic does not hide a complete model and its other animations", async () => {
  const source = await fixture();
  try {
    const entry = source.inventory.routes[0];
    const unavailable = { kind: "unavailable", sourceUrl: "https://reference.invalid/missing.glb", reason: "404 Not Found" };
    entry.assets.animations.cinematic = unavailable;
    entry.downloadFailures = { "asset-animations-cinematic": unavailable };
    entry.reason = "1 asset downloads unavailable";
    const bridge = await buildReferenceBridge({ inventory: source.inventory, charactersCsv: source.charactersCsv, outputDir: path.join(source.root, "generated") });
    assert.equal(bridge.entries[0].status, "ready");
    assert.equal(bridge.entries[0].captureComplete, false);
    assert.deepEqual(bridge.entries[0].unavailableAnimations, ["cinematic"]);
    assert.equal(bridge.entries[0].assets.animations.idle.kind, "ready");
    assert.equal(bridge.entries[0].assets.animations.cinematic, undefined);
  } finally { rmSync(source.root, { recursive: true, force: true }); }
});
