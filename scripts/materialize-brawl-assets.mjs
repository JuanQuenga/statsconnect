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
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateBrawlAnimationGlb } from "./validate-brawl-animation.mjs";

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

export function publishAnimation(plan, convertedAnimation, target, commit, fps) {
  const metadata = target.replace(/\.glb$/, ".meta.json");
  for (const file of [target, metadata]) rmSync(file, { force: true });
  if (!Number.isFinite(fps) || fps <= 0) return { ok: false, reason: "animation-source-fps-invalid" };
  if (!existsSync(convertedAnimation)) return { ok: false, reason: "animation-not-converted" };
  const validation = validateBrawlAnimationGlb(readFileSync(convertedAnimation));
  if (!validation.ok) return validation;
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(convertedAnimation, target);
  writeFileSync(metadata, `${JSON.stringify({ fps, source: { commit, input: plan.input, symbol: plan.symbol } }, null, 2)}\n`);
  return { ok: true };
}

/** Export every mapped role, reusing only an identical SC file and export. */
export function materializeFaces({ key, faces, outputDir, commit, exportFace }) {
  const faceStateReady = {};
  const unavailable = [];
  const exports = new Map();
  for (const [field, plan] of Object.entries(faces ?? {})) {
    const directory = path.join(outputDir, "faces", key);
    const targets = {
      atlas: path.join(directory, `${field}.png`),
      binary: path.join(directory, `${field}.bin`),
      metadata: path.join(directory, `${field}.meta.json`),
    };
    const clear = () => Object.values(targets).forEach((file) => rmSync(file, { force: true }));
    clear();
    faceStateReady[field] = false;
    if (!plan?.exportName || !plan.input || !plan.symbol) {
      unavailable.push(`native-face-not-mapped:${field}`);
      continue;
    }
    const exportKey = JSON.stringify([plan.input, plan.exportName]);
    try {
      mkdirSync(directory, { recursive: true });
      const previous = exports.get(exportKey);
      if (previous) {
        for (const kind of Object.keys(targets)) copyFileSync(previous[kind], targets[kind]);
      } else {
        exportFace(plan, targets);
      }
      if (!Object.values(targets).every(existsSync)) throw new Error("incomplete-atlas-binary-metadata-pair");
      const metadata = JSON.parse(readFileSync(targets.metadata, "utf8"));
      if (metadata.available !== true || metadata.selected_export !== plan.exportName) throw new Error("face-export-mismatch");
      metadata.source = { commit, input: plan.input, symbol: plan.symbol, exportName: plan.exportName };
      writeFileSync(targets.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
      exports.set(exportKey, targets);
      faceStateReady[field] = true;
    } catch (error) {
      clear();
      const message = error instanceof Error ? error.message.split("\n", 1)[0] : "unknown-error";
      unavailable.push(`native-face-export-failed:${field}:${message}`);
    }
  }
  return { faceStateReady, faceReady: Object.values(faceStateReady).some(Boolean), unavailable };
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
  rmSync(path.join(outputDir, "models", `${key}.glb`), { force: true });
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
  const animationMetadata = new Map();
  for (const [field, plan] of animationPlans) {
    const target = path.join(outputDir, "animations", key, `${field}.glb`);
    if (sourceFailures.has(plan.input)) {
      for (const file of [target, target.replace(/\.glb$/, ".meta.json")]) rmSync(file, { force: true });
      animationReady[field] = false;
      unavailable.push(`animation-source-missing:${field}`);
      continue;
    }
    if (!animationMetadata.has(plan.input)) {
      try {
        const script = path.join(options.get("script-dir") ?? path.dirname(new URL(import.meta.url).pathname), "read-brawl-animation-metadata.py");
        const metadata = JSON.parse(execFileSync(python, [script, path.join(input, path.basename(plan.input)), "--converter-dir", converterDir], { encoding: "utf8" }));
        animationMetadata.set(plan.input, metadata);
      } catch {
        animationMetadata.set(plan.input, { fps: null });
      }
    }
    const convertedAnimation = path.join(converted, path.basename(plan.input));
    const validation = publishAnimation(plan, convertedAnimation, target, commit, animationMetadata.get(plan.input).fps);
    if (!validation.ok) {
      animationReady[field] = false;
      unavailable.push(`animation-validation-failed:${field}:${validation.reason}`);
      continue;
    }
    animationReady[field] = true;
  }

  let textureReady = false;
  rmSync(path.join(outputDir, "textures", `${key}.png`), { force: true });
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

  const faceResult = materializeFaces({
    key, faces: entry.conversionPlan.faces, outputDir, commit,
    exportFace(plan, targets) {
      const scFile = path.join(work, "face-source.sc");
      writeFileSync(scFile, sourceBytes(mirror, commit, plan.input));
      const faceArgs = [path.join(options.get("script-dir") ?? path.dirname(new URL(import.meta.url).pathname), "export-sc5-face-raster.py"), scFile, plan.exportName, targets.atlas, targets.binary, "--parser-root", parserRoot, "--vector", "--metadata-output", targets.metadata];
      run(python, faceArgs, work);
    },
  });
  unavailable.push(...faceResult.unavailable);

  const ready = modelReady && textureReady && Object.values(animationReady).some(Boolean);
  if (!ready && !unavailable.includes("incomplete-runtime-assets")) unavailable.push("incomplete-runtime-assets");
  return {
    brawlerId: entry.brawlerId,
    skinId: entry.skinId,
    key,
    modelReady,
    textureReady,
    animationReady,
    faceReady: faceResult.faceReady,
    faceStateReady: faceResult.faceStateReady,
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
