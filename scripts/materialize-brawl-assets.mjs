#!/usr/bin/env node

/**
 * Materialize browser assets from the pinned source mirror.
 *
 * This is deliberately a build-time bridge: it never emits source URLs to the
 * browser. FLA2 geometry/animations go through the pinned converter, SCTX
 * textures go through the pinned parser, and face exports go through the
 * native SC5 exporter. A missing tool or failed conversion is recorded as an
 * unavailable reason instead of being represented as a ready asset.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateBrawlAnimationGlb } from "./validate-brawl-animation.mjs";

const SIX_ROLES = ["IdleAnim", "WalkAnim", "PrimarySkillAnim", "SecondarySkillAnim", "HappyAnim", "SadAnim"];

export function resolveMaterializerPath(value, baseDirectory = process.cwd()) {
  return value ? path.resolve(baseDirectory, value) : value;
}

function parseArgs(argv = process.argv.slice(2)) {
  const values = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const [key, inline] = argv[i].slice(2).split("=", 2);
    const next = argv[i + 1];
    values.set(key, inline ?? (next && !next.startsWith("--") ? argv[++i] : true));
  }
  return values;
}

function sourceBytes(mirror, commit, source) {
  return execFileSync("git", ["-C", mirror, "show", `${commit}:${source}`], { maxBuffer: 256 * 1024 * 1024 });
}

export function selectedEntries(manifest, options) {
  const entries = (manifest.skins ?? manifest.releasedSkins ?? [])
    .filter((entry) => entry.released && entry.sourceReadiness?.readyForConversion);
  const brawlerId = options.get("brawler-id");
  const skinId = options.get("skin-id");
  const ids = brawlerId ? new Set(String(brawlerId).split(",").map(Number)) : null;
  let filtered = entries.filter((entry) => (!ids || ids.has(entry.brawlerId)) && (!skinId || entry.skinId === skinId));
  if (options.has("distinct-brawlers")) {
    const seen = new Set();
    filtered = filtered.filter((entry) => seen.has(entry.brawlerId) ? false : (seen.add(entry.brawlerId), true));
  }
  const limit = options.get("limit");
  return limit ? filtered.slice(0, Number(limit)) : filtered;
}

function isStandardGlb(bytes) {
  return bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "glTF" && bytes.readUInt32LE(4) === 2;
}

export function validateGeometryGlb(bytes) {
  if (!isStandardGlb(bytes)) return { ok: false, reason: "model-glb-invalid" };
  try {
    const jsonLength = bytes.readUInt32LE(12);
    const jsonType = bytes.readUInt32LE(16);
    if (jsonType !== 0x4e4f534a || 20 + jsonLength > bytes.length) return { ok: false, reason: "model-glb-invalid" };
    const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
    const primitives = (document.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
    if (primitives.length === 0 || primitives.some((primitive) => !primitive.attributes || primitive.attributes.TEXCOORD_0 === undefined)) {
      return { ok: false, reason: "model-texcoord0-missing" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "model-glb-invalid" };
  }
}

function verifyPinnedConverter(converterDir, manifest, options) {
  const expectedCommit = options.get("converter-commit") ?? manifest.source?.converter?.commit;
  if (!expectedCommit) throw new Error("manifest is missing the pinned converter commit");
  const actualCommit = execFileSync("git", ["-C", converterDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (actualCommit !== expectedCommit) throw new Error(`converter commit mismatch: expected ${expectedCommit}, got ${actualCommit}`);
  const reader = readFileSync(path.join(converterDir, "lib/animation/continuousPackedReader.py"), "utf8");
  if (!reader.includes("decode_base_rotation_component") || !reader.includes("signed_value -= 0x10000")) {
    throw new Error("converter is missing the pinned signed quaternion patch");
  }
  const constants = readFileSync(path.join(converterDir, "lib/odin_constants.py"), "utf8");
  const attributes = readFileSync(path.join(converterDir, "lib/odin_attribute.py"), "utf8");
  if (!constants.includes("HalfVector2 = 22") || !constants.includes("OdinAttributeFormat.HalfVector2: 2") || !attributes.includes("case OdinAttributeFormat.HalfVector2")) {
    throw new Error("converter is missing Odin HalfVector2 UV support");
  }
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit", maxBuffer: 32 * 1024 * 1024 });
}

function materializeEntry(entry, options, outputDir, mirror, commit, parserRoot, converterDir, python) {
  const key = entry.conversionPlan?.key;
  if (!key) return { brawlerId: entry.brawlerId, skinId: entry.skinId, ready: false, unavailable: ["missing-conversion-key"] };
  const work = mkdtempSync(path.join(tmpdir(), "brawl-materialize-"));
  const input = path.join(work, "In-SC-glTF");
  const converted = path.join(work, "Out-glTF");
  mkdirSync(input, { recursive: true });
  mkdirSync(converted, { recursive: true });
  const unavailable = [];
  const modelPlan = entry.conversionPlan.model;
  const texturePlan = entry.conversionPlan.texture;
  const animationPlans = Object.entries(entry.conversionPlan.animations ?? {});
  const sourcePlans = [modelPlan, ...animationPlans.map(([, plan]) => plan)].filter(Boolean);
  const sourceFailures = new Set();

  for (const plan of sourcePlans) {
    const sourceName = path.basename(plan.input);
    try {
      const local = path.join(input, sourceName);
      writeFileSync(local, sourceBytes(mirror, commit, plan.input));
    } catch {
      sourceFailures.add(plan.input);
    }
  }
  if (sourceFailures.size > 0) {
    for (const source of sourceFailures) unavailable.push(`source-read-failed:${source}`);
  }
  if (sourcePlans.some((plan) => plan === modelPlan && !sourceFailures.has(plan.input))) {
    try {
      run(python, [path.join(converterDir, "main.py"), "decode"], work);
    } catch {
      unavailable.push("fla2-conversion-failed");
    }
  }

  let modelReady = false;
  if (modelPlan && !sourceFailures.has(modelPlan.input)) {
    const convertedModel = path.join(converted, path.basename(modelPlan.input));
    const geometry = existsSync(convertedModel) ? validateGeometryGlb(readFileSync(convertedModel)) : { ok: false, reason: "model-converter-did-not-emit-standard-glb" };
    if (geometry.ok) {
      const target = path.join(outputDir, "models", `${key}.glb`);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(convertedModel, target);
      modelReady = true;
    } else unavailable.push(geometry.reason);
  }

  const animationReady = {};
  for (const [field, plan] of animationPlans) {
    if (sourceFailures.has(plan.input)) {
      animationReady[field] = false;
      unavailable.push(`animation-source-missing:${field}`);
      continue;
    }
    const convertedAnimation = path.join(converted, path.basename(plan.input));
    if (!existsSync(convertedAnimation) || !isStandardGlb(readFileSync(convertedAnimation))) {
      animationReady[field] = false;
      unavailable.push(`animation-not-converted:${field}`);
      continue;
    }
    const validation = validateBrawlAnimationGlb(readFileSync(convertedAnimation));
    if (!validation.ok) {
      animationReady[field] = false;
      unavailable.push(`animation-validation-failed:${field}:${validation.reason}`);
      continue;
    }
    const target = path.join(outputDir, "animations", key, `${field}.glb`);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(convertedAnimation, target);
    animationReady[field] = true;
  }

  let textureReady = false;
  if (texturePlan) {
    const textureSource = path.join(work, path.basename(texturePlan.input));
    try {
      writeFileSync(textureSource, sourceBytes(mirror, commit, texturePlan.input));
      const target = path.join(outputDir, "textures", `${key}.png`);
      run(python, [path.join(options.get("script-dir") ?? path.dirname(new URL(import.meta.url).pathname), "decode-brawl-sctx.py"), textureSource, target, "--parser-root", parserRoot], work);
      textureReady = existsSync(target);
    } catch {
      unavailable.push("sctx-texture-decode-failed");
    }
  } else unavailable.push("diffuse-texture-not-configured");

  // Exporting one native idle face gives every materialized group an actual
  // face atlas/binary pair. Other face states remain unavailable until they
  // can be packed against the same atlas (never silently reuse a wrong one).
  let faceReady = false;
  const idleFace = entry.faces?.IdleFace;
  const scFile = path.join(work, "characters.sc");
  if (idleFace?.exportName && parserRoot) {
    try {
      writeFileSync(scFile, sourceBytes(mirror, commit, `${entry.conversionPlan.model.input.split("/sc3d/")[0]}/sc/characters.sc`));
      const atlas = path.join(outputDir, "faces", key, "atlas.png");
      const binary = path.join(outputDir, "faces", key, "IdleFace.bin");
      const metadata = path.join(outputDir, "faces", key, "IdleFace.meta.json");
      mkdirSync(path.dirname(atlas), { recursive: true });
      const faceArgs = [path.join(options.get("script-dir") ?? path.dirname(new URL(import.meta.url).pathname), "export-sc5-face-raster.py"), scFile, idleFace.exportName, atlas, binary, "--parser-root", parserRoot, "--vector", "--metadata-output", metadata];
      run(python, faceArgs, work);
      faceReady = existsSync(atlas) && existsSync(binary);
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n", 1)[0] : "unknown-error";
      unavailable.push(`native-face-export-failed:${message}`);
    }
  } else unavailable.push("native-idle-face-not-mapped");

  const ready = modelReady && textureReady && Object.values(animationReady).some(Boolean);
  if (!ready && !unavailable.includes("incomplete-runtime-assets")) unavailable.push("incomplete-runtime-assets");
  return {
    brawlerId: entry.brawlerId,
    skinId: entry.skinId,
    key,
    modelReady,
    textureReady,
    animationReady,
    faceReady,
    ready,
    unavailable: [...new Set(unavailable)],
  };
}

export function materializeManifest(manifest, options = new Map()) {
  const mirror = resolveMaterializerPath(options.get("mirror"));
  const commit = options.get("commit") ?? manifest.source?.commit;
  const outputDir = resolveMaterializerPath(options.get("output-dir"));
  const parserRoot = resolveMaterializerPath(options.get("parser-root"));
  const converterDir = resolveMaterializerPath(options.get("converter-dir"));
  const python = options.get("python") ?? process.env.PYTHON ?? "python3";
  if (!mirror || !commit || !outputDir || !parserRoot || !converterDir) throw new Error("--mirror, --output-dir, --parser-root, and --converter-dir are required");
  verifyPinnedConverter(converterDir, manifest, options);
  const results = selectedEntries(manifest, options).map((entry) => materializeEntry(entry, options, outputDir, mirror, commit, parserRoot, converterDir, python));
  const summary = {
    sourceReady: results.length,
    ready: results.filter((result) => result.ready).length,
    unavailable: results.filter((result) => !result.ready).length,
    modelReady: results.filter((result) => result.modelReady).length,
    textureReady: results.filter((result) => result.textureReady).length,
    animationReady: results.filter((result) => Object.values(result.animationReady).some(Boolean)).length,
    faceReady: results.filter((result) => result.faceReady).length,
  };
  const report = { schemaVersion: 1, source: { mirror, commit }, summary, entries: results };
  const reportPath = options.get("report");
  if (reportPath) writeFileSync(resolveMaterializerPath(reportPath), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();
  const manifest = JSON.parse(readFileSync(options.get("manifest"), "utf8"));
  const report = materializeManifest(manifest, options);
  console.log(JSON.stringify(report.summary, null, 2));
}
