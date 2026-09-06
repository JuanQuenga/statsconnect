import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveMaterializerPath, selectedEntries, validateGeometryGlb, materializeFaces, publishAnimation } from "./materialize-brawl-assets.mjs";

const entry = (brawlerId, skinId, ready = true) => ({
  brawlerId,
  skinId,
  released: true,
  sourceReadiness: { readyForConversion: ready },
});

test("materializer selects only released source-ready entries", () => {
  const manifest = { skins: [entry(1, "a"), entry(2, "b", false), entry(3, "c", false), entry(4, "d")] };
  assert.deepEqual(selectedEntries(manifest, new Map([['limit', '2']])).map((item) => item.skinId), ["a", "d"]);
});

test("materializer can bound a representative matrix to one skin per brawler", () => {
  const manifest = { skins: [entry(1, "a"), entry(1, "b"), entry(2, "c"), entry(3, "d")] };
  const options = new Map([['distinct-brawlers', true], ['limit', '3']]);
  assert.deepEqual(selectedEntries(manifest, options).map((item) => item.skinId), ["a", "c", "d"]);
});

function glbWithAttributes(attributes) {
  const json = Buffer.from(`${JSON.stringify({ asset: { version: "2.0" }, meshes: [{ primitives: [{ attributes }] }] })}   `);
  const header = Buffer.alloc(20);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + 8 + json.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, json]);
}

test("geometry is unavailable when a primitive has no TEXCOORD_0", () => {
  assert.deepEqual(validateGeometryGlb(glbWithAttributes({ POSITION: 0 })), { ok: false, reason: "model-texcoord0-missing" });
  assert.deepEqual(validateGeometryGlb(glbWithAttributes({ POSITION: 0, TEXCOORD_0: 1 })), { ok: true });
});

test("materializer resolves output paths before subprocesses use a temporary cwd", () => {
  assert.equal(
    resolveMaterializerPath(".generated/brawl-3d", "/workspace/project"),
    "/workspace/project/.generated/brawl-3d",
  );
  assert.equal(
    resolveMaterializerPath("/var/tmp/brawl-3d", "/workspace/project"),
    "/var/tmp/brawl-3d",
  );
});

test("every mapped face gets its exact export and coherent atlas pair, with reuse only for the same source export", () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), "brawl-face-test-"));
  try {
    const faces = {
      IdleFace: { input: "68/sc/characters.sc", symbol: "Still", exportName: "still" },
      WalkFace: { input: "68/sc/characters.sc", symbol: "Still", exportName: "still" },
      HappyFace: { input: "68/sc/characters.sc", symbol: "Win", exportName: "win" },
      HappyLoopFace: { input: "68/sc/alternate.sc", symbol: "OtherWin", exportName: "win" },
      SadFace: { input: "68/sc/characters.sc", symbol: "Missing", exportName: null },
    };
    const exports = [];
    const result = materializeFaces({ key: "skin", faces, outputDir, commit: "pinned", exportFace(plan, targets) {
      exports.push(plan.exportName);
      writeFileSync(targets.atlas, `atlas-${plan.exportName}`);
      writeFileSync(targets.binary, `binary-${plan.exportName}`);
      writeFileSync(targets.metadata, JSON.stringify({ fps: 24, selected_export: plan.exportName, available: true }));
    } });
    assert.deepEqual(exports, ["still", "win", "win"]);
    assert.deepEqual(result.faceStateReady, { IdleFace: true, WalkFace: true, HappyFace: true, HappyLoopFace: true, SadFace: false });
    assert.equal(readFileSync(path.join(outputDir, "faces/skin/HappyFace.png"), "utf8"), "atlas-win");
    assert.equal(readFileSync(path.join(outputDir, "faces/skin/WalkFace.bin"), "utf8"), "binary-still");
    const metadata = JSON.parse(readFileSync(path.join(outputDir, "faces/skin/HappyFace.meta.json"), "utf8"));
    assert.equal(metadata.fps, 24);
    assert.deepEqual(metadata.source, { commit: "pinned", input: faces.HappyFace.input, symbol: "Win", exportName: "win" });
    assert.ok(result.unavailable.includes("native-face-not-mapped:SadFace"));
  } finally { rmSync(outputDir, { recursive: true, force: true }); }
});

test("an alternate export cannot be labeled as the configured face", () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), "brawl-face-test-"));
  try {
    const result = materializeFaces({ key: "skin", outputDir, commit: "pinned", faces: {
      HappyFace: { input: "68/sc/characters.sc", symbol: "Win", exportName: "win" },
    }, exportFace(_plan, targets) {
      writeFileSync(targets.atlas, "atlas-idle");
      writeFileSync(targets.binary, "binary-idle");
      writeFileSync(targets.metadata, JSON.stringify({ available: true, selected_export: "idle" }));
    } });
    assert.deepEqual(result.faceStateReady, { HappyFace: false });
    assert.deepEqual(result.unavailable, ["native-face-export-failed:HappyFace:face-export-mismatch"]);
    assert.equal(existsSync(path.join(outputDir, "faces/skin/HappyFace.bin")), false);
  } finally { rmSync(outputDir, { recursive: true, force: true }); }
});

test("a failed face export removes stale files and cannot borrow idle", () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), "brawl-face-test-"));
  try {
    const directory = path.join(outputDir, "faces/skin");
    mkdirSync(directory, { recursive: true });
    for (const suffix of ["png", "bin", "meta.json"]) writeFileSync(path.join(directory, `HappyFace.${suffix}`), "stale");
    const result = materializeFaces({ key: "skin", outputDir, commit: "pinned", faces: {
      HappyFace: { input: "68/sc/characters.sc", symbol: "Win", exportName: "win" },
    }, exportFace(_plan, targets) {
      writeFileSync(targets.atlas, "partial");
      throw new Error("missing clip");
    } });
    assert.equal(result.faceStateReady.HappyFace, false);
    assert.ok(result.unavailable.some((reason) => reason.startsWith("native-face-export-failed:HappyFace:")));
    for (const suffix of ["png", "bin", "meta.json"]) assert.equal(existsSync(path.join(directory, `HappyFace.${suffix}`)), false);
  } finally { rmSync(outputDir, { recursive: true, force: true }); }
});

test("animation exports record exact role provenance and clear stale exports on failure", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "brawl-animation-test-"));
  try {
    const source = path.join(directory, "converted.glb");
    const target = path.join(directory, "PrimarySkillRecoilAnim.glb");
    const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, accessors: [], bufferViews: [], animations: [] }).padEnd(112, " "));
    const header = Buffer.alloc(20);
    header.write("glTF"); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length, 8);
    header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(0x004e4942, 4);
    writeFileSync(source, Buffer.concat([header, json, binaryHeader]));
    const plan = { input: "68/sc3d/colt_recoil.glb", symbol: "ColtRecoil" };
    assert.equal(publishAnimation(plan, source, target, "pinned", 30).ok, true);
    const metadata = JSON.parse(readFileSync(target.replace(/\.glb$/, ".meta.json"), "utf8"));
    assert.equal(metadata.fps, 30);
    assert.deepEqual(metadata.source,
      { commit: "pinned", input: plan.input, symbol: plan.symbol });
    assert.deepEqual(publishAnimation(plan, source, target, "pinned", undefined), { ok: false, reason: "animation-source-fps-invalid" });
    assert.equal(existsSync(target), false);
    assert.equal(publishAnimation(plan, source, target, "pinned", 30).ok, true);
    rmSync(source);
    assert.equal(publishAnimation(plan, source, target, "pinned", 30).ok, false);
    assert.equal(existsSync(target), false);
    assert.equal(existsSync(target.replace(/\.glb$/, ".meta.json")), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
