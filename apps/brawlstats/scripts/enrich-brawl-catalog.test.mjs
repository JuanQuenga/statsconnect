import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";
import { normalizeReferenceModelRotations } from "../src/lib/brawler-viewer-runtime.ts";
import { shouldPreserveReferenceRotation } from "../src/lib/brawler-viewer-contract.ts";
import { canonicalMotion, motionHash, motionCacheKey, refreshMotionHashes, createDownloads, enrichCatalog, enrichSlots, outlineParameters, referencePage, referenceUvSource } from "./enrich-brawl-catalog.mjs";

function glbBytes(document, binary = Buffer.alloc(0)) {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, ...document }));
  const bytes = Buffer.alloc(20 + json.length + (binary.length ? 8 + binary.length : 0));
  bytes.writeUInt32LE(0x46546c67); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); json.copy(bytes, 20);
  if (binary.length) {
    bytes.writeUInt32LE(binary.length, 20 + json.length); bytes.writeUInt32LE(0x004e4942, 24 + json.length);
    binary.copy(bytes, 28 + json.length);
  }
  return bytes;
}

const bodyTrack = (name = "bone", values = [0, 0, 0, 1, 0, 0]) => ({ name, key: `${name}/translation`, path: "translation", times: [0, 1], values: Float64Array.from(values), size: 3, interpolation: "LINEAR" });
const bodyClip = (tracks = [bodyTrack()], maxTime = 1) => ({ tracks, minTime: 0, maxTime });
const window = { startFrame: 0, endFrame: -1, fps: 30 };

test("canonical motion suppresses metadata, key layout, track order and in-bin noise but preserves different body motion", () => {
  const a = bodyClip([bodyTrack("z"), bodyTrack("a")]);
  const b = bodyClip([bodyTrack("a"), bodyTrack("z")]);
  b.name = "irrelevant clip name";
  b.tracks[0].values[0] = 0.000001;
  assert.equal(motionHash(a, window), motionHash(b, { ...window, speed: 2, faceField: "different" }));
  const rekeyed = structuredClone(a);
  rekeyed.tracks[0].times = [0, 0.5, 1];
  rekeyed.tracks[0].values = Float64Array.from([0, 0, 0, 0.5, 0, 0, 1, 0, 0]);
  assert.equal(motionHash(a, window), motionHash(rekeyed, window));
  b.tracks[0].values[0] = 0.01;
  assert.notEqual(motionHash(a, window), motionHash(b, window));
  assert.notEqual(motionHash(a, window), motionHash(bodyClip([bodyTrack("other")]), window));
  assert.equal(motionHash(null, window), undefined);
  assert.match(motionHash(a, window), /^[0-9a-f]{64}$/);
});

test("viewer windows include one frame, clamp ends, use default fps and stabilise near-frame endpoint noise", () => {
  const clip = bodyClip();
  assert.equal(motionHash(clip, window), motionHash(clip, { ...window, startFrame: -10, endFrame: 999 }));
  assert.equal(motionHash(clip, {}), motionHash(clip, { startFrame: 0, endFrame: -1, fps: 60 }));
  assert.equal(motionHash(bodyClip([bodyTrack()], 0.800000011920929), { ...window, endFrame: 23 }), motionHash(bodyClip([bodyTrack()], 0.8), window));
  const canonical = canonicalMotion(clip, { ...window, endFrame: 14 });
  assert.equal(canonical.duration, 5000);
  assert.equal(canonical.tracks[0][2].length, 31);
  assert.notEqual(motionHash(clip, window), motionHash(clip, { ...window, startFrame: 15 }));
  assert.throws(() => motionHash(clip, { ...window, startFrame: 31 }), /starts beyond/);
});

test("quaternion signs represent the same rotation, and STEP/cubic differences stay visible", () => {
  const rotation = { ...bodyTrack(), path: "rotation", size: 4, values: Float64Array.from([0, 0, 0, 1, 0, 0, 1, 0]) };
  const negated = { ...rotation, values: rotation.values.map((value) => -value) };
  assert.equal(motionHash(bodyClip([rotation]), window), motionHash(bodyClip([negated]), window));
  assert.notEqual(motionHash(bodyClip(), window), motionHash(bodyClip([{ ...bodyTrack(), interpolation: "STEP" }]), window));
  const cubic = { ...bodyTrack(), interpolation: "CUBICSPLINE", values: Float64Array.from([0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]) };
  assert.notEqual(motionHash(bodyClip(), window), motionHash(bodyClip([cubic]), window));
});

test("reference hashes sample the requested outer window through repeated source clips", () => {
  const clip = bodyClip([{ ...bodyTrack("bone", [0, 0, 0, 2, 0, 0]), times: [0, 2] }], 2);
  const longWindow = { startFrame: 0, endFrame: 12, fps: 2 };
  const canonical = canonicalMotion(clip, longWindow, "reference-bridge");
  assert.equal(canonical.duration, 60000);
  const samples = canonical.tracks[0][2];
  assert.equal(samples.length, 25);
  assert.deepEqual(samples[4], [10000, 0, 0]);
  assert.deepEqual(samples[8], [0, 0, 0]);
  assert.deepEqual(samples[12], [10000, 0, 0]);
  assert.deepEqual(samples[24], [0, 0, 0]);
  assert.notEqual(motionHash(clip, longWindow, "reference-bridge"), motionHash(clip, longWindow));
  assert.notEqual(motionCacheKey(clip, longWindow, "reference-bridge"), motionCacheKey(clip, longWindow));
});

test("reference negative ends keep the full source period with nonzero or wrapped starts", () => {
  const clip = bodyClip([{ ...bodyTrack("bone", [0, 0, 0, 2, 0, 0]), times: [0, 2] }], 2);
  const animation = { startFrame: 2, endFrame: -1, fps: 2 };
  const canonical = canonicalMotion(clip, animation, "reference-bridge");
  assert.equal(canonical.duration, 20000);
  assert.deepEqual(canonical.tracks[0][2][0], [10000, 0, 0]);
  assert.deepEqual(canonical.tracks[0][2][4], [0, 0, 0]);
  assert.deepEqual(canonical.tracks[0][2].at(-1), [10000, 0, 0]);
  assert.equal(canonicalMotion(clip, animation).duration, 10000);
  assert.equal(motionHash(clip, animation, "reference-bridge"), motionHash(clip, { ...animation, startFrame: 6 }, "reference-bridge"));
});

test("Trixie's reference book quaternion hashes retain authored norms and interpolator output", () => {
  const rotation = { ...bodyTrack("book_s"), path: "rotation", size: 4, values: Float64Array.from([0, 0, 0, 1.234, 0, 0, 0, 1.234]) };
  const normalized = { ...rotation, values: Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1]) };
  const raw = canonicalMotion(bodyClip([rotation]), window, "reference-bridge", "PercenterTrixie");
  assert.deepEqual(raw.tracks[0][2][0], [0, 0, 0, 12340]);
  assert.deepEqual(raw.tracks[0][2][1], [0, 0, 0, 12340]);
  assert.notEqual(motionHash(bodyClip([rotation]), window, "reference-bridge", "PercenterTrixie"), motionHash(bodyClip([normalized]), window, "reference-bridge", "PercenterTrixie"));
  assert.notEqual(motionHash(bodyClip([rotation]), window), motionHash(bodyClip([normalized]), window), "pinned runtime leaves raw keys unchanged");
  assert.equal(motionHash(bodyClip([rotation]), window, "reference-bridge"), motionHash(bodyClip([normalized]), window, "reference-bridge"));
  assert.equal(motionHash(bodyClip([rotation]), window, "reference-bridge", "PercenterTrixie"), motionHash(bodyClip([{ ...rotation, values: rotation.values.map((value) => -value) }]), window, "reference-bridge", "PercenterTrixie"));
  assert.notEqual(motionCacheKey(bodyClip([rotation]), window, "reference-bridge", "PercenterTrixie"), motionCacheKey(bodyClip([rotation]), window, "reference-bridge"));
  const otherBone = { ...rotation, name: "other" }, normalizedOther = { ...normalized, name: "other" };
  assert.equal(motionHash(bodyClip([otherBone]), window, "reference-bridge", "PercenterTrixie"), motionHash(bodyClip([normalizedOther]), window, "reference-bridge", "PercenterTrixie"));
  const interpolated = { ...rotation, values: Float64Array.from([0, 0, 0, 1.234, 0, 0, 1.234, 0]) };
  assert.deepEqual(canonicalMotion(bodyClip([interpolated]), window, "reference-bridge", "PercenterTrixie").tracks[0][2][30], [0, 0, 8726, 8726]);
  const unequalNorms = { ...rotation, values: Float64Array.from([0, 0, 0, 1.234, 0, 0, 0.9, 0]) };
  assert.deepEqual(canonicalMotion(bodyClip([unequalNorms]), window, "reference-bridge").tracks[0][2][30], [0, 0, 7071, 7071], "normalization happens before interpolation");
});

test("canonical rotation samples agree with the runtime preparation and Three mixer", () => {
  for (const interpolation of [THREE.InterpolateLinear, THREE.InterpolateDiscrete]) {
    for (const [assetGroup, skinId] of [["reference-bridge", "PercenterTrixie"], ["reference-bridge", "other"], ["pinned-local", "PercenterTrixie"]]) {
      const scene = new THREE.Group(), bone = new THREE.Bone();
      bone.name = "book_s";
      scene.add(bone);
      const rotation = new THREE.QuaternionKeyframeTrack("book_s.quaternion", [0, 1], [0, 0, 0, 1.234, 0, 0, 0.9, 0], interpolation);
      const clip = new THREE.AnimationClip("body", 1, [rotation]);
      const parsed = bodyClip([{ ...bodyTrack("book_s"), path: "rotation", size: 4, times: [...rotation.times], values: Float64Array.from(rotation.values), interpolation: interpolation === THREE.InterpolateDiscrete ? "STEP" : "LINEAR" }]);
      if (assetGroup === "reference-bridge") normalizeReferenceModelRotations({ scene, animations: [clip] },
        shouldPreserveReferenceRotation(skinId, assetGroup, bone.name) ? new Set([bone.name]) : new Set());
      const mixer = new THREE.AnimationMixer(scene), action = mixer.clipAction(clip);
      action.play();
      const canonical = canonicalMotion(parsed, window, assetGroup, skinId);
      for (const index of [0, 15, 30, 45, 60]) {
        action.time = (index / 60) % 1;
        mixer.update(0);
        const actual = bone.quaternion.toArray().map((value) => Math.round(value / 1e-4));
        assert.deepEqual(canonical.tracks[0][2][index], actual, `${assetGroup} ${skinId} ${interpolation} sample ${index}`);
      }
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
    }
  }
});

test("offline motion refresh normalizes native bridge markers, preserves repaired faces and is idempotent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "enrich-offline-motion-test-"));
  const directory = path.join(root, "out"), cacheDir = path.join(root, "cache"), workerOrigin = "https://worker.test/";
  const nativeUrl = "/assets/brawlers/3d/native/kaze.glb", mirroredUrl = "/assets/brawlers/3d/reference-bridge/objects/kaze.glb";
  const binary = Buffer.alloc(32);
  [0, 10, 0, 0, 0, 10, 0, 0].forEach((value, index) => binary.writeFloatLE(value, index * 4));
  const document = { buffers: [{ byteLength: 32 }], bufferViews: [{ buffer: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: 24 }],
    accessors: [{ bufferView: 0, componentType: 5126, type: "SCALAR", count: 2 }, { bufferView: 1, componentType: 5126, type: "VEC3", count: 2 }],
    nodes: [{ name: "bone" }], animations: [{ samplers: [{ input: 0, output: 1 }], channels: [{ sampler: 0, target: { node: 0, path: "translation" } }] }] };
  const bytes = glbBytes(document, binary);
  const original = { schemaVersion: 1, defaults: [{ skinId: "GeishaDefault", character: "Geisha", brawlerId: 16000094, assetGroup: "reference-bridge",
    retained: "native repair", faces: { HappyFace: { atlas: { kind: "unavailable" }, binary: { kind: "ready", url: "/assets/brawlers/3d/faces/repaired.bin" }, fps: 30, retained: "keep" } },
    baseModel: { kind: "unavailable" }, diffuseTexture: { kind: "unavailable" },
    animations: { HappyAnim: { startFrame: 0, endFrame: 1138, fps: 120, exported: { kind: "ready", url: mirroredUrl }, motionHash: "a".repeat(64) },
      HeroScreenAnim: { startFrame: 0, endFrame: 1140, fps: 120, exported: { kind: "ready", url: nativeUrl }, motionHash: "b".repeat(64), contentHash: "c".repeat(64), hasClip: true },
      HeroScreenLoopAnim: { startFrame: 1020, endFrame: 1140, fps: 120, exported: { kind: "ready", url: nativeUrl }, motionHash: "d".repeat(64) },
      MirroredLoop: { startFrame: 1019, endFrame: 1138, fps: 120, exported: { kind: "ready", url: mirroredUrl } } } }] };
  const index = { schemaVersion: 1, kind: "index", brawlers: [{ brawlerId: 16000094, shard: "/assets/brawlers/3d/catalog/94.json" }] };
  const strip = (value) => { const copy = structuredClone(value); for (const entry of copy.defaults) for (const animation of Object.values(entry.animations)) delete animation.motionHash; return copy; };
  try {
    await mkdir(path.join(directory, "catalog"), { recursive: true });
    await mkdir(path.join(cacheDir, "worker"), { recursive: true });
    await writeFile(path.join(directory, "catalog.json"), JSON.stringify(index));
    await writeFile(path.join(directory, "catalog/94.json"), JSON.stringify(original));
    for (const url of [nativeUrl, mirroredUrl]) {
      const cachedUrl = new URL(url.replace("/assets/brawlers/3d/", ""), workerOrigin).href;
      await writeFile(path.join(cacheDir, "worker", `${createHash("sha256").update(cachedUrl).digest("hex")}.bin`), bytes);
    }
    const options = { directory, cacheDir, workerOrigin, workDir: root };
    const result = await refreshMotionHashes(options);
    const output = JSON.parse(await readFile(path.join(directory, "catalog/94.json")));
    assert.deepEqual(strip(output), strip(original));
    const animations = output.defaults[0].animations;
    assert.equal(animations.HappyAnim.motionHash, animations.HeroScreenAnim.motionHash);
    assert.equal(animations.HeroScreenLoopAnim.motionHash, animations.MirroredLoop.motionHash);
    assert.equal(animations.HappyAnim.motionHash, motionHash(bodyClip([{ ...bodyTrack("bone", [0, 0, 0, 10, 0, 0]), times: [0, 10] }], 10), { startFrame: 0, endFrame: 1138, fps: 120 }, "reference-bridge", "GeishaDefault"));
    assert.equal(result.counts.motionHashChanges, 4);
    assert.equal(result.counts.preservedShards, 1);
    assert.equal((await readFile(path.join(directory, "catalog.json"), "utf8")), JSON.stringify(index));
    const firstBytes = await readFile(path.join(directory, "catalog/94.json"));
    assert.equal((await refreshMotionHashes(options)).counts.motionHashChanges, 0);
    assert.deepEqual(await readFile(path.join(directory, "catalog/94.json")), firstBytes);
    await rm(path.join(cacheDir, "worker"), { recursive: true });
    await assert.rejects(refreshMotionHashes(options), /offline animation cache miss/);
    assert.deepEqual(await readFile(path.join(directory, "catalog/94.json")), firstBytes, "missing assets abort before any catalog write");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("fresh animation-only enrichment preserves live round-one fields and groups first-clip motion across different bytes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "enrich-live-motion-test-"));
  const prefix = "/assets/brawlers/3d/";
  const aUrl = `${prefix}a.glb`, bUrl = `${prefix}b.glb`, noClipUrl = `${prefix}none.glb`;
  const binary = Buffer.alloc(32);
  [0, 1, 0, 0, 0, 1, 0, 0].forEach((value, index) => binary.writeFloatLE(value, index * 4));
  const document = { buffers: [{ byteLength: 32 }], bufferViews: [{ buffer: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: 24 }],
    accessors: [{ bufferView: 0, componentType: 5126, type: "SCALAR", count: 2 }, { bufferView: 1, componentType: 5126, type: "VEC3", count: 2 }],
    nodes: [{ name: "bone" }], animations: [{ samplers: [{ input: 0, output: 1 }], channels: [{ sampler: 0, target: { node: 0, path: "translation" } }] }] };
  const assets = new Map([[aUrl, glbBytes(document, binary)], [bUrl, glbBytes({ ...document, animations: [...document.animations, { channels: [] }], extras: "different bytes" }, binary)], [noClipUrl, glbBytes({ nodes: [] })]]);
  const digest = (url) => createHash("sha256").update(assets.get(url)).digest("hex");
  const original = { schemaVersion: 1, defaults: [{ skinId: "skin", character: "character", brawlerId: 1, retained: "live",
    faces: {}, baseModel: { kind: "unavailable" }, diffuseTexture: { kind: "unavailable" },
    animations: { A: { ...window, exported: { kind: "ready", url: aUrl }, contentHash: digest(aUrl), hasClip: false },
      B: { ...window, exported: { kind: "ready", url: bUrl }, contentHash: digest(bUrl) },
      None: { exported: { kind: "ready", url: noClipUrl }, contentHash: digest(noClipUrl), motionHash: "f".repeat(64) } },
    materialSlots: [{ materialName: "hull", scBooleans: { enableNormalOutline: true }, outline: { width: 0.1, color: [0, 0, 0, 1] } }] }] };
  const index = { schemaVersion: 1, kind: "index", brawlers: [{ brawlerId: 1, shard: `${prefix}catalog/1.json` }] };
  let metadataRequests = 0, assetRequests = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith("catalog.json")) { metadataRequests++; return Response.json(index); }
    if (url.endsWith("catalog/1.json")) { metadataRequests++; return Response.json(original); }
    const key = `${prefix}${new URL(url).pathname.slice(1)}`;
    if (assets.has(key)) { assetRequests++; return new Response(assets.get(key)); }
    throw new Error(`animation-only mode fetched unexpected source: ${url}`);
  };
  try {
    const options = { workDir: root, diagnosticDir: root, fetchImpl, refreshCatalog: true, animationsOnly: true };
    const changes = await enrichCatalog(options);
    const output = JSON.parse(await readFile(path.join(root, "out/catalog/1.json")));
    const entry = output.defaults[0];
    assert.deepEqual(entry.materialSlots, original.defaults[0].materialSlots);
    assert.equal(entry.animations.A.contentHash, digest(aUrl));
    assert.equal(entry.animations.A.motionHash, entry.animations.B.motionHash);
    assert.equal("hasClip" in entry.animations.A, false);
    assert.equal(entry.animations.None.hasClip, false);
    assert.equal("motionHash" in entry.animations.None, false);
    assert.equal(changes.counts.motionHashAdded, 2);
    assert.equal(changes.counts.distinctMotions, 1);
    assert.equal(changes.counts.duplicateMotionGroups, 1);
    assert.equal(changes.duplicateMotionCountsPerSkin[0].groups, 1);
    assert.equal(changes.counts.motionFailures, 0);
    original.defaults[0].retained = "new live value";
    await enrichCatalog(options);
    assert.equal(JSON.parse(await readFile(path.join(root, "out/catalog/1.json"))).defaults[0].retained, "new live value");
    assert.equal(metadataRequests, 4);
    assert.equal(assetRequests, 3, "immutable GLBs stay cached even when metadata is fresh");
  } finally { await rm(root, { recursive: true, force: true }); }
});

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
  const animationBytes = glbBytes({ nodes: [] });
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
    if (url.endsWith("animation.glb")) return new Response(animationBytes);
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
    assert.equal(output.defaults[0].animations.IdleAnim.contentHash, createHash("sha256").update(animationBytes).digest("hex"));
    assert.equal(output.defaults[0].animations.IdleAnim.hasClip, false);
    assert.equal("motionHash" in output.defaults[0].animations.IdleAnim, false);
    assert.equal(changes.counts.cliplessEntries, 2);
    assert.equal(changes.counts.distinctCliplessGlbs, 1);
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
