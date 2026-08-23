import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const script = path.join(repositoryRoot, "scripts/audit-brawl-asset-batch.mjs");

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "brawl-batch-audit-"));
  const sample = path.join(root, "sample");
  mkdirSync(path.join(sample, "models"), { recursive: true });
  writeFileSync(path.join(sample, "models", "model.glb"), "1234567890");
  const manifest = path.join(root, "manifest.json");
  writeFileSync(manifest, JSON.stringify({
    schemaVersion: 1,
    defaults: [],
    releasedSkins: [],
    skins: [{
      brawlerId: 16000012,
      skinId: "CrowDefault",
      character: "Crow",
      publicCharacter: "Crow",
      released: true,
      sourceReadiness: { readyForConversion: true },
      baseModel: { kind: "ready", url: "/assets/brawlers/3d/models/model.glb" },
      diffuseTexture: { kind: "unavailable", reason: "not-captured" },
      animations: {},
      faces: {},
    }],
  }));
  return { root, sample, manifest };
}

test("projects sample bytes and reports same-origin ready URLs", () => {
  const source = fixture();
  try {
    const report = JSON.parse(execFileSync(process.execPath, [script, "--manifest", source.manifest, "--sample-package", source.sample], { encoding: "utf8" }));
    assert.equal(report.sourceReadySkins, 1);
    assert.equal(report.sample.files, 1);
    assert.equal(report.sample.bytes, 10);
    assert.equal(report.projected.files, 1);
    assert.equal(report.projected.bytes, 10);
    assert.deepEqual(report.sameOrigin.invalidUrls, []);
    assert.equal(report.sampleMatrix[0].publicCharacter, "Crow");
  } finally {
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("flags non-local ready URLs", () => {
  const source = fixture();
  try {
    const value = JSON.parse(readFileSync(source.manifest, "utf8"));
    value.skins[0].baseModel.url = "https://cdn.invalid/model.glb";
    writeFileSync(source.manifest, JSON.stringify(value));
    const report = JSON.parse(execFileSync(process.execPath, [script, "--manifest", source.manifest], { encoding: "utf8" }));
    assert.deepEqual(report.sameOrigin.invalidUrls, ["https://cdn.invalid/model.glb"]);
  } finally {
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("audits runtime index and per-brawler shard sizes and files", () => {
  const source = fixture();
  try {
    mkdirSync(path.join(source.root, "models"), { recursive: true });
    mkdirSync(path.join(source.root, "catalog"), { recursive: true });
    writeFileSync(path.join(source.root, "models", "model.glb"), "1234567890");
    writeFileSync(path.join(source.root, "catalog", "16000012.json"), JSON.stringify({
      schemaVersion: 1,
      kind: "brawler",
      brawlerId: 16000012,
      defaults: [{ baseModel: { kind: "ready", url: "/assets/brawlers/3d/models/model.glb" } }],
      releasedSkins: [],
    }));
    const index = path.join(source.root, "runtime-index.json");
    writeFileSync(index, JSON.stringify({ schemaVersion: 1, kind: "index", brawlers: [{ brawlerId: 16000012, shard: "/assets/brawlers/3d/catalog/16000012.json" }] }));
    const report = JSON.parse(execFileSync(process.execPath, [script, "--manifest", source.manifest, "--runtime-index", index, "--shards-dir", path.join(source.root, "catalog"), "--converted-dir", source.root], { encoding: "utf8" }));
    assert.equal(report.runtimeCatalog.shardCount, 1);
    assert.equal(report.runtimeCatalog.totalBytes, readFileSync(path.join(source.root, "catalog", "16000012.json")).byteLength);
    assert.equal(report.convertedDir.missingFiles.length, 0);
    assert.equal(report.sameOrigin.invalidUrls.length, 0);
  } finally {
    rmSync(source.root, { recursive: true, force: true });
  }
});
