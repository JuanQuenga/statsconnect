#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_PUBLIC_PREFIX = "/assets/brawlers/3d/reference-bridge";
const DEFAULT_REQUIRED_ROLES = ["geometry", "texture", "face"];

function parseArgs(argv) {
  const values = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=", 2);
    values.set(key, inline ?? argv[++index]);
  }
  return values;
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
  if (!header?.length) throw new Error("characters CSV has no header");
  return data.filter((candidate) => candidate.some(Boolean)).map((candidate, rowIndex) => ({
    rowIndex,
    ...Object.fromEntries(header.map((key, index) => [key, candidate[index] ?? ""])),
  }));
}

function stableCharacterName(row) {
  return String(row.Name ?? "").split(";").map((name) => name.trim()).filter(Boolean);
}

function stableIdMap(rows) {
  const map = new Map();
  for (const row of rows) {
    for (const name of stableCharacterName(row)) map.set(name.toLowerCase(), 16000000 + row.rowIndex);
  }
  return map;
}

function safeSegment(value, fallback) {
  const segment = String(value ?? "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return segment || fallback;
}

function safeFileName(value, fallback) {
  const segment = String(value ?? "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^\.+/, "");
  return !segment || segment === "." || segment === ".." ? fallback : segment;
}

function isExternalUrl(value) {
  return typeof value === "string" && /^(?:https?:)?\/\//i.test(value);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function requiredRoles(entry) {
  const roles = entry.requiredRoles ?? DEFAULT_REQUIRED_ROLES;
  if (!Array.isArray(roles) || roles.some((role) => typeof role !== "string" || !role)) {
    throw new Error(`requiredRoles must be a non-empty string array for ${entry.route ?? "unknown route"}`);
  }
  return [...new Set(roles)];
}

function normalizeAsset(asset, role, context) {
  if (!asset || typeof asset !== "object" || typeof asset.path !== "string" || !asset.path) {
    return { error: `${role} must have a local path` };
  }
  if (isExternalUrl(asset.path) || asset.url || asset.runtimeUrl) {
    return { error: `${role} may not contain a runtime URL` };
  }
  const sourceKind = asset.sourceKind ?? context.sourceKind;
  if (typeof sourceKind !== "string" || !sourceKind) return { error: `${role} is missing sourceKind` };
  const assetSetId = asset.assetSetId ?? context.assetSetId;
  if (typeof assetSetId !== "string" || !assetSetId) return { error: `${role} is missing assetSetId` };
  const declaredHash = asset.sha256 ?? asset.hash;
  if (declaredHash !== undefined && !/^[a-f0-9]{64}$/i.test(declaredHash)) return { error: `${role} has an invalid sha256` };
  const metadata = {};
  for (const key of ["label", "startFrame", "endFrame", "fps", "face", "faceAvailable", "faceAtlasKey"]) if (asset[key] !== undefined) metadata[key] = asset[key];
  return { value: { role, path: asset.path, sourceKind, assetSetId, declaredHash: declaredHash?.toLowerCase() ?? null, metadata } };
}

function inputAssets(entry) {
  const assets = entry.assets;
  if (!assets || typeof assets !== "object") return [];
  const values = [];
  for (const role of ["geometry", "texture", "specularTexture", "face"]) {
    if (assets[role] !== undefined) values.push([role, assets[role]]);
  }
  if (assets.faceAtlas !== undefined) values.push(["faceAtlas", assets.faceAtlas]);
  for (const [name, asset] of Object.entries(assets.faceAtlases ?? {})) values.push([`faceAtlas:${name}`, asset]);
  if (assets.faces && typeof assets.faces === "object" && !Array.isArray(assets.faces)) {
    for (const [name, asset] of Object.entries(assets.faces)) values.push([`face:${name}`, asset]);
  }
  if (assets.materials && typeof assets.materials === "object" && !Array.isArray(assets.materials)) {
    for (const [name, asset] of Object.entries(assets.materials)) values.push([`material:${name}`, asset]);
  }
  if (assets.animations && typeof assets.animations === "object" && !Array.isArray(assets.animations)) {
    for (const [name, asset] of Object.entries(assets.animations)) values.push([`animation:${name}`, asset]);
  }
  return values;
}

function runtimeAsset(url, digest, bytes, sourceKind, assetSetId) {
  return { kind: "ready", url, sha256: digest, bytes, sourceKind, assetSetId };
}

function contentAddressedName(fileName, digest, role = "") {
  const extension = path.extname(fileName) || ((role === "face" || role.startsWith("face:")) ? ".bin" : "");
  const stem = extension ? fileName.slice(0, -extension.length) : fileName;
  return `${stem}.${digest}${extension}`;
}

function resolveRuntimeReference(value, assets) {
  if (typeof value !== "string") return value;
  if (value === "texture") return assets.texture ?? null;
  if (value === "specularTexture") return assets.specularTexture ?? null;
  if (value === "faceAtlas") return assets.faceAtlas ?? null;
  if (value === "face") return assets.face ?? null;
  const [kind, name] = value.split(":", 2);
  if (kind === "material") return assets.materials?.[name] ?? null;
  if (kind === "face") return assets.faces?.[name] ?? null;
  if (kind === "faceAtlas") return assets.faceAtlases?.[name] ?? null;
  if (kind === "animation") return assets.animations?.[name] ?? null;
  return value;
}

function resolveMetadataReferences(value, assets) {
  if (Array.isArray(value)) return value.map((item) => resolveMetadataReferences(item, assets));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveMetadataReferences(item, assets)]));
  return resolveRuntimeReference(value, assets);
}

/**
 * Build a local, same-origin compatibility catalog from an offline inventory.
 * The inventory's source URLs are audit provenance only and are never copied to
 * the runtime catalog. Groups are rejected when their face/model packages do
 * not share the same source kind and asset-set identity.
 */
export async function buildReferenceBridge({ inventory, charactersCsv = null, charactersRows = null, outputDir, publicPrefix = DEFAULT_PUBLIC_PREFIX, auditOutput = null, contentAddressed = false, deduplicateAssets = false, storagePrefix = "" }) {
  if (!inventory || !Array.isArray(inventory.routes ?? inventory.entries)) throw new Error("inventory must contain a routes or entries array");
  if (!charactersCsv && !Array.isArray(charactersRows)) throw new Error("charactersCsv or charactersRows is required for stable-ID mapping");
  if (!outputDir) throw new Error("outputDir is required to mirror assets into project-controlled storage");
  if (deduplicateAssets && !contentAddressed) throw new Error("deduplicated delivery requires content-addressed assets");
  if (isExternalUrl(outputDir) || isExternalUrl(publicPrefix)) throw new Error("outputDir and publicPrefix must be local/same-origin");
  const rows = Array.isArray(charactersRows) ? charactersRows : parseCsv(await readFile(charactersCsv, "utf8"));
  const ids = stableIdMap(rows);
  const inventoryRoot = path.dirname(path.resolve(inventory.__path ?? outputDir));
  const routes = inventory.routes ?? inventory.entries;
  const seenRoutes = new Set();
  const entries = [];
  const auditEntries = [];
  await mkdir(outputDir, { recursive: true });

  for (const entry of routes) {
    const route = typeof entry?.route === "string" ? entry.route : null;
    const character = typeof entry?.character === "string" ? entry.character : null;
    const skinId = typeof entry?.skinId === "string" ? entry.skinId : null;
    const sourceCharacterId = character ? ids.get(character.toLowerCase()) ?? null : null;
    const brawlerId = entry.identity?.entityKind === "pet" ? (entry.identity.ownerBrawlerIds?.length === 1 ? entry.identity.ownerBrawlerIds[0] : null) : sourceCharacterId;
    const errors = [];
    const failedKeys = Object.keys(entry.downloadFailures ?? {});
    const onlyOptionalAnimationsMissing = failedKeys.length > 0 && failedKeys.every((key) => key.startsWith("asset-animations-"));
    if (entry.reason && !onlyOptionalAnimationsMissing) errors.push(`capture is incomplete: ${entry.reason}`);
    if (entry.identity && !["matched", "reference-only"].includes(entry.identity.kind)) errors.push(`source identity is ${entry.identity.kind}`);
    if (!route) errors.push("route is required");
    if (route && seenRoutes.has(route)) errors.push("duplicate route");
    if (route) seenRoutes.add(route);
    if (!character) errors.push("character is required");
    if (!skinId) errors.push("skinId is required");
    if (character && brawlerId === null) errors.push("character is not present in pinned characters CSV");
    const needed = requiredRoles(entry);
    const sourceKind = entry.sourceKind;
    const assetSetId = entry.assetSetId;
    if (typeof sourceKind !== "string" || !sourceKind) errors.push("sourceKind is required");
    if (typeof assetSetId !== "string" || !assetSetId) errors.push("assetSetId is required");
    const normalized = [];
    const unavailableAnimations = [];
    for (const [role, asset] of inputAssets(entry)) {
      if (role.startsWith("animation:") && asset?.kind === "unavailable") {
        unavailableAnimations.push(role.slice("animation:".length));
        continue;
      }
      const result = normalizeAsset(asset, role, { sourceKind, assetSetId });
      if (result.error) errors.push(result.error);
      else normalized.push(result.value);
    }
    const rolesPresent = new Set(normalized.map((asset) => asset.role.split(":", 1)[0]));
    if (Object.keys(entry.assets?.animations ?? {}).length && !rolesPresent.has("animation")) errors.push("no animation or static pose was captured");
    if (normalized.some((asset) => asset.role.startsWith("face:"))) rolesPresent.add("faces");
    for (const role of needed) if (!rolesPresent.has(role)) errors.push(`required asset missing: ${role}`);
    const sourceKinds = new Set(normalized.map((asset) => asset.sourceKind));
    const assetSets = new Set(normalized.map((asset) => asset.assetSetId));
    if (sourceKinds.size > 1) errors.push("asset group mixes source kinds; model and face must come from one source");
    if (assetSets.size > 1) errors.push("asset group mixes asset sets; model and face must come from one package");
    if (normalized.length && sourceKind && [...sourceKinds].some((kind) => kind !== sourceKind)) errors.push("asset sourceKind differs from group sourceKind");
    if (normalized.length && assetSetId && [...assetSets].some((set) => set !== assetSetId)) errors.push("asset assetSetId differs from group assetSetId");

    const runtimeAssets = {};
    const provenance = [];
    if (!errors.length) {
      for (const asset of normalized) {
        const localPath = path.isAbsolute(asset.path)
          ? asset.path
          : existsSync(path.resolve(asset.path))
            ? path.resolve(asset.path)
            : path.resolve(inventoryRoot, asset.path);
        if (!existsSync(localPath)) { errors.push(`${asset.role} file does not exist: ${asset.path}`); continue; }
        const bytes = await readFile(localPath);
        const digest = sha256(bytes);
        if (asset.declaredHash && asset.declaredHash !== digest) { errors.push(`${asset.role} sha256 does not match local file`); continue; }
        const role = asset.role.startsWith("animation:") ? `animations/${safeSegment(asset.role.slice("animation:".length), "animation")}` : asset.role.startsWith("face:") ? `faces/${safeSegment(asset.role.slice("face:".length), "face")}` : asset.role.startsWith("material:") ? `materials/${safeSegment(asset.role.slice("material:".length), "material")}` : safeSegment(asset.role, "asset");
        const copiedName = contentAddressed ? contentAddressedName(safeFileName(path.basename(localPath), "asset"), digest, asset.role) : (asset.role === "face" || asset.role.startsWith("face:")) && !path.extname(path.basename(localPath)) ? `${safeFileName(path.basename(localPath), "face")}.bin` : safeFileName(path.basename(localPath), "asset");
        const prefix = storagePrefix ? [safeSegment(storagePrefix, "bridge")] : [];
        const relative = deduplicateAssets
          ? path.join(...prefix, "objects", `${digest}${path.extname(copiedName)}`)
          : path.join(...prefix, safeSegment(String(brawlerId), "unknown"), safeSegment(skinId, "skin"), role, copiedName);
        const destination = path.join(outputDir, relative);
        await mkdir(path.dirname(destination), { recursive: true });
        if (!existsSync(destination) || sha256(await readFile(destination)) !== digest) await copyFile(localPath, destination);
        const url = `${publicPrefix.replace(/\/$/, "")}/${relative.split(path.sep).map(encodeURIComponent).join("/")}`;
        const value = { ...runtimeAsset(url, digest, bytes.byteLength, asset.sourceKind, asset.assetSetId), ...(asset.metadata ?? {}) };
        if (asset.role.startsWith("animation:")) {
          runtimeAssets.animations ??= {};
          runtimeAssets.animations[asset.role.slice("animation:".length)] = value;
        } else if (asset.role.startsWith("face:")) {
          runtimeAssets.faces ??= {};
          runtimeAssets.faces[asset.role.slice("face:".length)] = value;
        } else if (asset.role.startsWith("material:")) {
          runtimeAssets.materials ??= {};
          runtimeAssets.materials[asset.role.slice("material:".length)] = value;
        } else if (asset.role.startsWith("faceAtlas:")) {
          runtimeAssets.faceAtlases ??= {};
          runtimeAssets.faceAtlases[asset.role.slice("faceAtlas:".length)] = value;
        } else if (asset.role === "faceAtlas") runtimeAssets.faceAtlas = value;
        else runtimeAssets[asset.role] = value;
        provenance.push({ role: asset.role, path: asset.path, sha256: digest, bytes: bytes.byteLength });
      }
    }
    const status = errors.length ? "unavailable" : "ready";
    const legal = entry.license ?? { status: "unknown" };
    const materialSlots = (entry.materialSlots ?? []).map((slot) => Object.fromEntries(Object.entries(slot).map(([key, value]) => [key, resolveRuntimeReference(value, runtimeAssets)])));
    const animationMetadata = entry.animationMetadata ?? Object.fromEntries(Object.entries(runtimeAssets.animations ?? {}).map(([key, animation]) => [key, Object.fromEntries(["label", "startFrame", "endFrame", "fps", "face"].filter((field) => animation[field] !== undefined).map((field) => [field, animation[field]]))]));
    const runtimeEntry = {
      brawlerId,
      character,
      skinId,
      route,
      cameraScale: Number(entry.cameraScale) || 1,
      displayName: entry.displayName ?? null,
      identity: entry.identity ?? null,
      sourceCharacterId,
      selection: entry.catalogRole ? { role: entry.catalogRole } : null,
      status,
      captureComplete: !entry.reason,
      unavailableAnimations,
      runtimeEligible: status === "ready" && legal.status === "cleared",
      activation: status === "ready" && legal.status === "cleared" ? "allowed" : "disabled-by-provenance",
      reason: errors.length ? [...new Set(errors)] : null,
      source: { kind: sourceKind ?? null, assetSetId: assetSetId ?? null, captureId: entry.captureId ?? inventory.captureId ?? null, licenseStatus: legal.status ?? "unknown", contentAddressed, storagePrefix: storagePrefix || null },
      geometryMetadata: entry.geometryMetadata ?? null,
      assets: status === "ready" ? runtimeAssets : {},
      animationMetadata: status === "ready" ? animationMetadata : {},
      materialSlots: status === "ready" ? materialSlots : [],
      faceFlags: status === "ready" ? (entry.faceFlags ?? {}) : {},
      capabilities: status === "ready" ? resolveMetadataReferences(entry.capabilities ?? {}, runtimeAssets) : {},
    };
    entries.push(runtimeEntry);
    auditEntries.push({ ...runtimeEntry, sourceUrl: entry.sourceUrl ?? null, sourceRoute: entry.sourceRoute ?? route, license: legal, localAssets: provenance, captureIssues: entry.downloadFailures ?? null });
  }

  const covered = entries.filter((entry) => entry.status === "ready");
  const unavailable = entries.filter((entry) => entry.status !== "ready");
  const result = {
    schemaVersion: 1,
    kind: "reference-asset-bridge",
    source: { inventory: inventory.captureId ?? null, runtimeUrls: [], externalUrls: [] },
    coverage: {
      totalRoutes: entries.length,
      coveredRoutes: covered.length,
      unavailableRoutes: unavailable.length,
      covered: covered.map((entry) => ({ route: entry.route, brawlerId: entry.brawlerId, skinId: entry.skinId })),
      unavailable: unavailable.map((entry) => ({ route: entry.route, character: entry.character, reason: entry.reason })),
    },
    entries,
  };
  const serialized = JSON.stringify(result);
  if (/(?:https?:)?\/\//i.test(serialized)) throw new Error("runtime bridge contains an external URL");
  if (auditOutput) {
    await mkdir(path.dirname(auditOutput), { recursive: true });
    await writeFile(auditOutput, JSON.stringify({ ...result, entries: auditEntries }, null, 2));
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv);
  const inventoryPath = options.get("inventory");
  const charactersCsv = options.get("characters-csv");
  const output = options.get("output");
  const outputDir = options.get("output-dir");
  if (!inventoryPath || !charactersCsv || !output || !outputDir) throw new Error("--inventory, --characters-csv, --output, and --output-dir are required");
  const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
  inventory.__path = inventoryPath;
  const result = await buildReferenceBridge({ inventory, charactersCsv, outputDir, publicPrefix: options.get("public-prefix") ?? DEFAULT_PUBLIC_PREFIX, auditOutput: options.get("audit-output") ?? null, contentAddressed: options.has("content-addressed"), deduplicateAssets: options.has("deduplicate-assets"), storagePrefix: options.get("storage-prefix") ?? "" });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  if (result.coverage.unavailableRoutes) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
