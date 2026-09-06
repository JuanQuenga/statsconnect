#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildReferenceBridge } from "./build-reference-asset-bridge.mjs";

const DEFAULT_INVENTORY_URL = "https://mv.brawlstars.top/en/";
const DEFAULT_CDN_ORIGIN = "https://cdn.brawlbox.com.cn";
const DEFAULT_SOURCE_KIND = "reference-preprocessed";
const PAGE_ROUTE_PREFIX = "/skins/";
const PAGE_ASSET_KEYS = ["data-model-name", "data-animations", "data-diffuse-texture-override", "data-specular-texture-override", "data-materials-file-override", "data-face-covers-whole-texture", "data-face-scaled-up-texture", "data-home-screen-scale", "data-outline-shader", "data-file-version"];
const DEFAULT_REFERENCE_HEADERS = Object.freeze({
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  Origin: "https://mv.brawlstars.top",
  Referer: "https://mv.brawlstars.top/",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "cross-site",
});

function parseArgs(argv) {
  const values = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=", 2);
    const next = argv[index + 1];
    values.set(key, inline ?? (next && !next.startsWith("--") ? argv[++index] : true));
  }
  return values;
}

function decodeHtml(value) {
  return value
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function parseAttributes(tag) {
  const attributes = {};
  const pattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(tag)) !== null) {
    const [, key, doubleQuoted, singleQuoted, bare] = match;
    if (key.toLowerCase() === "canvas") continue;
    attributes[key] = decodeHtml(doubleQuoted ?? singleQuoted ?? bare ?? "");
  }
  return attributes;
}

function extractAttributeTag(html, selector) {
  const expression = new RegExp(`<[^>]*${selector}[^>]*>`, "i");
  const match = html.match(expression);
  return match ? parseAttributes(match[0]) : null;
}

function parseCatalogEntries(html) {
  const tag = extractAttributeTag(html, "id=[\"']search-data[\"']");
  if (!tag?.["data-entries"]) throw new Error("English inventory is missing #search-data data-entries");
  const parsed = JSON.parse(tag["data-entries"]);
  if (!Array.isArray(parsed)) throw new Error("English inventory data-entries is not an array");
  return parsed
    .filter((entry) => Array.isArray(entry) && entry.length >= 4 && entry[0] === true && typeof entry[3] === "string")
    .map((entry) => ({ displayName: entry[3], rarity: typeof entry[1] === "string" ? entry[1] : null }));
}

function routeSlug(displayName) {
  return displayName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
}

function pageAttributes(html) {
  const canvas = html.match(/<canvas\b[^>]*\bid=["']glCanvas["'][^>]*>/i);
  if (!canvas) throw new Error("skin page is missing #glCanvas");
  const attributes = parseAttributes(canvas[0]);
  for (const key of PAGE_ASSET_KEYS) if (!(key in attributes) && key !== "data-materials-file-override") attributes[key] = "";
  if (typeof attributes["data-model-name"] !== "string" || !attributes["data-model-name"]) throw new Error("skin page is missing data-model-name");
  const animationText = attributes["data-animations"];
  const animations = animationText ? JSON.parse(animationText) : {};
  if (!animations || typeof animations !== "object" || Array.isArray(animations)) throw new Error("skin page has invalid data-animations");
  return { attributes, animations };
}

function truthyDatasetValue(value) {
  // The reference viewer reads dataset values directly. Empty attributes are
  // therefore false (`data-face-scaled-up-texture` is not the same as `="true"`).
  return value === "true";
}

function referenceAnimationTiming(fileName, declaredStart, declaredEnd) {
  const parsedStart = Number.parseInt(String(declaredStart ?? ""), 10);
  const parsedEnd = Number.parseInt(String(declaredEnd ?? ""), 10);
  return {
    // The reference viewer selects 120fps only for the explicitly suffixed
    // exports; all other body clips use the 30fps timeline.
    fps: typeof fileName === "string" && fileName.includes("_120") ? 120 : 30,
    // Page metadata is one-based and reserves the final two frames. Match
    // the viewer's normalized window before it reaches the runtime manifest.
    startFrame: Number.isFinite(parsedStart) ? Math.max(parsedStart - 1, 0) : 0,
    endFrame: Number.isFinite(parsedEnd) ? parsedEnd - 2 : -1,
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(response) {
  const value = response.headers?.get?.("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

async function fetchWithRetry(fetchImpl, url, { headers, maxRetries, retryDelayMs, requestDelayMs, requestGate }) {
  for (let attempt = 0; ; attempt += 1) {
    const waitUntil = requestGate.nextRequestAt - Date.now();
    if (waitUntil > 0) await sleep(waitUntil);
    const response = await fetchImpl(url, { headers });
    requestGate.nextRequestAt = Date.now() + requestDelayMs;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= maxRetries) return response;
    await sleep(Math.max(retryDelayMs * (2 ** attempt), retryAfterMilliseconds(response)));
  }
}

function sourceUrl(cdnOrigin, value, kind) {
  if (typeof value !== "string" || !value) return null;
  let relative = value;
  if (kind === "faceAtlas") relative = `faces/${value}.png`;
  else if (kind === "face") relative = `faces/${value}`;
  else {
    if (!(relative.startsWith("sc3d/") || relative.startsWith("faces/"))) relative = `sc3d/${relative}`;
    relative = relative.replace(/\.sctx$/i, ".png").replace(/\.scw$/i, ".glb").replace(/\.ktx$/i, ".png").replace(/\.pvr$/i, ".png");
  }
  if (kind === "outlineVertex") relative = "uber.vert.glsl";
  if (kind === "outlineFragment") relative = "uber.frag.glsl";
  return new URL(relative, `${cdnOrigin.replace(/\/$/, "")}/`).toString();
}

function safeSegment(value, fallback = "asset") {
  const segment = String(value ?? "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return segment || fallback;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  if (row.length) { row.push(cell); rows.push(row); }
  const [header, , ...data] = rows;
  if (!header?.length) throw new Error("CSV has no header");
  return data.filter((candidate) => candidate.some(Boolean)).map((candidate, rowIndex) => ({ rowIndex, ...Object.fromEntries(header.map((key, index) => [key, candidate[index] ?? ""])) }));
}

function stableCharacterId(rows, character) {
  const names = String(character ?? "").split(";").map((name) => name.trim().toLowerCase()).filter(Boolean);
  const row = rows.find((candidate) => names.some((name) => String(candidate.Name ?? "").split(";").map((value) => value.trim().toLowerCase()).includes(name)));
  return row ? 16000000 + row.rowIndex : null;
}

function packageMatch({ model, diffuse, skins, confs, characters }) {
  const modelCandidates = confs.filter((conf) => String(conf.Model ?? "").split(":", 1)[0] === model);
  const exact = modelCandidates.filter((conf) => {
    const skin = skins.find((candidate) => candidate.Conf === conf.Name);
    return !diffuse || skin?.DiffuseTexture === diffuse;
  });
  const conf = exact[0] ?? modelCandidates[0] ?? null;
  const skin = conf ? skins.find((candidate) => candidate.Conf === conf.Name) ?? null : null;
  const character = conf?.Character ?? null;
  return { conf, skin, character, brawlerId: stableCharacterId(characters, character) };
}

function faceSymbols(animations) {
  const symbols = { face: null, happy: null, sad: null };
  for (const [key, value] of Object.entries(animations)) {
    if (!Array.isArray(value) || typeof value[2] !== "string" || !value[2]) continue;
    if (key === "lobby" || key === "happy") symbols.happy ??= value[2];
    else if (key === "lose" || key === "sad") symbols.sad ??= value[2];
    else symbols.face ??= value[2];
  }
  return symbols;
}

function sourceAsset(url, role, metadata = {}) {
  return { url, role, metadata };
}

function parseMaterialDocument(bytes) {
  if (bytes.length >= 20 && bytes.readUInt32LE(0) === 0x46546c67) {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const length = bytes.readUInt32LE(offset);
      const type = bytes.readUInt32LE(offset + 4);
      const chunk = bytes.subarray(offset + 8, offset + 8 + length);
      if (type === 0x4e4f534a) return JSON.parse(chunk.toString("utf8").trim());
      offset += 8 + length;
    }
    throw new Error("GLB is missing its JSON chunk");
  }
  return JSON.parse(bytes.toString("utf8"));
}

function materialTextureValue(value) {
  if (typeof value !== "string" || !value) return null;
  const texture = value.split("#", 1)[0] || null;
  return texture === "." ? null : texture;
}

function geometryUvSource(document, { model, fileVersion, faceNames = [] }) {
  const extensions = Array.isArray(document?.extensionsUsed) ? document.extensionsUsed : [];
  if (extensions.includes("KHR_texture_transform")) return "KHR_texture_transform";
  if (document?.asset?.generator === "COLLADA2GLTF") return "COLLADA2GLTF";
  if (faceNames.some((name) => name.includes("67") || name.includes("68")) || extensions.includes("v") || ["67", "68"].includes(String(fileVersion ?? "")) || ["barley_unicornknight_redux_geo.glb", "rico_og_geo.glb", "bull_footbull_redux_geo.glb", "bull_ox_redux_geo.glb"].includes(model)) return "67/68";
  return "default";
}

function normalizeMaterialTexture(value, field) {
  let texture = materialTextureValue(value);
  if (!texture && field === "specularLightmap") texture = "menu_specular_lightmap.png";
  if (!texture) return null;
  if (field !== "diffuseLightmap" && field !== "specularLightmap") return texture;
  const fileName = texture.replace(/^sc3d\//i, "");
  return fileName.startsWith("menu_") ? fileName : `menu_${fileName}`;
}

function materialSlotDefinitions(document, { cdnOrigin, assets, uvSource = "default" }) {
  const materials = Array.isArray(document?.materials) ? document.materials : [];
  const hasAnyStencil = materials.some((material) => Array.isArray(material?.constants) && material.constants.includes("STENCIL"));
  const used = new Set();
  for (const mesh of Array.isArray(document?.meshes) ? document.meshes : []) {
    for (const primitive of Array.isArray(mesh?.primitives) ? mesh.primitives : []) {
      if (Number.isInteger(primitive?.material) && primitive.material >= 0 && primitive.material < materials.length) used.add(primitive.material);
      else if (primitive?.material === undefined && materials.length > 0) used.add(0);
    }
  }
  const slots = [];
  const referencedAssets = {};
  const assetKeyFor = (materialName, field, value) => {
    const rawTexture = typeof value === "string" ? value.split("#", 1)[0] : null;
    if (rawTexture === ".") {
      if (field === "diffuseTexture" && assets.texture?.url) return "texture";
      if (field === "specularTexture" && assets.specularTexture?.url) return "specularTexture";
      return null;
    }
    const texture = normalizeMaterialTexture(value, field);
    if (!texture) return null;
    const url = sourceUrl(cdnOrigin, texture, "materialReference");
    if (!url) return null;
    if (url === assets.texture?.url) return "texture";
    if (url === assets.specularTexture?.url) return "specularTexture";
    const name = safeSegment(`${materialName}-${field}`, "material");
    referencedAssets[name] ??= sourceAsset(url, `material:${name}`, { materialName, field });
    return `material:${name}`;
  };
  for (const index of [...used].sort((left, right) => left - right)) {
    const material = materials[index];
    if (!material || typeof material !== "object") continue;
    const materialName = typeof material.name === "string" && material.name ? material.name : `material_${index}`;
    const constants = Array.isArray(material.constants) ? material.constants.filter((value) => typeof value === "string") : [];
    const variables = material.variables && typeof material.variables === "object" ? material.variables : {};
    const textures = variables.textures && typeof variables.textures === "object" ? variables.textures : {};
    const booleans = variables.booleans && typeof variables.booleans === "object" ? variables.booleans : {};
    const floatValues = variables.floats && typeof variables.floats === "object" ? variables.floats : {};
    const stencilDefine = !hasAnyStencil || constants.includes("STENCIL");
    const slot = {
      materialName,
      diffuse: constants.includes("DIFFUSE"),
      ambient: constants.includes("AMBIENT"),
      lightmapDiffuse: constants.includes("LIGHTMAP"),
      specular: constants.includes("SPECULAR"),
      opacity: typeof floatValues.opacity === "number" ? floatValues.opacity : undefined,
      stencil: stencilDefine && Boolean(assets.faceAtlas),
      sc3d_material_stencil: stencilDefine,
      uvSource,
      stencilUvPolicy: "flip-y",
      diffuseTexture: constants.includes("DIFFUSE") ? assetKeyFor(materialName, "diffuseTexture", textures.diffuseTex2D) : null,
      specularTexture: constants.includes("SPECULAR") ? assetKeyFor(materialName, "specularTexture", textures.specularTex2D) : null,
      diffuseLightmap: constants.includes("LIGHTMAP") ? assetKeyFor(materialName, "diffuseLightmap", textures.lightmapTex2D) : null,
      specularLightmap: constants.includes("LIGHTMAP") ? assetKeyFor(materialName, "specularLightmap", textures.lightmapSpecularTex2D) : null,
      stencilTexture: stencilDefine ? assetKeyFor(materialName, "stencilTexture", textures.stencilTex2D) : null,
      emissionTexture: constants.includes("EMISSION") ? assetKeyFor(materialName, "emissionTexture", textures.emissionTex2D) : null,
      colorizeTexture: constants.includes("COLORIZE") ? assetKeyFor(materialName, "colorizeTexture", textures.colorizeTex2D) : null,
      scConstants: constants,
      scBooleans: Object.fromEntries(Object.entries(booleans).filter(([, value]) => typeof value === "boolean")),
      shader: typeof material.shader === "string" ? material.shader : undefined,
    };
    slots.push(Object.fromEntries(Object.entries(slot).filter(([, value]) => value !== undefined && value !== null)));
  }
  return { slots, referencedAssets };
}

function pageToInventoryEntry({ html, route, displayName, cdnOrigin, characters, skins, confs }) {
  const page = pageAttributes(html);
  const attrs = page.attributes;
  const model = attrs["data-model-name"];
  const diffuse = attrs["data-diffuse-texture-override"] || null;
  const specular = attrs["data-specular-texture-override"] || diffuse;
  const match = packageMatch({ model, diffuse, skins, confs, characters });
  const skinId = match.skin?.Name ?? match.conf?.Name ?? `Reference-${safeSegment(route)}`;
  const character = match.character ?? "Unknown";
  const assetSetId = `mv.brawlstars.top:${safeSegment(route, "skin")}`;
  const assets = {
    geometry: sourceAsset(sourceUrl(cdnOrigin, model, "model"), "geometry"),
    texture: sourceAsset(sourceUrl(cdnOrigin, diffuse, "texture"), "texture"),
    specularTexture: sourceAsset(sourceUrl(cdnOrigin, specular, "texture"), "specularTexture"),
    materials: {},
    animations: {},
    faces: {},
  };
  const materialsOverride = attrs["data-materials-file-override"] || null;
  if (materialsOverride) assets.materialSource = sourceAsset(sourceUrl(cdnOrigin, materialsOverride, "materialsSource"), "materialsSource");
  const atlasNames = [...new Set(Object.values(page.animations).filter((value) => Array.isArray(value) && typeof value[1] === "string" && value[1]).map((value) => value[1]))];
  if (atlasNames.length > 1) throw new Error("multiple face atlases require per-face atlas support");
  if (atlasNames[0]) assets.faceAtlas = sourceAsset(sourceUrl(cdnOrigin, atlasNames[0], "faceAtlas"), "faceAtlas");
  const symbols = faceSymbols(page.animations);
  if (symbols.face) assets.face = sourceAsset(sourceUrl(cdnOrigin, symbols.face, "face"), "face");
  if (symbols.happy) assets.faces.happy = sourceAsset(sourceUrl(cdnOrigin, symbols.happy, "face"), "face:happy");
  if (symbols.sad) assets.faces.sad = sourceAsset(sourceUrl(cdnOrigin, symbols.sad, "face"), "face:sad");
  const animationMetadata = {};
  for (const [key, value] of Object.entries(page.animations)) {
    if (!Array.isArray(value) || typeof value[0] !== "string" || !value[0]) continue;
    const faceExport = typeof value[2] === "string" && value[2] ? value[2] : null;
    const face = !faceExport ? null : faceExport === symbols.happy ? "happy" : faceExport === symbols.sad ? "sad" : faceExport === symbols.face ? "face" : faceExport;
    if (face && !["face", "happy", "sad"].includes(face)) assets.faces[face] = sourceAsset(sourceUrl(cdnOrigin, faceExport, "face"), `face:${face}`);
    const timing = referenceAnimationTiming(value[0], value[3], value[4]);
    assets.animations[key] = sourceAsset(sourceUrl(cdnOrigin, value[0], "animation"), `animation:${key}`, { label: value[5] ?? key, ...timing, face });
    animationMetadata[key] = { label: value[5] ?? key, ...timing, face };
  }
  if (truthyDatasetValue(attrs["data-outline-shader"])) {
    assets.materials.outline_vertex_shader = sourceAsset(sourceUrl(cdnOrigin, "uber.vert.glsl", "outlineVertex"), "material:outline_vertex_shader");
    assets.materials.outline_fragment_shader = sourceAsset(sourceUrl(cdnOrigin, "uber.frag.glsl", "outlineFragment"), "material:outline_fragment_shader");
  }
  const pageHash = createHash("sha256").update(html).digest("hex");
  const requiredRoles = assets.faceAtlas && assets.face ? ["geometry", "texture", "face"] : ["geometry", "texture"];
  return {
    route,
    sourceUrl: `https://mv.brawlstars.top${PAGE_ROUTE_PREFIX}${encodeURIComponent(route)}`,
    sourceRoute: `https://mv.brawlstars.top${PAGE_ROUTE_PREFIX}${encodeURIComponent(route)}`,
    displayName,
    character,
    skinId,
    brawlerId: match.brawlerId,
    sourceKind: DEFAULT_SOURCE_KIND,
    assetSetId,
    captureId: `mv.brawlstars.top:${route}:${pageHash.slice(0, 16)}`,
    catalogRole: /\(Default\)$/i.test(displayName) ? "default" : "skin",
    requiredRoles,
    assets,
    animationMetadata,
    materialSlots: [],
    geometryMetadata: { uvSource: "default", sourceKind: DEFAULT_SOURCE_KIND, fileVersion: attrs["data-file-version"] || null },
    uvHints: { model, fileVersion: attrs["data-file-version"] || null, faceNames: Object.values(page.animations).flatMap((value) => Array.isArray(value) ? value.slice(1, 3).filter((item) => typeof item === "string") : []) },
    faceFlags: { coversWholeTexture: truthyDatasetValue(attrs["data-face-covers-whole-texture"]), scaledUpTexture: truthyDatasetValue(attrs["data-face-scaled-up-texture"]) },
    // The reference viewer always executes its outline postprocess. The
    // dataset flag selects its shader threshold/default, not availability.
    capabilities: { outline: { enabled: true, kind: "postprocess", referenceShader: truthyDatasetValue(attrs["data-outline-shader"]) } },
    cameraScale: Number(attrs["data-home-screen-scale"]) || 1,
    license: { status: "diagnostic-only", notice: "Reference capture for local QA; review source terms before public activation." },
  };
}

async function fetchBytes(fetchImpl, url, requestHeaders, retryOptions) {
  const response = await fetchWithRetry(fetchImpl, url, { headers: requestHeaders, ...retryOptions });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText || "request failed"}`);
  return Buffer.from(await response.arrayBuffer());
}

async function writeState(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

async function downloadEntryAssets(entry, { fetchImpl, outputDir, resumeState, requestHeaders, retryOptions }) {
  const downloaded = {};
  const visited = new Set();
  const visit = async (asset, key) => {
    if (!asset?.url) return;
    if (visited.has(key)) return;
    visited.add(key);
    const digest = resumeState?.assets?.[key]?.sha256;
    const sourceExtension = path.extname(new URL(asset.url).pathname) || (asset.role.startsWith("face") ? ".bin" : ".bin");
    const fileName = `${safeSegment(key)}.${digest ?? "pending"}${sourceExtension}`;
    const destination = path.join(outputDir, safeSegment(String(entry.brawlerId ?? "unknown")), safeSegment(entry.skinId), fileName);
    if (digest && existsSync(destination)) { downloaded[key] = { path: destination, sha256: digest, sourceKind: entry.sourceKind, assetSetId: entry.assetSetId, ...(asset.metadata ?? {}) }; return; }
    const bytes = await fetchBytes(fetchImpl, asset.url, requestHeaders, retryOptions);
    const actual = createHash("sha256").update(bytes).digest("hex");
    const finalDestination = path.join(outputDir, safeSegment(String(entry.brawlerId ?? "unknown")), safeSegment(entry.skinId), `${safeSegment(key)}.${actual}${sourceExtension}`);
    await mkdir(path.dirname(finalDestination), { recursive: true });
    await writeFile(finalDestination, bytes);
    downloaded[key] = { path: finalDestination, sha256: actual, sourceKind: entry.sourceKind, assetSetId: entry.assetSetId, ...(asset.metadata ?? {}) };
  };
  const walk = async (value, key) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const [index, child] of value.entries()) await walk(child, `${key}-${index}`); return; }
    if (typeof value.url === "string" && typeof value.role === "string") { await visit(value, key); return; }
    for (const [childKey, child] of Object.entries(value)) await walk(child, `${key}-${childKey}`);
  };
  await visit(entry.assets.geometry, "asset-geometry");
  await visit(entry.assets.materialSource, "asset-materialSource");
  const materialSource = downloaded["asset-materialSource"] ?? downloaded["asset-geometry"];
  let materialSlots = [];
  if (materialSource?.path) {
    try {
      let geometryDocument = null;
      if (downloaded["asset-geometry"]?.path) {
        try {
          geometryDocument = parseMaterialDocument(await readFile(downloaded["asset-geometry"].path));
        } catch (error) {
          if (!entry.assets.materialSource) throw error;
        }
      }
      const materialDocument = parseMaterialDocument(await readFile(materialSource.path));
      const uvSource = geometryUvSource(geometryDocument, { model: entry.uvHints?.model ?? path.basename(new URL(entry.assets.geometry.url).pathname), fileVersion: entry.uvHints?.fileVersion ?? entry.geometryMetadata?.fileVersion, faceNames: entry.uvHints?.faceNames });
      const derived = materialSlotDefinitions(materialDocument, { cdnOrigin: new URL(entry.assets.geometry.url).origin, assets: entry.assets, uvSource });
      materialSlots = derived.slots;
      entry.assets.materials = { ...(entry.assets.materials ?? {}), ...derived.referencedAssets };
      entry.geometryMetadata = { ...(entry.geometryMetadata ?? {}), uvSource };
    } catch (error) {
      if (entry.assets.materialSource) throw new Error(`materials document is invalid: ${error instanceof Error ? error.message : error}`);
    }
  }
  await walk(entry.assets, "asset");
  const replace = (value, key = "asset") => {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((child, index) => replace(child, `${key}-${index}`));
    if (typeof value.url === "string" && typeof value.role === "string") return downloaded[key] ?? value;
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, replace(child, `${key}-${childKey}`)]));
  };
  return { ...entry, assets: replace(entry.assets), materialSlots };
}

export async function crawlMvInventory({
  inventoryUrl = DEFAULT_INVENTORY_URL,
  pageOrigin = new URL(inventoryUrl).origin,
  cdnOrigin = DEFAULT_CDN_ORIGIN,
  characters,
  skins,
  confs,
  fetchImpl = fetch,
  requestHeaders = DEFAULT_REFERENCE_HEADERS,
  maxRetries = 4,
  retryDelayMs = 500,
  requestDelayMs = 100,
  routes = null,
  limit = null,
  offset = 0,
  outputDir = null,
  stateFile = null,
  resume = false,
}) {
  if (!Array.isArray(characters) || !Array.isArray(skins) || !Array.isArray(confs)) throw new Error("characters, skins, and confs CSV rows are required");
  const headers = { ...DEFAULT_REFERENCE_HEADERS, ...requestHeaders };
  const retryOptions = { maxRetries, retryDelayMs, requestDelayMs, requestGate: { nextRequestAt: 0 } };
  const inventoryResponse = await fetchWithRetry(fetchImpl, inventoryUrl, { headers, ...retryOptions });
  if (!inventoryResponse.ok) throw new Error(`inventory request failed: ${inventoryResponse.status}`);
  const entries = parseCatalogEntries(await inventoryResponse.text());
  const routeFilter = routes ? new Set(routes.map((route) => routeSlug(route))) : null;
  const selected = entries.filter((entry) => !routeFilter || routeFilter.has(routeSlug(entry.displayName))).filter((_, index) => index >= offset).slice(0, limit ?? entries.length);
  const state = resume && stateFile && existsSync(stateFile) ? JSON.parse(await readFile(stateFile, "utf8")) : { schemaVersion: 1, inventoryUrl, routes: {} };
  const result = [];
  for (const item of selected) {
    const route = routeSlug(item.displayName);
    const existing = resume ? state.routes?.[route] : null;
    let entry;
    if (existing?.entry && (!outputDir || existing.status === "ready")) entry = existing.entry;
    else {
      const pageUrl = new URL(`${PAGE_ROUTE_PREFIX}${encodeURIComponent(route)}`, pageOrigin).toString();
      try {
        const pageResponse = await fetchWithRetry(fetchImpl, pageUrl, { headers, ...retryOptions });
        if (!pageResponse.ok) throw new Error(`skin page request failed: ${pageResponse.status}`);
        entry = pageToInventoryEntry({ html: await pageResponse.text(), route, displayName: item.displayName, cdnOrigin, characters, skins, confs });
        if (outputDir) entry = await downloadEntryAssets(entry, { fetchImpl, outputDir, resumeState: existing, requestHeaders: headers, retryOptions });
        state.routes[route] = { status: "ready", entry };
      } catch (error) {
        entry = { route, displayName: item.displayName, sourceUrl: pageUrl, sourceRoute: pageUrl, character: "Unknown", skinId: `Reference-${safeSegment(route)}`, brawlerId: null, sourceKind: DEFAULT_SOURCE_KIND, assetSetId: `mv.brawlstars.top:${safeSegment(route)}`, assets: {}, animationMetadata: {}, materialSlots: [], faceFlags: {}, capabilities: {}, cameraScale: 1, license: { status: "diagnostic-only" }, reason: String(error instanceof Error ? error.message : error) };
        state.routes[route] = { status: "unavailable", entry };
      }
      if (stateFile) await writeState(stateFile, state);
    }
    result.push(entry);
  }
  return { schemaVersion: 1, kind: "mv-reference-inventory", source: { inventoryUrl, pageOrigin, cdnOrigin }, routes: result };
}

async function readCsvFromGit(repo, commit, file) {
  const { execFileSync } = await import("node:child_process");
  return parseCsv(execFileSync("git", ["-C", repo, "show", `${commit}:${file}`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
}

async function main() {
  const options = parseArgs(process.argv);
  const mirror = options.get("mirror");
  const outputOption = options.get("output-dir");
  if (!mirror || !outputOption) throw new Error("--mirror and --output-dir are required");
  const outputDir = path.resolve(String(outputOption));
  const commit = options.get("commit") ?? "e39b51ecd3dc7be45ac7d2b1f0210bc4cea054f0";
  const version = options.get("version") ?? "68.250";
  const characters = await readCsvFromGit(mirror, commit, `${version}/csv_logic/characters.csv`);
  const skins = await readCsvFromGit(mirror, commit, `${version}/csv_logic/skins.csv`);
  const confs = await readCsvFromGit(mirror, commit, `${version}/csv_logic/skin_confs.csv`);
  const stateFile = options.get("state") ?? path.join(outputDir, ".mv-import-state.json");
  const routes = options.get("routes") ? String(options.get("routes")).split(",").map((route) => route.trim()).filter(Boolean) : null;
  let requestHeaders = DEFAULT_REFERENCE_HEADERS;
  if (options.get("request-headers-json")) {
    const parsed = JSON.parse(await readFile(String(options.get("request-headers-json")), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.entries(parsed).some(([key, value]) => typeof key !== "string" || typeof value !== "string")) throw new Error("--request-headers-json must contain a JSON object of string header values");
    requestHeaders = { ...DEFAULT_REFERENCE_HEADERS, ...parsed };
  }
  const inventory = await crawlMvInventory({ inventoryUrl: options.get("inventory-url") ?? DEFAULT_INVENTORY_URL, cdnOrigin: options.get("cdn-origin") ?? DEFAULT_CDN_ORIGIN, characters, skins, confs, routes, limit: options.get("limit") ? Number(options.get("limit")) : null, offset: options.get("offset") ? Number(options.get("offset")) : 0, outputDir, stateFile, resume: options.has("resume"), requestHeaders, maxRetries: options.get("max-retries") ? Number(options.get("max-retries")) : 4, retryDelayMs: options.get("retry-delay-ms") ? Number(options.get("retry-delay-ms")) : 500, requestDelayMs: options.get("request-delay-ms") ? Number(options.get("request-delay-ms")) : 100 });
  const inventoryOutput = options.get("inventory-output") ?? path.join(outputDir, "mv-reference-inventory.json");
  await mkdir(path.dirname(inventoryOutput), { recursive: true });
  await writeFile(inventoryOutput, `${JSON.stringify(inventory, null, 2)}\n`);
  if (options.get("bridge-output")) {
    const bridgeAssetsDir = path.resolve(String(options.get("bridge-assets-dir") ?? outputDir));
    const bridge = await buildReferenceBridge({ inventory, charactersRows: characters, outputDir: bridgeAssetsDir, publicPrefix: options.get("public-prefix") ?? "/assets/brawlers/3d/reference-bridge", auditOutput: options.get("bridge-audit-output") ?? null, contentAddressed: true, storagePrefix: options.get("storage-prefix") ?? "" });
    await mkdir(path.dirname(options.get("bridge-output")), { recursive: true });
    await writeFile(options.get("bridge-output"), `${JSON.stringify(bridge, null, 2)}\n`);
    if (bridge.coverage.unavailableRoutes) process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
