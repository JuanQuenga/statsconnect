import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const script = path.join(repositoryRoot, "scripts/build-brawl-asset-manifest.mjs");

function animationFixtureGlb(quaternion) {
  const json = { asset: { version: "2.0" }, buffers: [{ byteLength: 16 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 16 }], accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: "VEC4" }], animations: [{ samplers: [{ output: 0 }], channels: [{ sampler: 0, target: { node: 0, path: "rotation" } }] }] };
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const binary = Buffer.from(new Float32Array(quaternion).buffer);
  const output = Buffer.alloc(12 + 8 + paddedJson.length + 8 + binary.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  let offset = 12;
  output.writeUInt32LE(paddedJson.length, offset);
  output.writeUInt32LE(0x4e4f534a, offset + 4);
  paddedJson.copy(output, offset + 8);
  offset += 8 + paddedJson.length;
  output.writeUInt32LE(binary.length, offset);
  output.writeUInt32LE(0x004e4942, offset + 4);
  binary.copy(output, offset + 8);
  return output;
}

function geometryFixtureGlb({ uv = true, revision = 1, specularTexture = null } = {}) {
  const document = { asset: { version: "2.0" }, extras: { revision }, buffers: [{ byteLength: 20 }], bufferViews: [{ buffer: 0, byteLength: 20 }], accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: "VEC3" }, { bufferView: 0, byteOffset: 12, componentType: 5126, count: 1, type: "VEC2" }], materials: [{ name: "actual_fixture_material", shader: "uber", constants: ["DIFFUSE"], variables: { textures: { diffuseTex2D: "sc3d/crow_tex.sctx#repeat" } } }], meshes: [{ primitives: [{ material: 0, attributes: { POSITION: 0, ...(uv ? { TEXCOORD_0: 1 } : {}) } }] }] };
  if (specularTexture) {
    document.materials[0].constants.push("SPECULAR");
    document.materials[0].variables.textures.specularTex2D = specularTexture;
  }
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const bytes = Buffer.alloc(12 + 8 + padded.length + 8 + 20);
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); padded.copy(bytes, 20);
  bytes.writeUInt32LE(20, 20 + padded.length); bytes.writeUInt32LE(0x004e4942, 24 + padded.length);
  return bytes;
}

function bridgeFixture(faceFlags = { scaledUpTexture: true }) {
  const hash = createHash("sha256").update("bridge").digest("hex");
  const asset = (name, extension) => ({ kind: "ready", url: `/assets/brawlers/3d/reference-bridge/16000001/CrowDefault/${name}.${hash}${extension}`, sha256: hash, sourceKind: "reference-preprocessed", assetSetId: "bridge-fixture" });
  return {
    schemaVersion: 1,
    kind: "reference-asset-bridge",
    source: { inventory: "fixture", externalUrls: [] },
    entries: [{
      brawlerId: 16000001,
      character: "Crow",
      skinId: "CrowDefault",
      status: "ready",
      source: { kind: "reference-preprocessed", assetSetId: "bridge-fixture", contentAddressed: true },
      assets: { geometry: asset("geometry", ".glb"), texture: asset("texture", ".png"), face: asset("face", ".bin"), faceAtlas: asset("atlas", ".png"), animations: { idle: asset("idle", ".glb") } },
      animationMetadata: { idle: { label: "Idle Anim", startFrame: 0, endFrame: 1, fps: 60 } },
      faceFlags,
      capabilities: { outline: { enabled: true } },
      materialSlots: [{ materialName: "character_mat", diffuse: true, stencil: true, uvSource: "default" }],
    }],
  };
}

function fixtureCsv() {
  const root = mkdtempSync(path.join(tmpdir(), "brawl-source-fixture-"));
  const versionRoot = path.join(root, "68.250");
  mkdirSync(path.join(versionRoot, "csv_logic"), { recursive: true });
  mkdirSync(path.join(versionRoot, "csv_client"), { recursive: true });
  mkdirSync(path.join(versionRoot, "sc3d"), { recursive: true });
  writeFileSync(
    path.join(versionRoot, "csv_logic", "characters.csv"),
    [
      "Name,Type,Disabled,DefaultSkin,HomeScreenScale,HeroScreenXOffset,HeroScreenZOffset,BattleIntroXOffset,BattleIntroZOffset",
      "string,string,bool,string,int,int,int,int,int",
      "ShotgunGirl,Hero,false,BanditGirlDefault,1,0,0,0,0",
      "Crow,Hero,false,CrowDefault,1,0,0,0,0",
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(versionRoot, "csv_logic", "skins.csv"),
    [
      "Name,Conf,DiffuseTexture,SpecularTexture",
      "string,string,string,string",
      "BanditGirlDefault,BanditGirlDefault,shelly_tex.sctx,",
      "CrowDefault,CrowDefault,crow_tex.sctx,",
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(versionRoot, "csv_logic", "skin_confs.csv"),
    [
      "Name,Character,Model,PortraitCameraFile,IdleAnim,IdleFace,FaceCoversWholeTexture,FaceScaledUpTexture",
      "string,string,string,string,string,string",
      "BanditGirlDefault,ShotgunGirl,shelly_geo.glb,shelly_cam.glb,shelly_idle,ShotgunFace,,",
      "CrowDefault,Crow,crow_geo.glb,crow_cam.glb,crow_idle,crow_def_face,,",
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(versionRoot, "csv_client", "faces.csv"),
    ["ExportName,Name,FileName", "string,string,string", "crow_def_face,CrowFace,characters.sc", "shelly_def_face,ShotgunFace,characters.sc", ""].join("\n"),
  );
  writeFileSync(path.join(versionRoot, "csv_client", "animations.csv"), [
    "Name,FileName,StartFrame,EndFrame,Speed", "string,string,int,int,int",
    "crow_idle,crow_idle.glb,,-1,", "shelly_idle,shelly_idle.glb,,-1,",
    "GunslingerRecoil,colt_recoil1.glb,1,10,125", "",
  ].join("\n"));
  for (const file of [
    "shelly_geo.glb",
    "shelly_cam.glb",
    "shelly_tex.sctx",
    "crow_geo.glb",
    "crow_idle.glb",
    "crow_cam.glb",
    "crow_tex.sctx",
  ]) {
    writeFileSync(path.join(versionRoot, "sc3d", file), "fixture");
  }
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "fixture@example.invalid"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);
  const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  return { root, commit };
}

test("joins configured symbols through animations.csv and preserves source playback metadata", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "source-animation-join-test-"));
  try {
    const confPath = path.join(source.root, "68.250/csv_logic/skin_confs.csv");
    writeFileSync(confPath, readFileSync(confPath, "utf8").replace("FaceScaledUpTexture\n", "FaceScaledUpTexture,PrimarySkillRecoilAnim\n").replace("crow_def_face,,", "crow_def_face,,,GunslingerRecoil"));
    for (const file of ["colt_recoil1.glb", "crow_attack.glb", "crow_walk.glb"]) writeFileSync(path.join(source.root, "68.250/sc3d", file), "fixture");
    execFileSync("git", ["-C", source.root, "add", "."]);
    execFileSync("git", ["-C", source.root, "commit", "-qm", "animation mapping fixture"]);
    const output = path.join(directory, "manifest.json");
    execFileSync(process.execPath, [script, "--mirror", source.root, "--commit", execFileSync("git", ["-C", source.root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), "--output", output], { cwd: repositoryRoot, stdio: "pipe" });
    const crow = JSON.parse(readFileSync(output, "utf8")).defaults.find((entry) => entry.character === "Crow");
    assert.equal(crow.conversionPlan.animations.PrimarySkillRecoilAnim.input, "68.250/sc3d/colt_recoil1.glb");
    assert.equal(crow.conversionPlan.animations.PrimarySkillRecoilAnim.symbol, "GunslingerRecoil");
    assert.equal(crow.animations.PrimarySkillRecoilAnim.startFrame, 1);
    assert.equal(crow.animations.PrimarySkillRecoilAnim.endFrame, 10);
    assert.equal(crow.animations.PrimarySkillRecoilAnim.speed, 1.25);
    assert.equal(crow.conversionPlan.animations.WalkAnim, undefined);
    assert.equal(crow.conversionPlan.animations.PrimarySkillAnim, undefined);
    assert.equal(crow.conversionPlan.faces.IdleFace.input, "68.250/sc/characters.sc");
  } finally { rmSync(directory, { recursive: true, force: true }); rmSync(source.root, { recursive: true, force: true }); }
});

function fixtureConverter(root) {
  const converter = path.join(root, "converter");
  mkdirSync(path.join(converter, "lib", "animation"), { recursive: true });
  writeFileSync(path.join(converter, "lib", "animation", "continuousPackedReader.py"), [
    "class OdinContinuousPackedReader:",
    "    @staticmethod",
    "    def decode_base_rotation_component(raw_value):",
    "        signed_value = int(raw_value)",
    "        if signed_value >= 0x8000:",
    "            signed_value -= 0x10000",
    "        return max(-1.0, signed_value / 32767.0)",
    "",
  ].join("\\n"));
  writeFileSync(path.join(converter, "lib", "odin_constants.py"), "HalfVector2 = 22\\nOdinAttributeFormat.HalfVector2: 2\\n");
  writeFileSync(path.join(converter, "lib", "odin_attribute.py"), "case OdinAttributeFormat.HalfVector2:\\n");
  execFileSync("git", ["-C", converter, "init", "-q"]);
  execFileSync("git", ["-C", converter, "config", "user.email", "fixture@example.invalid"]);
  execFileSync("git", ["-C", converter, "config", "user.name", "Fixture"]);
  execFileSync("git", ["-C", converter, "add", "."]);
  execFileSync("git", ["-C", converter, "commit", "-qm", "fixture"]);
  return { converter, commit: execFileSync("git", ["-C", converter, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() };
}

test("asset manifest derives row-index IDs and emits provenance-safe unavailable entries", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "brawl-manifest-test-"));
  try {
    const output = path.join(directory, "manifest.json");
    execFileSync(process.execPath, [
      script,
      "--mirror", source.root,
      "--commit", source.commit,
      "--output", output,
    ], { cwd: repositoryRoot, stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    const crow = manifest.defaults.find((entry) => entry.character === "Crow");
    const shelly = manifest.defaults.find((entry) => entry.character === "ShotgunGirl");
    assert.equal(shelly?.brawlerId, 16000000);
    assert.equal(crow?.brawlerId, 16000001);
    assert.deepEqual(manifest.source, {
      repository: "brawl-stars-assets-cache",
      commit: source.commit,
      version: "68.250",
      externalUrls: [],
    });
    const serialized = JSON.stringify(manifest);
    assert.equal(serialized.includes("http://"), false);
    assert.equal(serialized.includes("https://"), false);
    assert.equal(serialized.includes(repositoryRoot), false);
    assert.equal(serialized.includes("/tmp/"), false);
    assert.equal(crow?.baseModel.kind, "unavailable");
    assert.equal(crow?.faces.IdleFace.exportName, "crow_def_face");
    assert.equal(crow?.faces.IdleFace.resolved, true);
    assert.equal(shelly?.faces.IdleFace.exportName, "shelly_def_face");
    assert.equal(shelly?.faces.IdleFace.resolved, true);
    assert.deepEqual(shelly?.faceFlags, { faceCoversWholeTexture: null, faceScaledUpTexture: null, disableHeadRotation: null });
    assert.deepEqual(crow?.faceFlags, { faceCoversWholeTexture: null, faceScaledUpTexture: null, disableHeadRotation: null });
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("marks a skin-conf face export unavailable when the Name mapping is absent", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "face-mapping-missing-test-"));
  try {
    const confPath = path.join(source.root, "68.250", "csv_logic", "skin_confs.csv");
    const conf = readFileSync(confPath, "utf8").replace("ShotgunFace", "MissingFace");
    writeFileSync(confPath, conf);
    execFileSync("git", ["-C", source.root, "add", confPath]);
    execFileSync("git", ["-C", source.root, "commit", "-qm", "missing face mapping"]);
    const output = path.join(directory, "manifest.json");
    execFileSync(process.execPath, [script, "--mirror", source.root, "--commit", execFileSync("git", ["-C", source.root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), "--output", output], { cwd: repositoryRoot, stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    const shelly = manifest.defaults.find((entry) => entry.character === "ShotgunGirl");
    assert.equal(shelly.faces.IdleFace.resolved, false);
    assert.equal(shelly.faces.IdleFace.atlas.reason, "face-export-not-mapped");
    assert.equal(shelly.unavailableReasons.includes("face-symbol-not-mapped"), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("diagnostic pilot package paths match copied package layout", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "crow-package-test-"));
  const composed = path.join(directory, "composed");
  const textures = path.join(directory, "source-textures");
  mkdirSync(composed);
  mkdirSync(textures);
  writeFileSync(path.join(composed, "crow-textured-idle.glb"), "fixture-glb");
  writeFileSync(path.join(textures, "crow_tex.png"), "fixture-png");
  try {
    const output = path.join(directory, "manifest.json");
    execFileSync(process.execPath, [
      script,
      "--mirror", source.root,
      "--commit", source.commit,
      "--output", output,
      "--package-dir", directory,
      "--composed-dir", composed,
      "--texture-dir", textures,
    ], { cwd: repositoryRoot, stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(manifest.pilot.status, "diagnostic-unverified");
    assert.equal(manifest.pilot.package.model, "models/16000012.glb");
    assert.equal(manifest.pilot.package.texture, "textures/16000012.png");
    assert.equal(existsSync(path.join(directory, manifest.pilot.package.model)), true);
    assert.equal(existsSync(path.join(directory, manifest.pilot.package.texture)), true);
    assert.equal(JSON.stringify(manifest).includes("/tmp/"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("records and verifies the pinned converter geometry patch", () => {
  const source = fixtureCsv();
  const converter = fixtureConverter(source.root);
  const directory = mkdtempSync(path.join(tmpdir(), "converter-manifest-test-"));
  try {
    const output = path.join(directory, "manifest.json");
    execFileSync(process.execPath, [
      script,
      "--mirror", source.root,
      "--commit", source.commit,
      "--converter-dir", converter.converter,
      "--converter-commit", converter.commit,
      "--output", output,
    ], { cwd: repositoryRoot, stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(manifest.source.converter.commit, converter.commit);
    assert.equal(manifest.source.converter.repository, "Daniil-SV/Supercell-Flat-Converter");
    assert.equal(manifest.source.converter.patch, "scripts/patches/supercell-flat-converter-continuous-rotation.patch");
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("uses released API IDs, resolves composite models, and emits a catalog-wide conversion plan", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "catalog-manifest-test-"));
  const api = path.join(directory, "catalog.json");
  writeFileSync(api, JSON.stringify({ list: [
    { id: 16000123, name: "Crow", released: true },
    { id: 16000124, name: "ShotgunGirl", released: false },
  ] }));
  try {
    const output = path.join(directory, "manifest.json");
    execFileSync(process.execPath, [
      script,
      "--mirror", source.root,
      "--commit", source.commit,
      "--api-catalog", api,
      "--output", output,
    ], { cwd: repositoryRoot, stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(manifest.counts.releasedBrawlers, 1);
    assert.equal(manifest.defaults.length, 1);
    assert.equal(manifest.defaults[0].brawlerId, 16000123);
    assert.equal(manifest.defaults[0].released, true);
    assert.equal(manifest.defaults[0].sourceReadiness.readyForConversion, true);
    assert.equal(manifest.defaults[0].conversionPlan.model.input, "68.250/sc3d/crow_geo.glb");
    assert.equal(manifest.defaults[0].conversionPlan.texture.input, "68.250/sc3d/crow_tex.sctx");
    assert.equal(manifest.releasedSkins.length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("emits compact stable-ID runtime shards while keeping the full manifest in the audit output", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "catalog-shard-test-"));
  try {
    const output = path.join(directory, "catalog.json");
    const audit = path.join(directory, "catalog.build.json");
    const shards = path.join(directory, "catalog");
    execFileSync(process.execPath, [
      script,
      "--mirror", source.root,
      "--commit", source.commit,
      "--output", output,
      "--audit-output", audit,
      "--shards-dir", shards,
    ], { cwd: repositoryRoot, stdio: "pipe" });
    const index = JSON.parse(readFileSync(output, "utf8"));
    const shardReference = index.brawlers.find((entry) => entry.brawlerId === 16000001).shard;
    assert.match(shardReference, /\/16000001\.[a-f0-9]{16}\.json$/);
    const shard = JSON.parse(readFileSync(path.join(directory, shardReference.replace("/assets/brawlers/3d/", "")), "utf8"));
    const full = JSON.parse(readFileSync(audit, "utf8"));
    assert.equal(index.kind, "index");
    assert.deepEqual(index.brawlers.map((entry) => entry.brawlerId), [16000000, 16000001]);
    assert.equal(shard.kind, "brawler");
    assert.equal(shard.brawlerId, 16000001);
    assert.equal(shard.defaults[0].skinId, "CrowDefault");
    assert.equal(shard.defaults[0].assetGroup, "pinned-local");
    assert.equal("conversionPlan" in shard.defaults[0], false);
    assert.equal("source" in shard.defaults[0], false);
    assert.equal(full.defaults[0].conversionPlan !== undefined, true);
    assert.ok(readFileSync(output).byteLength < 1000);
    assert.ok(readFileSync(path.join(directory, shardReference.replace("/assets/brawlers/3d/", ""))).byteLength < 5000);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("content-addresses ready asset URLs when converted bytes change", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "content-addressed-assets-test-"));
  mkdirSync(path.join(directory, "models"), { recursive: true });
  mkdirSync(path.join(directory, "textures"), { recursive: true });
  writeFileSync(path.join(directory, "models", "16000001-CrowDefault.glb"), geometryFixtureGlb());
  writeFileSync(path.join(directory, "textures", "16000001-CrowDefault.png"), "texture-v1");
  try {
    const output = path.join(directory, "manifest.json");
    const command = [script, "--mirror", source.root, "--commit", source.commit, "--converted-dir", directory, "--output", output];
    execFileSync(process.execPath, command, { cwd: repositoryRoot, stdio: "pipe" });
    const first = JSON.parse(readFileSync(output, "utf8")).defaults.find((entry) => entry.character === "Crow");
    assert.match(first.baseModel.url, /16000001-CrowDefault\.[a-f0-9]{16}\.glb$/);
    assert.match(first.diffuseTexture.url, /16000001-CrowDefault\.[a-f0-9]{16}\.png$/);
    const readyUrls = [];
    (function collect(value) { if (!value || typeof value !== "object") return; for (const [key, child] of Object.entries(value)) { if (key === "url" && typeof child === "string") readyUrls.push(child); else collect(child); } })(first);
    assert.equal(readyUrls.every((url) => /\.[a-f0-9]{16}\.(?:glb|png|bin|webp)$/.test(url)), true);
    writeFileSync(path.join(directory, "models", "16000001-CrowDefault.glb"), geometryFixtureGlb({ revision: 2 }));
    execFileSync(process.execPath, command, { cwd: repositoryRoot, stdio: "pipe" });
    const second = JSON.parse(readFileSync(output, "utf8")).defaults.find((entry) => entry.character === "Crow");
    assert.notEqual(first.baseModel.url, second.baseModel.url);
    assert.equal(first.diffuseTexture.url, second.diffuseTexture.url);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("integrates a complete reference bridge only with explicit diagnostic opt-in", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "reference-bridge-manifest-test-"));
  try {
    const bridgePath = path.join(directory, "bridge.json");
    writeFileSync(bridgePath, JSON.stringify(bridgeFixture()));
    const output = path.join(directory, "manifest.json");
    const command = [script, "--mirror", source.root, "--commit", source.commit, "--reference-bridge", bridgePath, "--allow-diagnostic-reference-assets", "--output", output];
    execFileSync(process.execPath, command, { cwd: repositoryRoot, stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    const crow = manifest.defaults.find((entry) => entry.character === "Crow");
    assert.equal(crow.baseModel.url.includes("reference-bridge"), true);
    assert.equal(crow.animations.IdleAnim.exported.kind, "ready");
    assert.match(crow.faces.IdleFace.binary.url, /\.bin$/);
    assert.equal(crow.assetGroup, "reference-bridge");
    assert.equal(crow.materialSlots[0].stencilUvPolicy, "identity");
    assert.equal(manifest.source.diagnosticReferenceBridge.assetSetId, "bridge-fixture");
    assert.throws(() => execFileSync(process.execPath, [script, "--mirror", source.root, "--commit", source.commit, "--reference-bridge", bridgePath, "--output", output], { cwd: repositoryRoot, stdio: "pipe" }), /requires --allow-diagnostic-reference-assets/);
    const mixed = bridgeFixture();
    mixed.entries[0].assets.texture.sourceKind = "pinned-local";
    writeFileSync(bridgePath, JSON.stringify(mixed));
    assert.throws(() => execFileSync(process.execPath, command, { cwd: repositoryRoot, stdio: "pipe" }), /mixes or omits asset provenance|mixes source kinds/);
    const uvMismatch = bridgeFixture();
    uvMismatch.entries[0].materialSlots = [{ materialName: "character_mat", uvSource: "67/68" }];
    writeFileSync(bridgePath, JSON.stringify(uvMismatch));
    assert.throws(() => execFileSync(process.execPath, command, { cwd: repositoryRoot, stdio: "pipe" }), /UV policy mismatch/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("preserves source-declared attack and custom animation face bindings", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "reference-face-binding-test-"));
  try {
    const bridge = bridgeFixture();
    const entry = bridge.entries[0];
    entry.assets.animations.weapon = entry.assets.animations.idle;
    entry.assets.animations.ulti = entry.assets.animations.idle;
    entry.assets.animations.taunt = entry.assets.animations.idle;
    entry.assets.faces = { taunt_face: entry.assets.face };
    entry.animationMetadata.weapon = { face: "face", fps: 30 };
    entry.animationMetadata.ulti = { face: "face", fps: 30 };
    entry.animationMetadata.taunt = { face: "taunt_face", fps: 30 };
    const bridgePath = path.join(directory, "bridge.json");
    const output = path.join(directory, "manifest.json");
    writeFileSync(bridgePath, JSON.stringify(bridge));
    execFileSync(process.execPath, [script, "--mirror", source.root, "--commit", source.commit, "--reference-bridge", bridgePath, "--allow-diagnostic-reference-assets", "--output", output], { cwd: repositoryRoot, stdio: "pipe" });
    const crow = JSON.parse(readFileSync(output, "utf8")).defaults.find((candidate) => candidate.character === "Crow");
    assert.equal(crow.animations.PrimarySkillAnim.faceField, "IdleFace");
    assert.equal(crow.animations.SecondarySkillAnim.faceField, "IdleFace");
    assert.equal(crow.animations["ReferenceAnim:taunt"].faceField, "ReferenceFace:taunt_face");
    assert.equal(crow.faces["ReferenceFace:taunt_face"].binary.url, entry.assets.face.url);
    assert.equal(crow.animations.IdleAnim.faceField, null, "absent source face association stays explicit rather than inferring");
  } finally { rmSync(directory, { recursive: true, force: true }); rmSync(source.root, { recursive: true, force: true }); }
});

test("batch staging quarantines invalid reference packages without weakening valid entries", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "reference-quarantine-test-"));
  try {
    const bridge = bridgeFixture();
    bridge.entries.push({ ...structuredClone(bridge.entries[0]), skinId: "BadSkin", route: "Bad_Skin", status: "unavailable" });
    const input = path.join(directory, "bridge.json");
    const output = path.join(directory, "manifest.json");
    writeFileSync(input, JSON.stringify(bridge));
    const command = [script, "--mirror", source.root, "--commit", source.commit, "--reference-bridge", input, "--allow-diagnostic-reference-assets", "--output", output];
    assert.throws(() => execFileSync(process.execPath, command, { stdio: "pipe" }), /unavailable/);
    execFileSync(process.execPath, [...command, "--quarantine-reference-failures"], { stdio: "pipe" });
    const result = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(result.defaults.find((entry) => entry.skinId === "CrowDefault").baseModel.kind, "ready");
    assert.equal(result.skins.some((entry) => entry.skinId === "BadSkin"), false);
    assert.equal(result.referenceRejections.length, 1);
    assert.equal(result.referenceRejections[0].route, "Bad_Skin");
  } finally { rmSync(directory, { recursive: true, force: true }); rmSync(source.root, { recursive: true, force: true }); }
});

test("reference half-range UVs are admitted only with matching geometry evidence", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "reference-half-uv-test-"));
  try {
    const bridge = bridgeFixture();
    bridge.entries[0].geometryMetadata = { uvSource: "67/68", sourceKind: "reference-preprocessed", uvRange: { min: [0, 0], max: [0.5, 0.5] } };
    bridge.entries[0].materialSlots[0].uvSource = "67/68";
    const input = path.join(directory, "bridge.json");
    const output = path.join(directory, "manifest.json");
    const command = [script, "--mirror", source.root, "--commit", source.commit, "--reference-bridge", input, "--allow-diagnostic-reference-assets", "--output", output];
    writeFileSync(input, JSON.stringify(bridge));
    execFileSync(process.execPath, command, { stdio: "pipe" });
    assert.equal(JSON.parse(readFileSync(output, "utf8")).defaults.find((entry) => entry.skinId === "CrowDefault").baseModel.kind, "ready");
    bridge.entries[0].geometryMetadata.uvRange.max = [1, 1];
    writeFileSync(input, JSON.stringify(bridge));
    assert.throws(() => execFileSync(process.execPath, command, { stdio: "pipe" }), /unverified half-range/);
  } finally { rmSync(directory, { recursive: true, force: true }); rmSync(source.root, { recursive: true, force: true }); }
});

test("allows distinct coherent asset sets across bridge entries", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "reference-bridge-multi-manifest-test-"));
  try {
    const bridge = bridgeFixture();
    const shelly = structuredClone(bridge.entries[0]);
    shelly.brawlerId = 16000000;
    shelly.character = "ShotgunGirl";
    shelly.skinId = "BanditGirlDefault";
    shelly.source.assetSetId = "bridge-fixture-shelly";
    const rewrite = (value) => {
      if (Array.isArray(value)) return value.map(rewrite);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value).map(([key, child]) => {
        if (key === "assetSetId") return [key, "bridge-fixture-shelly"];
        if (key === "url" && typeof child === "string") return [key, child.replace("16000001/CrowDefault", "16000000/BanditGirlDefault")];
        return [key, rewrite(child)];
      }));
    };
    shelly.assets = rewrite(shelly.assets);
    bridge.entries.push(shelly);
    const bridgePath = path.join(directory, "bridge.json");
    const output = path.join(directory, "manifest.json");
    writeFileSync(bridgePath, JSON.stringify(bridge));
    execFileSync(process.execPath, [script, "--mirror", source.root, "--commit", source.commit, "--reference-bridge", bridgePath, "--allow-diagnostic-reference-assets", "--output", output], { cwd: repositoryRoot, stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(manifest.defaults.find((entry) => entry.character === "Crow")?.baseModel.kind, "ready");
    assert.equal(manifest.defaults.find((entry) => entry.character === "ShotgunGirl")?.baseModel.kind, "ready");
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("treats empty and explicit false face flags as disabled", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "face-flag-manifest-test-"));
  try {
    const bridgePath = path.join(directory, "bridge.json");
    writeFileSync(bridgePath, JSON.stringify(bridgeFixture({ scaledUpTexture: "", coversWholeTexture: "false" })));
    const output = path.join(directory, "manifest.json");
    execFileSync(process.execPath, [script, "--mirror", source.root, "--commit", source.commit, "--reference-bridge", bridgePath, "--allow-diagnostic-reference-assets", "--output", output], { cwd: repositoryRoot, stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    const crow = manifest.defaults.find((entry) => entry.character === "Crow");
    assert.deepEqual(crow.faceFlags, { faceCoversWholeTexture: null, faceScaledUpTexture: null, disableHeadRotation: null });
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("converted-dir only marks assets ready when the project-owned files exist", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "converted-manifest-test-"));
  mkdirSync(path.join(directory, "models"), { recursive: true });
  mkdirSync(path.join(directory, "textures"), { recursive: true });
  writeFileSync(path.join(directory, "models", "16000001-CrowDefault.glb"), geometryFixtureGlb());
  writeFileSync(path.join(directory, "textures", "16000001-CrowDefault.png"), "texture");
  try {
    const output = path.join(directory, "manifest.json");
    execFileSync(process.execPath, [
      script,
      "--mirror", source.root,
      "--commit", source.commit,
      "--converted-dir", directory,
      "--output", output,
    ], { cwd: repositoryRoot, stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    const crow = manifest.defaults.find((entry) => entry.character === "Crow");
    const shelly = manifest.defaults.find((entry) => entry.character === "ShotgunGirl");
    assert.equal(crow.baseModel.kind, "ready");
    assert.deepEqual(crow.materialSlots.map((slot) => slot.materialName), ["actual_fixture_material"]);
    assert.equal(crow.diffuseTexture.kind, "ready");
    assert.equal(shelly.baseModel.kind, "unavailable");
    assert.equal(shelly.diffuseTexture.kind, "unavailable");
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("converted animations are rejected until every quaternion is finite and unit length", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "animation-validation-test-"));
  mkdirSync(path.join(directory, "models"), { recursive: true });
  mkdirSync(path.join(directory, "textures"), { recursive: true });
  mkdirSync(path.join(directory, "animations", "16000001-CrowDefault"), { recursive: true });
  writeFileSync(path.join(directory, "models", "16000001-CrowDefault.glb"), geometryFixtureGlb());
  writeFileSync(path.join(directory, "textures", "16000001-CrowDefault.png"), "texture");
  const animation = path.join(directory, "animations", "16000001-CrowDefault", "IdleAnim.glb");
  writeFileSync(animation.replace(/\.glb$/, ".meta.json"), JSON.stringify({ fps: 30, source: { commit: source.commit, input: "68.250/sc3d/crow_idle.glb", symbol: "crow_idle" } }));
  try {
    const output = path.join(directory, "manifest.json");
    writeFileSync(animation, animationFixtureGlb([0, 0, 0, 32767]));
    const command = [script, "--mirror", source.root, "--commit", source.commit, "--converted-dir", directory, "--output", output];
    execFileSync(process.execPath, command, { cwd: repositoryRoot, stdio: "pipe" });
    let manifest = JSON.parse(readFileSync(output, "utf8"));
    let crow = manifest.defaults.find((entry) => entry.character === "Crow");
    assert.deepEqual(crow.animations.IdleAnim.exported, { kind: "unavailable", reason: "animation-quaternion-not-unit" });
    writeFileSync(animation, animationFixtureGlb([0, 0, 0, 1]));
    execFileSync(process.execPath, command, { cwd: repositoryRoot, stdio: "pipe" });
    manifest = JSON.parse(readFileSync(output, "utf8"));
    crow = manifest.defaults.find((entry) => entry.character === "Crow");
    assert.equal(crow.animations.IdleAnim.exported.kind, "ready");
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(source.root, { recursive: true, force: true });
  }
});

test("catalog admission rejects stale UV-less geometry and wrong animation source metadata", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "stale-export-test-"));
  try {
    const model = path.join(directory, "models/16000001-CrowDefault.glb");
    const animation = path.join(directory, "animations/16000001-CrowDefault/IdleAnim.glb");
    mkdirSync(path.dirname(model), { recursive: true });
    mkdirSync(path.dirname(animation), { recursive: true });
    writeFileSync(model, geometryFixtureGlb({ uv: false }));
    writeFileSync(animation, animationFixtureGlb([0, 0, 0, 1]));
    writeFileSync(animation.replace(/\.glb$/, ".meta.json"), JSON.stringify({ source: { commit: source.commit, input: "68.250/sc3d/wrong_attack.glb", symbol: "crow_idle" } }));
    const output = path.join(directory, "manifest.json");
    execFileSync(process.execPath, [script, "--mirror", source.root, "--commit", source.commit, "--converted-dir", directory, "--output", output], { cwd: repositoryRoot, stdio: "pipe" });
    const crow = JSON.parse(readFileSync(output, "utf8")).defaults.find((entry) => entry.character === "Crow");
    assert.deepEqual(crow.baseModel, { kind: "unavailable", reason: "model-texcoord0-missing" });
    assert.deepEqual(crow.animations.IdleAnim.exported, { kind: "unavailable", reason: "animation-source-mismatch" });
    assert.deepEqual(crow.materialSlots, []);
  } finally { rmSync(directory, { recursive: true, force: true }); rmSync(source.root, { recursive: true, force: true }); }
});

test("configured material overrides cannot silently use geometry materials", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "material-override-test-"));
  try {
    const skinsPath = path.join(source.root, "68.250/csv_logic/skins.csv");
    writeFileSync(skinsPath, readFileSync(skinsPath, "utf8").replace("SpecularTexture\n", "SpecularTexture,MaterialsFile\n").replace("crow_tex.sctx,", "crow_tex.sctx,,gold_true_materials.glb"));
    execFileSync("git", ["-C", source.root, "add", "."]);
    execFileSync("git", ["-C", source.root, "commit", "-qm", "material override"]);
    const model = path.join(directory, "models/16000001-CrowDefault.glb");
    mkdirSync(path.dirname(model), { recursive: true });
    writeFileSync(model, geometryFixtureGlb());
    const output = path.join(directory, "manifest.json");
    execFileSync(process.execPath, [script, "--mirror", source.root, "--commit", execFileSync("git", ["-C", source.root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), "--converted-dir", directory, "--output", output], { cwd: repositoryRoot, stdio: "pipe" });
    const crow = JSON.parse(readFileSync(output, "utf8")).defaults.find((entry) => entry.character === "Crow");
    assert.equal(crow.baseModel.reason, "materials-override-not-converted");
    assert.deepEqual(crow.materialSlots, []);
  } finally { rmSync(directory, { recursive: true, force: true }); rmSync(source.root, { recursive: true, force: true }); }
});

test("separate specular masks are unavailable until the runtime supports them", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "separate-specular-test-"));
  try {
    const model = path.join(directory, "models/16000001-CrowDefault.glb");
    mkdirSync(path.dirname(model), { recursive: true });
    mkdirSync(path.join(directory, "textures"), { recursive: true });
    writeFileSync(path.join(directory, "textures/16000001-CrowDefault.png"), "diffuse-fixture");
    writeFileSync(path.join(directory, "separate_specular.png"), "specular-fixture");
    writeFileSync(model, geometryFixtureGlb({ specularTexture: "sc3d/separate_specular.png#repeat" }));
    const output = path.join(directory, "manifest.json");
    const command = [script, "--mirror", source.root, "--commit", source.commit, "--converted-dir", directory, "--output", output];
    execFileSync(process.execPath, command, { cwd: repositoryRoot, stdio: "pipe" });
    let crow = JSON.parse(readFileSync(output, "utf8")).defaults.find((entry) => entry.character === "Crow");
    assert.deepEqual(crow.baseModel, { kind: "unavailable", reason: "separate-specular-texture-not-supported" });
    assert.deepEqual(crow.materialSlots, []);
    writeFileSync(model, geometryFixtureGlb({ specularTexture: "sc3d/crow_tex.sctx#repeat" }));
    execFileSync(process.execPath, command, { cwd: repositoryRoot, stdio: "pipe" });
    crow = JSON.parse(readFileSync(output, "utf8")).defaults.find((entry) => entry.character === "Crow");
    assert.equal(crow.baseModel.kind, "ready");
    assert.equal(crow.materialSlots[0].specular, true);
    assert.equal("specularTexture" in crow.materialSlots[0], false);
  } finally { rmSync(directory, { recursive: true, force: true }); rmSync(source.root, { recursive: true, force: true }); }
});

test("source frame windows use the converted role's verified frame rate", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "animation-frame-rate-test-"));
  try {
    const csvPath = path.join(source.root, "68.250/csv_client/animations.csv");
    writeFileSync(csvPath, readFileSync(csvPath, "utf8").replace("crow_idle,crow_idle.glb,,-1,", "crow_idle,crow_idle.glb,1,10,"));
    execFileSync("git", ["-C", source.root, "add", "."]);
    execFileSync("git", ["-C", source.root, "commit", "-qm", "bounded animation"]);
    const commit = execFileSync("git", ["-C", source.root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const animation = path.join(directory, "animations/16000001-CrowDefault/IdleAnim.glb");
    mkdirSync(path.dirname(animation), { recursive: true });
    writeFileSync(animation, animationFixtureGlb([0, 0, 0, 1]));
    const metadata = { source: { commit, input: "68.250/sc3d/crow_idle.glb", symbol: "crow_idle" } };
    writeFileSync(animation.replace(/\.glb$/, ".meta.json"), JSON.stringify({ ...metadata, fps: 30 }));
    const output = path.join(directory, "manifest.json");
    const command = [script, "--mirror", source.root, "--commit", commit, "--converted-dir", directory, "--output", output];
    execFileSync(process.execPath, command, { cwd: repositoryRoot, stdio: "pipe" });
    let crow = JSON.parse(readFileSync(output, "utf8")).defaults.find((entry) => entry.character === "Crow");
    assert.equal(crow.animations.IdleAnim.exported.kind, "ready");
    assert.equal(crow.animations.IdleAnim.startFrame, 1);
    assert.equal(crow.animations.IdleAnim.endFrame, 10);
    assert.equal(crow.animations.IdleAnim.fps, 30);
    for (const fps of [undefined, 0, -1, "30"]) {
      writeFileSync(animation.replace(/\.glb$/, ".meta.json"), JSON.stringify({ ...metadata, fps }));
      execFileSync(process.execPath, command, { cwd: repositoryRoot, stdio: "pipe" });
      crow = JSON.parse(readFileSync(output, "utf8")).defaults.find((entry) => entry.character === "Crow");
      assert.equal(crow.animations.IdleAnim.exported.reason, "animation-frame-rate-not-captured");
      assert.equal(crow.animations.IdleAnim.fps, undefined);
      assert.equal(crow.conversionPlan.animations.IdleAnim.fps, undefined);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); rmSync(source.root, { recursive: true, force: true }); }
});

test("raw faces require the corrected zero-based export-name identity stamp", () => {
  const source = fixtureCsv();
  const directory = mkdtempSync(path.join(tmpdir(), "face-export-identity-test-"));
  try {
    const target = path.join(directory, "faces/16000001-CrowDefault/IdleFace");
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(`${target}.png`, "atlas"); writeFileSync(`${target}.bin`, "binary");
    const metadata = { fps: 30, source: { commit: source.commit, input: "68.250/sc/characters.sc", symbol: "crow_def_face", exportName: "crow_def_face" } };
    writeFileSync(`${target}.meta.json`, JSON.stringify(metadata));
    const output = path.join(directory, "manifest.json");
    const command = [script, "--mirror", source.root, "--commit", source.commit, "--converted-dir", directory, "--output", output];
    execFileSync(process.execPath, command, { cwd: repositoryRoot, stdio: "pipe" });
    let crow = JSON.parse(readFileSync(output, "utf8")).defaults.find((entry) => entry.character === "Crow");
    assert.equal(crow.faces.IdleFace.binary.reason, "face-export-name-mapping-unverified");
    writeFileSync(`${target}.meta.json`, JSON.stringify({ ...metadata, export_name_reference_base: 0, export_object_id: 1994 }));
    execFileSync(process.execPath, command, { cwd: repositoryRoot, stdio: "pipe" });
    crow = JSON.parse(readFileSync(output, "utf8")).defaults.find((entry) => entry.character === "Crow");
    assert.equal(crow.faces.IdleFace.ready, true);
  } finally { rmSync(directory, { recursive: true, force: true }); rmSync(source.root, { recursive: true, force: true }); }
});

test("mirror is required", () => {
  assert.throws(
    () => execFileSync(process.execPath, [script, "--output", path.join(tmpdir(), "missing-mirror.json")], { cwd: repositoryRoot, stdio: "pipe" }),
    /--mirror is required/,
  );
});
