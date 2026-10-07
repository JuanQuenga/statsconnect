import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDownloads, enrichCatalog, enrichSlots, outlineParameters, referencePage, referenceUvSource } from "./enrich-brawl-catalog.mjs";

test("UV atlas clause uses only the lobby atlas and preserves geometry exceptions", () => {
  const encoded = JSON.stringify({ idle: ["idle.glb", "characters_68", "face67"], lobby: ["win.glb", "characters", "happy68"] }).replaceAll('"', "&#34;");
  const page = referencePage(`<canvas id="glCanvas" data-model-name="crow.glb" data-animations="${encoded}"></canvas>`);
  assert.equal(referenceUvSource({}, page), "default");
  assert.equal(referenceUvSource({}, { ...page, lobbyAtlasName: "characters_67" }), "67/68");
  assert.equal(referenceUvSource({}, { ...page, fileVersion: "68" }), "67/68");
  assert.equal(referenceUvSource({}, { ...page, model: "rico_og_geo.glb" }), "67/68");
  assert.equal(referenceUvSource({ extensionsUsed: ["v"] }, page), "67/68");
  assert.equal(referenceUvSource({ extensionsUsed: ["KHR_texture_transform", "v"] }, page), "KHR_texture_transform");
  assert.equal(referenceUvSource({ asset: { generator: "COLLADA2GLTF" } }, { ...page, lobbyAtlasName: "68" }), "COLLADA2GLTF");
});

test("outline keeps signed authored width and RGBA, matches overrides by name with fallback", () => {
  const material = { name: "hull", variables: { floats: { outlineWidth: -0.033 }, floatVectors: { outlineColor: [0.1, 0.2, 0.3, 0.4] } } };
  const expected = { width: -0.033, color: [0.1, 0.2, 0.3, 0.4] };
  assert.deepEqual(outlineParameters(material), expected);
  assert.equal(outlineParameters({ variables: { floats: { outlineWidth: 1 } } }), null);
  assert.deepEqual(outlineParameters({ variables: { floats: { outlineWidth: 1 }, floatVectors: { outlineColor: [2, 0, 0, 1] } } }), { width: 1, color: [2, 0, 0, 1] });
  const entry = { skinId: "skin", materialSlots: [
    { materialName: "hull", scBooleans: { enableNormalOutline: true }, uvSource: "67/68" },
    { materialName: "body", scBooleans: { enableNormalOutline: false }, uvSource: "67/68" },
  ] };
  const changes = { outlineSlotsEnriched: [], missingOutlineParams: [], uvSourceCorrections: [] };
  enrichSlots(entry, { lobbyAtlasName: "plain" }, { materials: [material] }, { materials: [{ name: "other" }] }, changes);
  assert.deepEqual(entry.materialSlots[0].outline, expected);
  assert.equal("outline" in entry.materialSlots[1], false);
  assert.equal(changes.uvSourceCorrections.length, 2);
  const override = structuredClone(material);
  override.variables.floats.outlineWidth = 0;
  enrichSlots(entry, { lobbyAtlasName: "plain" }, { materials: [material] }, { materials: [override] }, changes);
  assert.equal(entry.materialSlots[0].outline.width, 0);
});

test("full enrichment preserves shard names and unrelated data, hashes exact bytes, validates and resumes cached", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "enrich-catalog-test-"));
  const workDir = path.join(root, "run");
  const diagnosticDir = path.join(root, "no-diagnostics");
  const shardUrl = "/assets/brawlers/3d/catalog/16000001.unchanged.json";
  const animationUrl = "/assets/brawlers/3d/reference-bridge/objects/animation.glb";
  const modelUrl = "/assets/brawlers/3d/reference-bridge/objects/model.glb";
  const geometry = { materials: [{ name: "hull", variables: { floats: { outlineWidth: 0.066 }, floatVectors: { outlineColor: [1, 0.5, 0, 1] } } }] };
  const original = { schemaVersion: 1, kind: "brawler", brawlerId: 16000001, defaults: [{
    brawlerId: 16000001, skinId: "CrowDefault", character: "Crow", displayName: "Crow (Default)", assetGroup: "reference-bridge",
    baseModel: { kind: "ready", url: modelUrl }, diffuseTexture: { kind: "unavailable" },
    animations: { IdleAnim: { exported: { kind: "ready", url: animationUrl }, label: "Idle" }, Duplicate: { exported: { kind: "ready", url: animationUrl } } },
    materialSlots: [{ materialName: "hull", uvSource: "67/68", scBooleans: { enableNormalOutline: true } }],
    retainedField: "keep me", faces: {},
  }], releasedSkins: [], skins: [] };
  const index = { schemaVersion: 1, kind: "index", brawlers: [{ brawlerId: 16000001, shard: shardUrl }] };
  const page = `<canvas id="glCanvas" data-model-name="crow.glb" data-animations='{ "lobby": ["win.glb", "plain", "face68"] }'></canvas>`;
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith("catalog.json")) return Response.json(index);
    if (url.endsWith("unchanged.json")) return Response.json(original);
    if (url.includes("/skins/")) return new Response(page);
    if (url.endsWith("model.glb")) return Response.json(geometry);
    if (url.endsWith("animation.glb")) return new Response("exact exported bytes");
    throw new Error(`unexpected request ${url}`);
  };
  try {
    const options = { workDir, diagnosticDir, fetchImpl, concurrency: 2 };
    const changes = await enrichCatalog(options);
    assert.equal(changes.counts.hashesAdded, 2);
    assert.equal(changes.counts.distinctAnimationGlbsHashed, 1);
    assert.equal(changes.counts.outlineSlotsEnriched, 1);
    assert.equal(changes.counts.uvSourceCorrections, 1);
    const output = JSON.parse(await readFile(path.join(workDir, "out/catalog/16000001.unchanged.json")));
    assert.equal(output.defaults[0].retainedField, "keep me");
    assert.equal(output.defaults[0].materialSlots[0].uvSource, "default");
    assert.equal(output.defaults[0].animations.IdleAnim.contentHash, createHash("sha256").update("exact exported bytes").digest("hex"));
    assert.deepEqual(JSON.parse(await readFile(path.join(workDir, "out/catalog.json"))), index);
    assert.equal(calls.filter((url) => url.endsWith("animation.glb")).length, 1);
    const firstCalls = calls.length;
    await enrichCatalog(options);
    assert.equal(calls.length, firstCalls, "never re-fetch cached pages/assets");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failed source lookup records missing outline params and skipped skin while still hashing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "enrich-catalog-failure-test-"));
  const fetchImpl = async (url) => {
    if (url.endsWith("catalog.json")) return Response.json({ schemaVersion: 1, kind: "index", brawlers: [{ brawlerId: 1, shard: "/assets/brawlers/3d/catalog/1.json" }] });
    if (url.endsWith("/catalog/1.json")) return Response.json({ schemaVersion: 1, defaults: [{ skinId: "one", character: "one", displayName: "one", assetGroup: "reference-bridge", baseModel: { kind: "unavailable" }, diffuseTexture: { kind: "unavailable" }, animations: {}, faces: {}, materialSlots: [{ materialName: "missing", scBooleans: { enableNormalOutline: true } }] }] });
    return new Response("no page", { status: 404 });
  };
  try {
    const result = await enrichCatalog({ workDir: root, diagnosticDir: path.join(root, "empty"), fetchImpl });
    assert.equal(result.counts.skippedSkins, 1);
    assert.equal(result.counts.missingOutlineParams, 1);
    assert.match(result.skippedSkins[0].reason, /HTTP 404/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("reference fetches are serial, at least 250ms apart, and cached", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "enrich-polite-test-"));
  const starts = [];
  let active = 0;
  const downloads = createDownloads({ directory: root, diagnosticDir: root, workerOrigin: "https://worker.test/", fetchImpl: async () => {
    assert.equal(active++, 0);
    starts.push(Date.now());
    await new Promise((resolve) => setTimeout(resolve, 10));
    active--;
    return new Response("page");
  } });
  try {
    await Promise.all([downloads.get("https://mv.brawlstars.top/skins/one", { reference: true }), downloads.get("https://mv.brawlstars.top/skins/two", { reference: true })]);
    assert.ok(starts[1] - starts[0] >= 250);
    await downloads.get("https://mv.brawlstars.top/skins/one", { reference: true });
    assert.equal(starts.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("worker downloads share the concurrency cap across animations and geometry", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "enrich-worker-cap-test-"));
  let active = 0;
  let peak = 0;
  const downloads = createDownloads({ directory: root, diagnosticDir: root, workerOrigin: "https://worker.test/", concurrency: 2,
    fetchImpl: async () => {
      peak = Math.max(peak, ++active);
      return { status: 200, statusText: "OK", headers: new Headers(), arrayBuffer: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        active--;
        return new Uint8Array([1, 2, 3]).buffer;
      } };
    },
  });
  try {
    await Promise.all(Array.from({ length: 10 }, (_, index) => downloads.worker(`/assets/brawlers/3d/objects/${index}.glb`)));
    assert.equal(peak, 2);
    assert.equal(active, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
