#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseBrawlerAssetCatalog } from "../src/lib/brawler-asset-catalog.ts";
import { atomicWrite, fetchWithRetry } from "../../../scripts/mv-download-cache.mjs";
import { animationTracks, parseGlb, playbackWindow, sampleTrack } from "./lint-brawl-catalog.mjs";

const ROOT = "/assets/brawlers/3d/";
const DEFAULT_URL = "https://bs.statsconnect.app/assets/brawlers/3d/catalog.json";
const DEFAULT_WORKER = "https://statsconnect-brawl-assets.juanquenga.workers.dev/";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const entries = (catalog) => ["defaults", "releasedSkins", "skins"].flatMap((group) => catalog[group] ?? []);

export const MOTION_SAMPLING = {
  version: 1, samplesPerFrame: 2, componentQuantum: 1e-4, durationQuantum: 1e-4,
  quaternionNormalization: "unit length after interpolation",
  quaternionSign: "largest-magnitude component positive; first component wins ties",
};

// Hash the first clip's local body transforms on the viewer's inclusive,
// clamped playback window. Track storage order, key layout, file metadata,
// absolute start time, clip name, faces and playback speed are not hashed.
// Nearest-grid quantisation suppresses floating noise inside a bin; like any
// fixed grid it cannot equate EVERY pair <1e-4 apart across a bin boundary.
export function canonicalMotion(clip, animation) {
  const fps = Number.isFinite(animation.fps) && animation.fps > 0 ? animation.fps : 60;
  const window = playbackWindow({ fps,
    startFrame: Number.isFinite(animation.startFrame) ? animation.startFrame : 0,
    endFrame: Number.isFinite(animation.endFrame) ? animation.endFrame : -1 }, clip);
  if (window.start > clip.maxTime) throw new Error("animation frame range starts beyond the clip");
  const quantise = (value) => {
    if (!Number.isFinite(value)) throw new Error("non-finite motion sample");
    const result = Math.round(value / MOTION_SAMPLING.componentQuantum);
    if (!Number.isSafeInteger(result)) throw new Error("motion sample exceeds safe quantisation range");
    return result === 0 ? 0 : result;
  };
  const duration = Math.round(window.duration / MOTION_SAMPLING.durationQuantum);
  const steps = Math.ceil(duration * MOTION_SAMPLING.durationQuantum * fps * MOTION_SAMPLING.samplesPerFrame);
  const times = Array.from({ length: steps }, (_, index) => Math.min(index / (fps * MOTION_SAMPLING.samplesPerFrame), window.duration));
  times.push(window.duration);
  const tracks = [...clip.tracks].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { ...MOTION_SAMPLING, fps, duration, tracks: tracks.map((track) => [track.name, track.path, times.map((time) => {
    let values = sampleTrack(track, window.start + time);
    if (track.path === "rotation") {
      const length = Math.hypot(...values);
      if (!length) throw new Error("zero-length animation quaternion");
      // Canonicalise orientation so nearly-unit endpoint keys and the
      // viewer's normalised slerpFlat interiors use the same representation.
      values = values.map((value) => value / length);
      // q and -q describe the same orientation. Canonicalise AFTER rounding
      // so tiny noise in equal-magnitude components cannot change the pivot.
      values = values.map(quantise);
      let pivot = 0;
      for (let index = 1; index < values.length; index++) if (Math.abs(values[index]) > Math.abs(values[pivot])) pivot = index;
      return values[pivot] < 0 ? values.map((value) => value === 0 ? 0 : -value) : values;
    }
    return values.map(quantise);
  })]) };
}

export function motionHash(clip, animation) {
  return clip ? hash(JSON.stringify(canonicalMotion(clip, animation))) : undefined;
}

function decodeHtml(value) {
  return value.replace(/&quot;|&#34;|&#x22;/gi, '"').replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&").replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)));
}

export function referencePage(html) {
  const canvas = html.match(/<canvas\b[^>]*\bid=["']glCanvas["'][^>]*>/i)?.[0];
  if (!canvas) throw new Error("reference page has no #glCanvas");
  const attributes = {};
  for (const match of canvas.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attributes[match[1]] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  const model = attributes["data-model-name"];
  if (!model) throw new Error("reference page has no model");
  const animations = JSON.parse(attributes["data-animations"] || "{}");
  return { model, materialsOverride: attributes["data-materials-file-override"] || null,
    lobbyAtlasName: animations.lobby?.[1] ?? "", fileVersion: attributes["data-file-version"] ?? "" };
}

export function materialDocument(bytes) {
  if (bytes.length >= 20 && bytes.readUInt32LE(0) === 0x46546c67) {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const length = bytes.readUInt32LE(offset);
      if (offset + 8 + length > bytes.length) throw new Error("truncated GLB chunk");
      if (bytes.readUInt32LE(offset + 4) === 0x4e4f534a) return JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString("utf8").trim());
      offset += 8 + length;
    }
    throw new Error("GLB has no JSON chunk");
  }
  return JSON.parse(bytes.toString("utf8"));
}

// Reference sc3d.CTe9BkRj.js: UV selection first checks KHR_texture_transform,
// then COLLADA2GLTF, then ONLY animations.lobby[1] for the atlas-name clause.
// Keep the separate extension/version/model exceptions. The chosen transforms
// are respectively (1/4096,1/4096,0,0), (1,-1,0,1), (2,2,0,0), (1,1,0,0).
export function referenceUvSource(document, { model, fileVersion, lobbyAtlasName }) {
  const extensions = document?.extensionsUsed ?? [];
  if (extensions.includes("KHR_texture_transform")) return "KHR_texture_transform";
  if (document?.asset?.generator === "COLLADA2GLTF") return "COLLADA2GLTF";
  if (String(lobbyAtlasName ?? "").includes("67") || String(lobbyAtlasName ?? "").includes("68")
    || extensions.includes("v") || ["67", "68"].includes(String(fileVersion ?? ""))
    || ["barley_unicornknight_redux_geo.glb", "rico_og_geo.glb", "bull_footbull_redux_geo.glb", "bull_ox_redux_geo.glb"].includes(model)) return "67/68";
  return "default";
}

// Reference r.variables.floats.outlineWidth and floatVectors.outlineColor are
// authored values, not pixels. uber.vert.glsl:75,92-97 normalizes the skinned
// object normal and applies pos += normal * width * (-outlineIngameMul), with
// outlineIngameMul=1 in sc3d.CTe9BkRj.js, BEFORE modelMatrix. Preserve the width
// including its sign. Lines 88-90 ALSO add width*mul to object-space Y when
// hasNormalOutline is true. uber.frag.glsl:158-160 uses vec4(outlineColor.rgb, 1).
// Preserve all four authored channels in the catalog; the reference ignores A.
// JS inherits the default FrontSide. No home-screen-scale conversion.
export function outlineParameters(material) {
  const width = material?.variables?.floats?.outlineWidth;
  const color = material?.variables?.floatVectors?.outlineColor;
  if (!Number.isFinite(width) || !Array.isArray(color) || color.length !== 4
    // Authored colours may exceed 1 (HDR-ish); the reference writes them to a
    // clamped 8-bit target unchanged, so keep raw non-negative values.
    || !color.every((value) => Number.isFinite(value) && value >= 0)) return null;
  return { width, color: [...color] };
}

export function outputRelative(url) {
  const pathname = new URL(url, DEFAULT_URL).pathname;
  if (!pathname.startsWith(ROOT)) throw new Error(`asset outside catalog root: ${url}`);
  const relative = pathname.slice(ROOT.length);
  if (!relative || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`invalid asset path: ${url}`);
  return relative;
}

export async function mapConcurrent(items, concurrency, visit) {
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < items.length) { const index = next++; await visit(items[index], index); }
  }));
}

export function createDownloads({ directory, diagnosticDir, workerOrigin, concurrency = 8, fetchImpl = fetch }) {
  const pending = new Map();
  const referenceGate = { nextRequestAt: 0 };
  const workerGate = { nextRequestAt: 0 };
  // All reference requests, including material documents, share this serial
  // chain. Response bodies finish before the next request starts; retries also
  // use the >=250ms gate and honour Retry-After in fetchWithRetry.
  let referenceQueue = Promise.resolve();
  let activeWorkerRequests = 0;
  const waitingWorkers = [];
  const acquireWorker = () => new Promise((resolve) => {
    if (activeWorkerRequests < concurrency) { activeWorkerRequests++; resolve(); }
    else waitingWorkers.push(resolve);
  });
  const releaseWorker = () => {
    if (waitingWorkers.length) waitingWorkers.shift()();
    else activeWorkerRequests--;
  };
  const get = (url, { reference = false, diagnosticFile = null, fresh = false } = {}) => {
    if (pending.has(url)) return pending.get(url);
    const capture = async () => {
      const file = path.join(directory, reference ? "reference" : "worker", `${hash(url)}.bin`);
      if (!fresh) try { return await readFile(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (!fresh && diagnosticFile) {
        try {
          const bytes = await readFile(diagnosticFile);
          await atomicWrite(file, bytes);
          return bytes;
        } catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      if (!reference) await acquireWorker();
      let response;
      try { response = await fetchWithRetry(fetchImpl, url, {
        headers: reference ? { "User-Agent": "Mozilla/5.0", Origin: "https://mv.brawlstars.top", Referer: "https://mv.brawlstars.top/" } : {},
        maxRetries: 4, retryDelayMs: 1000, requestDelayMs: reference ? 250 : 0,
        requestTimeoutMs: 60000, requestGate: reference ? referenceGate : workerGate,
      }); } finally { if (!reference) releaseWorker(); }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      await atomicWrite(file, bytes);
      return bytes;
    };
    const result = reference ? referenceQueue.then(capture) : capture();
    if (reference) referenceQueue = result.catch(() => {});
    pending.set(url, result);
    return result;
  };
  return {
    get,
    worker: (assetUrl) => {
      const relative = outputRelative(assetUrl);
      return get(new URL(relative, workerOrigin).href, {
        diagnosticFile: path.join(diagnosticDir, "glb", relative.replaceAll("/", "__")),
      });
    },
  };
}

function pageUrl(entry) {
  if (!entry.displayName) throw new Error("skin has no displayName for reference route");
  const route = entry.displayName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
  return `https://mv.brawlstars.top/skins/${encodeURIComponent(route)}`;
}

function sourceModelUrl(model, cdnOrigin) {
  const file = model.split(":", 1)[0].replace(/\.scw$/i, ".glb");
  return new URL(file.startsWith("sc3d/") ? file : `sc3d/${file}`, cdnOrigin).href;
}

export function enrichSlots(entry, page, geometry, overrides, changes) {
  const uvSource = referenceUvSource(geometry, page);
  const skin = { brawlerId: entry.brawlerId, skinId: entry.skinId, displayName: entry.displayName };
  for (const slot of entry.materialSlots ?? []) {
    // Only the default/67 decision is under repair; the two higher-precedence
    // UV sources and pinned-local catalogs retain their own provenance.
    if (["default", "67/68"].includes(slot.uvSource) && slot.uvSource !== uvSource) {
      changes.uvSourceCorrections.push({ ...skin, materialName: slot.materialName, from: slot.uvSource, to: uvSource, lobbyAtlasName: page.lobbyAtlasName });
      slot.uvSource = uvSource;
    }
    if (slot.scBooleans?.enableNormalOutline !== true) continue;
    // The reference override is matched by material NAME, with geometry
    // fallback when the override document does not contain that name.
    const material = overrides?.materials?.find((value) => value.name === slot.materialName)
      ?? geometry.materials?.find((value) => value.name === slot.materialName);
    const outline = outlineParameters(material);
    if (outline) {
      slot.outline = outline;
      changes.outlineSlotsEnriched.push({ ...skin, materialName: slot.materialName, outline });
    } else {
      const rawWidth = material?.variables?.floats?.outlineWidth;
      const rawColor = material?.variables?.floatVectors?.outlineColor;
      const outsideContract = Array.isArray(rawColor) && rawColor.some((value) => typeof value === "number" && (value < 0 || value > 1));
      changes.missingOutlineParams.push({ ...skin, materialName: slot.materialName,
        reason: outsideContract ? "authored outlineColor exceeds the required 0..1 contract; retained raw values here without clamping" : "material missing or invalid outlineWidth/outlineColor",
        sourceOutline: { width: rawWidth ?? null, color: rawColor ?? null } });
    }
  }
}

export async function enrichCatalog({ catalogUrl = DEFAULT_URL, workerOrigin = DEFAULT_WORKER,
  cdnOrigin = "https://cdn.brawlbox.com.cn/", workDir = "/tmp/brawl-audit/enrich",
  diagnosticDir = "/tmp/brawl-diag/data", concurrency = 8, refreshCatalog = false, animationsOnly = false, fetchImpl = fetch } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error("concurrency must be 1..8");
  const downloads = createDownloads({ directory: path.join(workDir, "cache"), diagnosticDir, workerOrigin, concurrency, fetchImpl });
  const indexBytes = await downloads.get(catalogUrl, { fresh: refreshCatalog });
  const index = JSON.parse(indexBytes);
  if (index.schemaVersion !== 1 || index.kind !== "index" || !Array.isArray(index.brawlers)) throw new Error("expected published catalog index");
  const shards = [];
  await mapConcurrent(index.brawlers, concurrency, async (item) => {
    const relative = outputRelative(item.shard);
    const bytes = await downloads.get(new URL(item.shard, catalogUrl).href, { fresh: refreshCatalog, diagnosticFile: path.join(diagnosticDir, "shards", path.basename(relative)) });
    shards.push({ relative, catalog: JSON.parse(bytes) });
  });
  shards.sort((a, b) => a.relative.localeCompare(b.relative));
  const allEntries = shards.flatMap(({ catalog }) => entries(catalog));
  const changes = { schemaVersion: 1, catalogUrl, workerOrigin, refreshCatalog, animationsOnly, motionSampling: MOTION_SAMPLING, outlineSlotsEnriched: [], missingOutlineParams: [], hashesAdded: [], motionHashesAdded: [], duplicateMotionGroups: [], cliplessEntries: [], motionFailures: [], uvSourceCorrections: [], skippedSkins: [], hashFailures: [] };
  const animations = allEntries.flatMap((entry) => Object.entries(entry.animations ?? {}).filter(([, value]) => value.exported?.kind === "ready").map(([key, animation]) => ({ entry, key, animation })));
  const distinctUrls = [...new Set(animations.map(({ animation }) => animation.exported.url))];
  const hashes = new Map();
  const clips = new Map();
  // Start hashing while the serial reference page enrichment runs. The same
  // download cache coalesces repeated URLs, including geometry/animation reuse.
  let hashed = 0;
  const hashing = mapConcurrent(distinctUrls, concurrency, async (url) => {
    try {
      const bytes = await downloads.worker(url);
      hashes.set(url, hash(bytes));
      try { clips.set(url, animationTracks(parseGlb(bytes))); }
      catch (error) { changes.motionFailures.push({ url, reason: error.message }); }
    }
    catch (error) { changes.hashFailures.push({ url, reason: error.message }); }
    if (++hashed % 100 === 0) console.log(`animation GLBs ${hashed}/${distinctUrls.length}`);
  });
  let selected = 0;
  for (const entry of allEntries) {
    if (animationsOnly) continue;
    const slots = entry.materialSlots ?? [];
    const outlineSlots = slots.filter((slot) => slot.scBooleans?.enableNormalOutline === true);
    const reference = entry.assetGroup === "reference-bridge";
    if (!outlineSlots.length && !(reference && slots.some((slot) => slot.uvSource === "67/68"))) continue;
    try {
      const url = pageUrl(entry);
      const route = decodeURIComponent(new URL(url).pathname.slice("/skins/".length));
      const diagnosticFile = path.join(diagnosticDir, "mv", `skins_${route.replace(/[^a-zA-Z0-9_]/g, "_")}.html`);
      const page = referencePage((await downloads.get(url, { reference: true, diagnosticFile })).toString("utf8"));
      // Bridge geometry is a byte-for-byte copy of the reference GLB. Reading
      // our exported bytes preserves generator/extensions without extra CDN
      // requests. Material overrides still come from the page-selected source.
      const geometry = entry.baseModel?.kind === "ready" ? materialDocument(await downloads.worker(entry.baseModel.url))
        : materialDocument(await downloads.get(sourceModelUrl(page.model, cdnOrigin), { reference: true }));
      const overrides = outlineSlots.length && page.materialsOverride
        ? materialDocument(await downloads.get(sourceModelUrl(page.materialsOverride, cdnOrigin), { reference: true })) : null;
      enrichSlots(entry, page, geometry, overrides, changes);
    } catch (error) {
      const skin = { brawlerId: entry.brawlerId, skinId: entry.skinId, displayName: entry.displayName, reason: error.message };
      changes.skippedSkins.push(skin);
      for (const slot of outlineSlots) changes.missingOutlineParams.push({ ...skin, materialName: slot.materialName });
    }
    if (++selected % 10 === 0) console.log(`reference skins ${selected}`);
  }
  await hashing;
  const motionHashes = new Map();
  let sampled = 0;
  for (const { entry, key, animation } of animations) {
    const contentHash = hashes.get(animation.exported.url);
    if (!contentHash) continue;
    if (animation.contentHash !== contentHash) changes.hashesAdded.push({ brawlerId: entry.brawlerId, skinId: entry.skinId, animation: key, url: animation.exported.url, contentHash });
    animation.contentHash = contentHash;
    const skin = { brawlerId: entry.brawlerId, skinId: entry.skinId, animation: key, url: animation.exported.url };
    if (!clips.has(animation.exported.url)) continue;
    const clip = clips.get(animation.exported.url);
    if (!clip) {
      animation.hasClip = false;
      delete animation.motionHash;
      changes.cliplessEntries.push(skin);
      continue;
    }
    delete animation.hasClip;
    try {
      const fps = Number.isFinite(animation.fps) && animation.fps > 0 ? animation.fps : 60;
      const window = playbackWindow({ fps,
        startFrame: Number.isFinite(animation.startFrame) ? animation.startFrame : 0,
        endFrame: Number.isFinite(animation.endFrame) ? animation.endFrame : -1 }, clip);
      const cacheKey = JSON.stringify([animation.exported.url, fps, window.start, window.duration]);
      if (!motionHashes.has(cacheKey)) motionHashes.set(cacheKey, motionHash(clip, animation));
      const digest = motionHashes.get(cacheKey);
      if (animation.motionHash !== digest) changes.motionHashesAdded.push({ ...skin, motionHash: digest });
      animation.motionHash = digest;
    } catch (error) {
      delete animation.motionHash;
      changes.motionFailures.push({ ...skin, reason: error.message });
    }
    if (++sampled % 500 === 0) console.log(`animation windows ${sampled}/${animations.length}; unique sampled windows ${motionHashes.size}`);
  }
  // Defaults can repeat released-skin records. Count groups once per skin,
  // including short/non-menu windows, and list their exact animation keys.
  const bySkin = new Map();
  for (const { entry, key, animation } of animations) {
    if (!animation.motionHash) continue;
    const id = `${entry.brawlerId}:${entry.skinId}`;
    if (!bySkin.has(id)) bySkin.set(id, { entry, motions: new Map() });
    const motions = bySkin.get(id).motions;
    if (!motions.has(animation.motionHash)) motions.set(animation.motionHash, new Set());
    motions.get(animation.motionHash).add(key);
  }
  for (const { entry, motions } of bySkin.values()) for (const [digest, keys] of motions) {
    if (keys.size > 1) changes.duplicateMotionGroups.push({ brawlerId: entry.brawlerId, skinId: entry.skinId, displayName: entry.displayName, motionHash: digest, animations: [...keys].sort() });
  }
  changes.duplicateMotionCountsPerSkin = [...bySkin.values()].map(({ entry, motions }) => ({
    brawlerId: entry.brawlerId, skinId: entry.skinId, displayName: entry.displayName,
    groups: [...motions.values()].filter((keys) => keys.size > 1).length,
  })).filter((item) => item.groups > 0);
  const out = path.join(workDir, "out");
  for (const { relative, catalog } of shards) {
    parseBrawlerAssetCatalog(catalog);
    await atomicWrite(path.join(out, relative), `${JSON.stringify(catalog, null, 2)}\n`);
    // Validate the serialized artifact via Node 24's native type stripping.
    parseBrawlerAssetCatalog(JSON.parse(await readFile(path.join(out, relative), "utf8")));
  }
  await atomicWrite(path.join(out, "catalog.json"), indexBytes);
  changes.counts = { shards: shards.length, skinRecords: allEntries.length,
    uniqueSkins: new Set(allEntries.map((entry) => `${entry.brawlerId}:${entry.skinId}`)).size,
    referenceSkinsFetchedOrCached: selected, outlineSlotsEnriched: changes.outlineSlotsEnriched.length,
    missingOutlineParams: changes.missingOutlineParams.length, hashesAdded: changes.hashesAdded.length,
    distinctAnimationGlbsHashed: hashes.size, uvSourceCorrections: changes.uvSourceCorrections.length,
    motionHashAdded: changes.motionHashesAdded.length,
    motionHashEntries: animations.filter(({ animation }) => animation.motionHash).length,
    distinctMotions: new Set(animations.map(({ animation }) => animation.motionHash).filter(Boolean)).size,
    duplicateMotionGroups: changes.duplicateMotionGroups.length,
    skinsWithDuplicateMotions: new Set(changes.duplicateMotionGroups.map((item) => `${item.brawlerId}:${item.skinId}`)).size,
    cliplessEntries: changes.cliplessEntries.length,
    distinctCliplessGlbs: new Set(changes.cliplessEntries.map((item) => item.url)).size,
    motionFailures: changes.motionFailures.length,
    uvSkinsCorrected: new Set(changes.uvSourceCorrections.map((item) => `${item.brawlerId}:${item.skinId}`)).size,
    skippedSkins: changes.skippedSkins.length, hashFailures: changes.hashFailures.length };
  await atomicWrite(path.join(workDir, "changes.json"), `${JSON.stringify(changes, null, 2)}\n`);
  const markdown = ["# Catalog enrichment changes", "", ...Object.entries(changes.counts).map(([key, value]) => `- ${key}: ${value}`), "", "## UV corrections", "",
    ...changes.uvSourceCorrections.map((item) => `- ${item.displayName} (${item.skinId}), ${item.materialName}: ${item.from} -> ${item.to}; lobby atlas ${JSON.stringify(item.lobbyAtlasName)}`), "", "## Missing outline params", "",
    ...changes.missingOutlineParams.map((item) => `- ${item.displayName}, ${item.materialName}: ${item.reason}${item.sourceOutline ? `; raw ${JSON.stringify(item.sourceOutline)}` : ""}`), "", "## Skipped skins", "",
    ...changes.skippedSkins.map((item) => `- ${item.displayName} (${item.skinId}): ${item.reason}`), "", "## Hash failures", "",
    ...changes.hashFailures.map((item) => `- ${item.url}: ${item.reason}`), "", "## Motion sampling", "",
    "First clip only; viewer-clamped inclusive playback window. Sample every half frame at entry fps, plus the exact endpoint. LINEAR rotations use the viewer's slerpFlat interpolator. Translation/scale components and unit-normalised quaternion components are quantised with Math.round(value / 1e-4), with negative zero replaced by zero. Quaternion sign: largest absolute quantised component positive, first wins ties. Duration is Math.round(seconds / 1e-4); sample count is derived from that duration. SHA-256 covers canonical JSON with sorted joint name/path tracks, fps, duration, sampling version and quantised samples. Speed and face tracks are excluded. Grid boundaries can separate values less than 1e-4 apart; finite samples cannot prove equality between sample points.", "", "## Duplicate motion groups per skin", "",
    ...changes.duplicateMotionCountsPerSkin.map((item) => `- ${item.displayName} (${item.skinId}): ${item.groups} groups`), "", "### Group members", "",
    ...changes.duplicateMotionGroups.map((item) => `- ${item.displayName} (${item.skinId}): ${item.animations.join(" = ")}; ${item.motionHash}`), "", "## Clipless entries", "",
    ...changes.cliplessEntries.map((item) => `- ${item.skinId}: ${item.animation}; ${item.url}`), "", "## Motion failures", "",
    ...changes.motionFailures.map((item) => `- ${item.url}: ${item.reason}`), "", "All output shards were read back and passed parseBrawlerAssetCatalog via Node type stripping.", ""];
  await atomicWrite(path.join(workDir, "CHANGES.md"), markdown.join("\n"));
  console.log(JSON.stringify(changes.counts, null, 2));
  return changes;
}

async function main() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index++) {
    const key = process.argv[index];
    if (!key.startsWith("--") || !process.argv[index + 1]) throw new Error(`expected --option value: ${key}`);
    args.set(key.slice(2), process.argv[++index]);
  }
  const changes = await enrichCatalog({ catalogUrl: args.get("catalog-url"), workerOrigin: args.get("worker-origin"),
    cdnOrigin: args.get("cdn-origin"), workDir: args.get("work-dir"), diagnosticDir: args.get("diagnostic-dir"),
    refreshCatalog: args.get("refresh-catalog") === "true", animationsOnly: args.get("animations-only") === "true",
    concurrency: args.has("concurrency") ? Number(args.get("concurrency")) : 8 });
  if (changes.counts.skippedSkins || changes.counts.missingOutlineParams || changes.counts.hashFailures || changes.counts.motionFailures) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error); process.exitCode = 1; });
