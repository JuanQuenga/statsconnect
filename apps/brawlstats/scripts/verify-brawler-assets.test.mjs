import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./verify-brawler-assets.mjs", import.meta.url));
const local = (name) => `/assets/brawlers/3d/${name}`;
const ready = (name) => ({ kind: "ready", url: local(name) });

function glb(document, binary) {
  const json = Buffer.from(JSON.stringify(document));
  const jsonBytes = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(jsonBytes);
  const binaryBytes = binary ? Buffer.alloc(Math.ceil(binary.length / 4) * 4) : undefined;
  binary?.copy(binaryBytes);
  const output = Buffer.alloc(20 + jsonBytes.length + (binaryBytes ? 8 + binaryBytes.length : 0));
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonBytes.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(output, 20);
  if (binaryBytes) {
    output.writeUInt32LE(binaryBytes.length, 20 + jsonBytes.length);
    output.writeUInt32LE(0x004e4942, 24 + jsonBytes.length);
    binaryBytes.copy(output, 28 + jsonBytes.length);
  }
  return output;
}

function triangle(extra = {}) {
  const binary = Buffer.alloc(60);
  [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1].forEach((value, index) => binary.writeFloatLE(value, index * 4));
  return glb({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }], buffers: [{ byteLength: 60 }], ...extra,
  }, binary);
}

function skin(id, base = "base.glb") {
  return { brawlerId: 2, skinId: id, character: "Fixture", assetGroup: "reference-bridge", released: true,
    baseModel: ready(base), diffuseTexture: ready("diffuse.png"),
    animations: { IdleAnim: { exported: ready("idle.glb"), label: "Idle", startFrame: 0, endFrame: -1, fps: 30 } }, faces: {}, cameraScale: 290,
  };
}

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brawler-verification-"));
  await mkdir(path.join(directory, "catalog"));
  await writeFile(path.join(directory, "catalog.json"), JSON.stringify({ kind: "index", brawlers: [{ brawlerId: 1, shard: local("catalog/missing.json") }, { brawlerId: 2, shard: local("catalog/2.json") }] }));
  const valid = skin("Valid");
  valid.animations.MissingAnim = { exported: ready("missing-animation.glb"), label: "Missing" };
  await writeFile(path.join(directory, "catalog/2.json"), JSON.stringify({ schemaVersion: 1, defaults: [skin("Missing", "missing.glb"), { skinId: "Malformed" }, skin("Embedded", "embedded.glb"), valid], releasedSkins: [] }));
  await writeFile(path.join(directory, "base.glb"), triangle());
  await writeFile(path.join(directory, "embedded.glb"), triangle({
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    images: [{ uri: "data:image/png;base64,AA==" }], textures: [{ source: 0 }],
  }));
  await writeFile(path.join(directory, "idle.glb"), glb({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "Root" }], images: [{ uri: "unused-must-not-be-requested.png" }], textures: [{ source: 0 }] }));
  await writeFile(path.join(directory, "diffuse.png"), Buffer.from([0]));
  return directory;
}

test("full-inventory audit continues after missing shards, missing assets, and malformed skins", async () => {
  const directory = await fixture();
  const reportPath = path.join(directory, "../", `${path.basename(directory)}-report.json`);
  try {
    const run = spawnSync(process.execPath, [script, directory, "--report", reportPath], { encoding: "utf8" });
    assert.equal(run.status, 1);
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(report.assembledSelections, 1);
    assert.equal(report.selections[0].skin, "Valid");
    assert.ok(report.failures.some((failure) => failure.stage === "shard"));
    assert.ok(report.failures.some((failure) => failure.skin === "Malformed"));
    assert.ok(report.failures.some((failure) => failure.skin === "Missing" && failure.category === "missing-file"));
    assert.ok(report.failures.some((failure) => failure.skin === "Embedded" && failure.category === "unsupported"));
    assert.ok(report.failures.some((failure) => failure.skin === "Valid" && failure.animation === "MissingAnim"));
    assert.match(run.stderr, /verified|progress/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(reportPath, { force: true });
  }
});
