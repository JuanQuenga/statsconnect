#!/usr/bin/env node
// CPU verification of the delivered catalog, geometry, rigs, and face binaries.
// External textures are placeholders: use the hero page for GPU/visual QA.
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BrawlerViewerRuntime, normalizeReferenceModelRotations } from "../src/lib/brawler-viewer-runtime.ts";
import { parseBrawlerAssetCatalog, selectCatalogViewerEntry, catalogEntryToViewerManifest } from "../src/lib/brawler-asset-catalog.ts";
import { validateGeometryGlb } from "../../../scripts/materialize-brawl-assets.mjs";
import { validateBrawlAnimationGlb } from "../../../scripts/validate-brawl-animation.mjs";

const assetDirectory = path.resolve(process.argv[2] ?? fileURLToPath(new URL("../../../.generated/brawl-3d", import.meta.url)));
const failures = [];
const warnings = new Map();
const files = new Map();
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
  if (!files.has(url)) files.set(url, await readFile(assetPath(url)));
  return files.get(url);
}
async function inspectReferences(value) {
  if (!value || typeof value !== "object") return;
  if (value.kind === "ready" && typeof value.url === "string") await access(assetPath(value.url));
  for (const child of Object.values(value)) await inspectReferences(child);
}
function documentFor(bytes) {
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "glTF") throw new Error("Invalid GLB header");
  const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
  if (document.images?.length || document.textures?.length || document.buffers?.some((buffer) => buffer.uri)) {
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
  const raw = JSON.parse(await readFile(assetPath(row.shard), "utf8"));
  await inspectReferences(raw);
  const entries = selectCatalogViewerEntry(parseBrawlerAssetCatalog(raw), row.brawlerId).entries;
  for (const entry of entries) {
    const manifest = catalogEntryToViewerManifest(entry);
    if (!manifest) throw new Error(`Selected skin has no runtime: ${entry.skinId}`);
    skinCount++;
    const geometry = validateGeometryGlb(await bytesFor(manifest.baseModel.url));
    if (!geometry.ok) {
      failures.push({ skin: entry.skinId, reason: geometry.reason });
      continue;
    }
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
        failures.push({ skin: entry.skinId, animation: key, reason: String(error) });
      } finally {
        runtime.dispose();
        console.warn = originalWarn;
        console.error = originalError;
      }
    }
  }
}
console.log(JSON.stringify({ assetDirectory, indexedBrawlers: index.brawlers.length, selectableSkins: skinCount, assembledSelections: results.length, decodedFaceLoads: faceLoads, failures, warnings: Object.fromEntries(warnings), referenceCorrections: Object.fromEntries(referenceCorrections), selections: results, visualVerification: "required separately; external textures are placeholders" }, null, 2));
if (failures.length || !results.length) process.exitCode = 1;
