#!/usr/bin/env node
// CPU verification of the delivered catalog, geometry, rigs, and face binaries.
// External textures are placeholders: use the hero page for GPU/visual QA.
import { readFile, access, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BrawlerViewerRuntime, normalizeReferenceModelRotations } from "../src/lib/brawler-viewer-runtime.ts";
import { parseBrawlerAssetCatalog, catalogEntryHasRuntime, catalogEntryToViewerManifest } from "../src/lib/brawler-asset-catalog.ts";
import { validateGeometryGlb } from "../../../scripts/materialize-brawl-assets.mjs";
import { validateBrawlAnimationGlb } from "../../../scripts/validate-brawl-animation.mjs";

const args = process.argv.slice(2);
const rootArgument = args[0]?.startsWith("--") ? undefined : args.shift();
const options = new Map();
for (let index = 0; index < args.length; index++) {
  const key = args[index];
  options.set(key, key === "--summary" ? true : args[++index]);
}
const assetDirectory = path.resolve(rootArgument ?? fileURLToPath(new URL("../../../.generated/brawl-3d", import.meta.url)));
const failures = [];
const warnings = new Map();
const files = new Map();
const maxCacheBytes = 64 * 1024 * 1024;
let cachedBytes = 0;
let peakCachedBytes = 0;
const referenceCorrections = new Map();
const asArrayBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
function assetPath(url) {
  const match = /^\/(?:bs\/)?assets\/brawlers\/3d\/(.+)$/.exec(url);
  if (!match) throw new Error(`Not a local brawler asset URL: ${url}`);
  const target = path.resolve(assetDirectory, match[1]);
  if (!target.startsWith(`${assetDirectory}${path.sep}`)) throw new Error(`Asset escapes directory: ${url}`);
  return target;
}
async function bytesFor(url) {
  if (files.has(url)) {
    const bytes = files.get(url);
    files.delete(url); files.set(url, bytes);
    return bytes;
  }
  const bytes = await readFile(assetPath(url));
  if (bytes.length <= maxCacheBytes) {
    while (cachedBytes + bytes.length > maxCacheBytes) {
      const oldest = files.keys().next().value;
      cachedBytes -= files.get(oldest).length;
      files.delete(oldest);
    }
    files.set(url, bytes); cachedBytes += bytes.length;
    peakCachedBytes = Math.max(peakCachedBytes, cachedBytes);
  }
  return bytes;
}
const category = (error) => error?.code === "ENOENT" ? "missing-file" : /requires self-contained|unsupported/i.test(String(error)) ? "unsupported" : "invalid-data";
const fail = (context, error) => failures.push({ ...context, category: category(error), reason: String(error) });
function documentFor(bytes) {
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "glTF") throw new Error("Invalid GLB header");
  const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
  // SC_shader materials use separately captured textures. Leftover glTF image
  // tables are not dependencies unless a used native material references them.
  const usesNativeTexture = (value) => {
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, child]) => (/Texture$/i.test(key) && Number.isInteger(child?.index)) || usesNativeTexture(child));
  };
  const materials = new Set((document.meshes ?? []).flatMap((mesh) => (mesh.primitives ?? []).map((primitive) => primitive.material)));
  const hasTextureDependency = [...materials].some((index) => usesNativeTexture(document.materials?.[index]));
  if (hasTextureDependency || document.buffers?.some((buffer) => buffer.uri)) {
    throw new Error("CPU check requires self-contained geometry with separate runtime textures; use browser QA for embedded images");
  }
  return document;
}

const index = JSON.parse(await readFile(path.join(assetDirectory, "catalog.json"), "utf8"));
if (index.kind !== "index" || !Array.isArray(index.brawlers)) throw new Error("Expected sharded catalog index");
const results = [];
let skinCount = 0;
let faceLoads = 0;
for (const row of index.brawlers) {
  if (options.has("--brawler-id") && row.brawlerId !== Number(options.get("--brawler-id"))) continue;
  let raw;
  try { raw = JSON.parse(await readFile(assetPath(row.shard), "utf8")); }
  catch (error) { fail({ stage: "shard", brawlerId: row.brawlerId }, error); continue; }
  const entries = [];
  const seen = new Set();
  for (const value of [...(raw.defaults ?? []), ...(raw.releasedSkins ?? []), ...(raw.skins ?? [])]) {
    if (options.has("--skin-id") && value.skinId !== options.get("--skin-id")) continue;
    try {
      const entry = parseBrawlerAssetCatalog({ schemaVersion: raw.schemaVersion, defaults: [value] }).defaults[0];
      if (entry.brawlerId === row.brawlerId && catalogEntryHasRuntime(entry) && !seen.has(entry.skinId)) { entries.push(entry); seen.add(entry.skinId); }
    } catch (error) { fail({ stage: "catalog", brawlerId: row.brawlerId, skin: value.skinId }, error); }
  }
  for (const entry of entries) {
    const manifest = catalogEntryToViewerManifest(entry);
    if (!manifest) throw new Error(`Selected skin has no runtime: ${entry.skinId}`);
    skinCount++;
    try {
      const geometry = validateGeometryGlb(await bytesFor(manifest.baseModel.url));
      if (!geometry.ok) throw new Error(geometry.reason);
    } catch (error) { fail({ stage: "geometry", skin: entry.skinId }, error); continue; }
    for (const [key, animation] of Object.entries(manifest.animations)) {
      const originalWarn = console.warn;
      const originalError = console.error;
      const bindingErrors = [];
      const collect = (...args) => {
        const message = args.map(String).join(" ");
        warnings.set(message, (warnings.get(message) ?? 0) + 1);
        if (/PropertyBinding|no target node|bone.*not found/i.test(message)) bindingErrors.push(message);
      };
      let hasBodyClip = false;
      console.warn = collect;
      console.error = collect;
      const runtime = new BrawlerViewerRuntime(manifest, {
        loadModel: async (url) => {
          const bytes = await bytesFor(url);
          const document = documentFor(bytes);
          if (url === animation[0].url && manifest.assetGroup !== "reference-bridge" && document.animations?.length) {
            const check = validateBrawlAnimationGlb(bytes);
            if (!check.ok) throw new Error(check.reason);
          }
          const gltf = await new GLTFLoader().parseAsync(asArrayBuffer(bytes), "");
          if (manifest.assetGroup === "reference-bridge") {
            const corrections = normalizeReferenceModelRotations(gltf);
            if (corrections.normalizedNodeCount || corrections.normalizedSampleCount) referenceCorrections.set(url, corrections);
          }
          if (url === animation[0].url) hasBodyClip = gltf.animations.length > 0;
          return { scene: gltf.scene, animations: gltf.animations };
        },
        loadTexture: async (url) => { await access(assetPath(url)); return new THREE.Texture(); },
        loadBinary: async (url) => { faceLoads++; return asArrayBuffer(await bytesFor(url)); },
      });
      try {
        await runtime.loadBase();
        await runtime.selectAnimation(key);
        for (const delta of [0, 1 / 60, 0.25, 2]) {
          runtime.update(delta);
          runtime.root.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(runtime.root, true);
          if (![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) throw new Error("Non-finite skinned geometry bounds");
        }
        if (bindingErrors.length) throw new Error(bindingErrors.join("; "));
        results.push({ brawlerId: entry.brawlerId, skin: entry.skinId, animation: key, body: hasBodyClip ? "animated" : "static", face: runtime.getState().faceEnabled });
      } catch (error) {
        fail({ stage: "animation", skin: entry.skinId, animation: key }, error);
      } finally {
        runtime.dispose();
        console.warn = originalWarn;
        console.error = originalError;
      }
    }
    if (skinCount % 10 === 0) console.error(`verification progress: ${skinCount} skins, ${results.length} selections, ${failures.length} failures`);
  }
}
const report = { assetDirectory, indexedBrawlers: index.brawlers.length, selectableSkins: skinCount, assembledSelections: results.length, decodedFaceLoads: faceLoads, peakCachedBytes, failures, warnings: Object.fromEntries(warnings), referenceCorrections: Object.fromEntries(referenceCorrections), selections: results, visualVerification: "required separately; external textures are placeholders" };
if (options.has("--report")) { const output = path.resolve(options.get("--report")); await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`); }
console.error(`verified ${skinCount} skins: ${results.length} assembled selections; ${failures.length} failures`);
console.log(JSON.stringify(options.has("--summary") ? { assetDirectory, selectableSkins: skinCount, assembledSelections: results.length, decodedFaceLoads: faceLoads, failures: failures.length, peakCachedBytes } : report, null, 2));
if (failures.length || !results.length) process.exitCode = 1;
