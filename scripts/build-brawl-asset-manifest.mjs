#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { copyFileSync } from "node:fs";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { validateBrawlAnimationGlb } from "./validate-brawl-animation.mjs";
import { validateGeometryGlb } from "./materialize-brawl-assets.mjs";

const DEFAULT_COMMIT = "e39b51ecd3dc7be45ac7d2b1f0210bc4cea054f0";
const DEFAULT_VERSION = "68.250";
const animationFields = ["IdleAnim", "WalkAnim", "PrimarySkillAnim", "SecondarySkillAnim", "OverchargedSecondarySkillAnim", "PrimarySkillRecoilAnim", "SecondarySkillRecoilAnim", "ReloadingAnim", "PushbackAnim", "ChargeMoveAnim", "DeployAnim", "HappyAnim", "HappyLoopAnim", "SadAnim", "SadLoopAnim", "LobbyAnim", "LobbyLoopAnim", "HeroScreenIdleAnim", "HeroScreenAnim", "HeroScreenLoopAnim", "SignatureAnim", "ProfileAnim", "IntroAnim", "EnterAnim", "ExitAnim"];
const faceFields = ["IdleFace", "WalkFace", "HappyFace", "HappyLoopFace", "SadFace", "SadLoopFace", "LobbyFace", "LobbyLoopFace", "HeroScreenIdleFace", "HeroScreenFace", "HeroScreenLoopFace", "SignatureFace", "ProfileFace", "IntroFace"];
const explicitTrue = (value) => value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
const animationLabels = {
  IdleAnim: "Idle Anim", WalkAnim: "Walking Anim", PrimarySkillAnim: "Attack Anim", SecondarySkillAnim: "Ulti Anim", OverchargedSecondarySkillAnim: "Overcharged Ulti Anim",
  PrimarySkillRecoilAnim: "Attack Recoil", SecondarySkillRecoilAnim: "Ulti Recoil", ReloadingAnim: "Reload Anim", PushbackAnim: "Pushback Anim", ChargeMoveAnim: "Charge Anim", DeployAnim: "Deploy Anim",
  HappyAnim: "Win Anim", HappyLoopAnim: "Win Loop Anim", SadAnim: "Lose Anim", SadLoopAnim: "Lose Loop Anim", LobbyAnim: "Lobby Anim", LobbyLoopAnim: "Lobby Loop Anim",
  HeroScreenIdleAnim: "Hero Screen Idle", HeroScreenAnim: "Hero Screen Anim", HeroScreenLoopAnim: "Hero Screen Loop", SignatureAnim: "Signature Anim", ProfileAnim: "Profile Anim", IntroAnim: "Intro Anim", EnterAnim: "Enter Anim", ExitAnim: "Exit Anim",
};

function args() {
  const values = new Map();
  for (let i = 2; i < process.argv.length; i += 1) {
    const value = process.argv[i];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=", 2);
    const next = process.argv[i + 1];
    values.set(key, inline ?? (next && !next.startsWith("--") ? process.argv[++i] : true));
  }
  return values;
}

function csv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]; const next = text[index + 1];
    if (quoted) { if (character === '"' && next === '"') { cell += '"'; index += 1; } else if (character === '"') quoted = false; else cell += character; }
    else if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  if (row.length) { row.push(cell); rows.push(row); }
  const [header, , ...data] = rows;
  return data.filter((candidate) => candidate.length > 1).map((candidate, rowIndex) => ({ rowIndex, ...Object.fromEntries(header.map((key, index) => [key, candidate[index] ?? ""])) }));
}

function gitShow(repo, commit, file) {
  return execFileSync("git", ["-C", repo, "show", `${commit}:${file}`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function gitFiles(repo, commit, prefix) {
  return execFileSync("git", ["-C", repo, "ls-tree", "-r", "--name-only", commit, "--", prefix], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim().split("\n").filter(Boolean);
}

function normalizeApiCatalog(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.list)) return value.list;
  throw new Error("--api-catalog must contain an array or an object with a list array");
}

function assetKey(id, skinId) {
  const safeSkin = String(skinId).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${id ?? "unknown"}-${safeSkin || "skin"}`;
}

function modelBaseName(model) {
  return (model ?? "").split(":", 1)[0] || null;
}

function unavailable(reason) { return { kind: "unavailable", reason }; }
function localAsset(file) { return file ? { kind: "ready", url: `/assets/brawlers/3d/${file}` } : unavailable("not-captured"); }

const options = args();
const repo = options.get("mirror");
if (!repo) throw new Error("--mirror is required and must point to a local source mirror");
const commit = options.get("commit") ?? DEFAULT_COMMIT;
const version = options.get("version") ?? DEFAULT_VERSION;
const output = options.get("output") ?? "/tmp/brawl-asset-manifest.json";
const shardsDir = options.get("shards-dir");
const auditOutput = options.get("audit-output");
const packageDir = options.get("package-dir");
const composedDir = options.get("composed-dir");
const textureDir = options.get("texture-dir");
const convertedDir = options.get("converted-dir");
const apiCatalogPath = options.get("api-catalog");
const referenceBridgePath = options.get("reference-bridge");
const allowDiagnosticReferenceAssets = options.has("allow-diagnostic-reference-assets");
const converterDir = options.get("converter-dir");
const converterCommit = options.get("converter-commit") ?? "a0ac5f47b8e2088c088b0043f49508611f7bc660";
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("--commit must be a full git SHA");
if (repo.includes("http://") || repo.includes("https://")) throw new Error("--mirror must be a local repository");
if (referenceBridgePath && !allowDiagnosticReferenceAssets) throw new Error("--reference-bridge requires --allow-diagnostic-reference-assets");
if (allowDiagnosticReferenceAssets && !referenceBridgePath) throw new Error("--allow-diagnostic-reference-assets requires --reference-bridge");
if (converterDir) {
  if (!/^[a-f0-9]{40}$/.test(converterCommit)) throw new Error("--converter-commit must be a full git SHA");
  const actualConverterCommit = execFileSync("git", ["-C", converterDir, "rev-parse", converterCommit], { encoding: "utf8" }).trim();
  if (actualConverterCommit !== converterCommit) throw new Error(`converter commit mismatch: expected ${converterCommit}, got ${actualConverterCommit}`);
  const rotationReader = await readFile(path.join(converterDir, "lib/animation/continuousPackedReader.py"), "utf8");
  if (!rotationReader.includes("decode_base_rotation_component") || !rotationReader.includes("signed_value -= 0x10000")) {
    throw new Error("converter is missing the signed uint16 quaternion base-rotation patch");
  }
  const constants = await readFile(path.join(converterDir, "lib/odin_constants.py"), "utf8");
  const attributes = await readFile(path.join(converterDir, "lib/odin_attribute.py"), "utf8");
  if (!constants.includes("HalfVector2 = 22") || !constants.includes("OdinAttributeFormat.HalfVector2: 2") || !attributes.includes("case OdinAttributeFormat.HalfVector2")) {
    throw new Error("converter is missing Odin HalfVector2 UV support");
  }
}
const sourceFiles = new Set(gitFiles(repo, commit, `${version}/sc3d`));
const characters = csv(gitShow(repo, commit, `${version}/csv_logic/characters.csv`));
const skins = csv(gitShow(repo, commit, `${version}/csv_logic/skins.csv`));
const confs = csv(gitShow(repo, commit, `${version}/csv_logic/skin_confs.csv`));
const faces = csv(gitShow(repo, commit, `${version}/csv_client/faces.csv`));
const animationBySymbol = new Map(csv(gitShow(repo, commit, `${version}/csv_client/animations.csv`)).map((animation) => [animation.Name, animation]));
const faceBySymbol = new Map(faces.flatMap((face) => face.ExportName ? [[face.Name, face], [face.ExportName, face]] : []));
const faceExportBySymbol = new Map(faces.flatMap((face) => {
  if (!face.ExportName) return [];
  return face.Name ? [[face.Name, face.ExportName], [face.ExportName, face.ExportName]] : [[face.ExportName, face.ExportName]];
}));
const referenceBridge = referenceBridgePath ? JSON.parse(await readFile(referenceBridgePath, "utf8")) : null;
const apiCatalog = apiCatalogPath ? normalizeApiCatalog(JSON.parse(await readFile(apiCatalogPath, "utf8"))) : [];
const apiById = new Map(apiCatalog.filter((entry) => Number.isSafeInteger(entry.id)).map((entry) => [entry.id, entry]));
const apiByName = new Map(apiCatalog.filter((entry) => typeof entry.name === "string").map((entry) => [entry.name.toLowerCase(), entry]));
const skinRows = new Map(skins.map((skin) => [skin.Conf, skin]));
const sourcePath = (file) => file ? `${version}/sc3d/${file}` : null;
const modelAsset = (model) => {
  const base = modelBaseName(model);
  return base && !model.includes(":") && sourceFiles.has(sourcePath(base)) ? base : null;
};
const sourceTexture = (texture) => texture && sourceFiles.has(sourcePath(texture)) ? texture : null;
const convertedPath = (category, id, extension) => convertedDir ? path.join(convertedDir, category, `${id}.${extension}`) : null;
const contentAddressedAsset = (relative) => {
  if (!convertedDir) return unavailable("not-captured");
  const source = path.join(convertedDir, relative);
  if (!existsSync(source)) return unavailable("not-captured");
  const digest = createHash("sha256").update(readFileSync(source)).digest("hex").slice(0, 16);
  const extension = path.extname(relative);
  const stem = relative.slice(0, -extension.length);
  const hashedRelative = `${stem}.${digest}${extension}`;
  const target = path.join(convertedDir, hashedRelative);
  if (!existsSync(target)) copyFileSync(source, target);
  return localAsset(hashedRelative);
};
const convertedAsset = (category, id, extension) => {
  const file = convertedPath(category, id, extension);
  if (category === "models" && file && existsSync(file)) {
    const validation = validateGeometryGlb(readFileSync(file));
    if (!validation.ok) return unavailable(validation.reason);
  }
  return file && existsSync(file) ? contentAddressedAsset(`${category}/${id}.${extension}`) : unavailable("not-captured");
};
const sourceMetadata = (relative, expected) => {
  if (!convertedDir) return null;
  try {
    const metadata = JSON.parse(readFileSync(path.join(convertedDir, relative), "utf8"));
    return Object.entries({ commit, ...expected }).every(([key, value]) => metadata.source?.[key] === value) ? metadata : null;
  } catch { return null; }
};
const sourceMetadataMatches = (relative, expected) => sourceMetadata(relative, expected) !== null;
const validFrameRate = (value) => Number.isFinite(value) && value > 0;
const convertedAnimation = (key, field, source) => {
  const relative = `animations/${key}/${field}.glb`;
  const file = convertedDir ? path.join(convertedDir, relative) : null;
  if (!file || !existsSync(file)) return unavailable("not-captured");
  const metadata = sourceMetadata(`animations/${key}/${field}.meta.json`, source);
  if (!metadata) return unavailable("animation-source-mismatch");
  if (!validFrameRate(metadata.fps)) return unavailable("animation-frame-rate-not-captured");
  const validation = validateBrawlAnimationGlb(readFileSync(file));
  return validation.ok ? contentAddressedAsset(relative) : unavailable(validation.reason);
};
const convertedFace = (key, field) => {
  const relative = `faces/${key}/${field}.bin`;
  return convertedDir && existsSync(path.join(convertedDir, relative)) ? contentAddressedAsset(relative) : unavailable("not-captured");
};
const convertedFaceFps = (key, field) => {
  if (!convertedDir) return null;
  const metadata = path.join(convertedDir, "faces", key, `${field}.meta.json`);
  if (!existsSync(metadata)) return null;
  try {
    const fps = JSON.parse(readFileSync(metadata, "utf8")).fps;
    return Number.isFinite(fps) && fps > 0 ? fps : null;
  } catch { return null; }
};
const convertedFaceAtlas = (key, field) => {
  const relative = `faces/${key}/${field}.png`;
  return convertedDir && existsSync(path.join(convertedDir, relative)) ? contentAddressedAsset(relative) : unavailable("not-captured");
};
const convertedNamedAsset = (file) => convertedDir && existsSync(path.join(convertedDir, file)) ? contentAddressedAsset(file) : unavailable("not-captured");
const characterId = (character) => {
  if (!character) return null;
  const legacyId = 16000000 + character.rowIndex;
  const api = apiById.get(legacyId) ?? apiByName.get((character.Name ?? "").toLowerCase());
  return api?.id ?? legacyId;
};
const releasedApiIds = new Set(apiCatalog.filter((entry) => entry.released === true).map((entry) => entry.id));
const isReleasedCharacter = (character) => {
  const id = characterId(character);
  return apiCatalog.length ? releasedApiIds.has(id) : character?.Type === "Hero" && character.Disabled !== "true";
};
const bridgeReadyAssets = (value, output = []) => {
  if (!value || typeof value !== "object") return output;
  if (value.kind === "ready" && typeof value.url === "string") output.push(value);
  for (const child of Object.values(value)) bridgeReadyAssets(child, output);
  return output;
};
const bridgeGeometryMetadata = (entry) => {
  const metadata = entry.geometryMetadata ?? entry.assets?.geometry?.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
};
const readGlbJsonAndBin = (file) => {
  if (!file || !existsSync(file)) return null;
  const bytes = readFileSync(file);
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2) return null;
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  return json && bin ? { json, bin } : null;
};
const rawMaterialSlots = (key, skin, diffuse, diffuseAsset) => {
  if (skin?.MaterialsFile) return { slots: [], reason: "materials-override-not-converted" };
  if (skin?.CustomShader) return { slots: [], reason: "custom-shader-not-supported" };
  const document = readGlbJsonAndBin(convertedPath("models", key, "glb"))?.json;
  if (!document) return { slots: [], reason: "model-materials-not-captured" };
  const materials = document.materials ?? [];
  const used = [...new Set((document.meshes ?? []).flatMap((mesh) => (mesh.primitives ?? []).map((primitive) => primitive.material)))];
  if (!used.length || used.some((index) => !Number.isInteger(index) || !materials[index]?.name)) return { slots: [], reason: "model-materials-not-resolved" };
  const textureFile = (value, field) => {
    let file = typeof value === "string" ? value.split("#", 1)[0].replace(/^sc3d\//, "") : null;
    if (file === ".") file = field === "specularTexture" ? skin?.SpecularTexture : diffuse;
    return file;
  };
  const textureAsset = (value, field) => {
    const file = textureFile(value, field);
    if (file && file === diffuse) return diffuseAsset;
    return file ? convertedNamedAsset(file) : unavailable("material-texture-not-configured");
  };
  const hasStencil = materials.some((material) => material.constants?.includes("STENCIL"));
  const slots = [];
  for (const index of used) {
    const material = materials[index];
    if (material.shader !== "uber" || !Array.isArray(material.constants)) return { slots: [], reason: "material-shader-not-supported" };
    const constants = material.constants;
    const textures = material.variables?.textures ?? {};
    const booleans = material.variables?.booleans ?? {};
    if (constants.some((constant) => !["CLIP_PLANE", "DIFFUSE", "LIGHTMAP", "SPECULAR", "STENCIL", "AMBIENT", "OPACITY"].includes(constant)) || Object.values(booleans).some((value) => value === true)) return { slots: [], reason: "material-effects-not-supported" };
    const slot = { materialName: material.name, diffuse: constants.includes("DIFFUSE"), ambient: constants.includes("AMBIENT"), lightmapDiffuse: constants.includes("LIGHTMAP"), specular: constants.includes("SPECULAR"), stencil: !hasStencil || constants.includes("STENCIL"), uvSource: "67/68", stencilUvPolicy: "2x-flip-y", scConstants: constants, scBooleans: booleans, shader: material.shader, opacity: material.variables?.floats?.opacity ?? 1 };
    if (slot.diffuse) slot.diffuseTexture = textureAsset(textures.diffuseTex2D, "diffuseTexture");
    if (slot.specular) {
      const specularFile = textureFile(skin?.SpecularTexture || textures.specularTex2D, "specularTexture");
      const diffuseFile = textureFile(textures.diffuseTex2D, "diffuseTexture");
      // The viewer samples the diffuse alpha for specular, not a second mask.
      if (!slot.diffuse || !specularFile || specularFile !== diffuseFile) return { slots: [], reason: "separate-specular-texture-not-supported" };
    }
    if (slot.lightmapDiffuse) {
      slot.diffuseLightmap = textureAsset(textures.lightmapTex2D, "diffuseLightmap");
      slot.specularLightmap = textureAsset(textures.lightmapSpecularTex2D, "specularLightmap");
    }
    if (Object.values(slot).some((value) => value?.kind === "unavailable")) return { slots: [], reason: "material-texture-not-captured" };
    slots.push(slot);
  }
  return { slots, reason: null };
};
const bridgeGeometryUvRange = (entry) => {
  const metadata = bridgeGeometryMetadata(entry);
  if (Array.isArray(metadata.uvRange?.min) && Array.isArray(metadata.uvRange?.max)) return metadata.uvRange;
  const geometry = entry.assets?.geometry;
  if (!geometry?.url || !convertedDir) return null;
  const relative = geometry.url.replace(/^\/assets\/brawlers\/3d\//, "");
  const parsed = readGlbJsonAndBin(path.join(convertedDir, relative));
  if (!parsed) return null;
  const ranges = [];
  for (const mesh of parsed.json.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    const accessorIndex = primitive.attributes?.TEXCOORD_0;
    const accessor = Number.isInteger(accessorIndex) ? parsed.json.accessors?.[accessorIndex] : null;
    if (!accessor || accessor.type !== "VEC2") continue;
    if (Array.isArray(accessor.min) && Array.isArray(accessor.max)) { ranges.push({ min: accessor.min, max: accessor.max }); continue; }
    const view = parsed.json.bufferViews?.[accessor.bufferView];
    const componentBytes = ({ 5121: 1, 5123: 2, 5126: 4 })[accessor.componentType];
    if (!view || !componentBytes) continue;
    const stride = view.byteStride ?? componentBytes * 2;
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const min = [Infinity, Infinity];
    const max = [-Infinity, -Infinity];
    for (let index = 0; index < accessor.count; index += 1) {
      const base = start + index * stride;
      const readComponent = (offset) => accessor.componentType === 5126 ? parsed.bin.readFloatLE(offset)
        : accessor.componentType === 5123 ? parsed.bin.readUInt16LE(offset) / (accessor.normalized ? 65535 : 1)
          : parsed.bin.readUInt8(offset) / (accessor.normalized ? 255 : 1);
      const values = [readComponent(base), readComponent(base + componentBytes)];
      for (let axis = 0; axis < 2; axis += 1) { min[axis] = Math.min(min[axis], values[axis]); max[axis] = Math.max(max[axis], values[axis]); }
    }
    if (min.every(Number.isFinite) && max.every(Number.isFinite)) ranges.push({ min, max });
  }
  if (!ranges.length) return null;
  return { min: ranges.reduce((out, range) => out.map((value, index) => Math.min(value, range.min[index])), [Infinity, Infinity]), max: ranges.reduce((out, range) => out.map((value, index) => Math.max(value, range.max[index])), [-Infinity, -Infinity]) };
};
const bridgeUvSource = (entry) => {
  const metadata = bridgeGeometryMetadata(entry);
  if (["KHR_texture_transform", "COLLADA2GLTF", "67/68", "default"].includes(metadata.uvSource)) return metadata.uvSource;
  const range = bridgeGeometryUvRange(entry);
  if (range && range.min.every((value) => value >= -0.001) && range.max.every((value) => value <= 1.001)) return "default";
  return "default";
};
const bridgeAsset = (value, extension = null) => {
  if (!value || value.kind !== "ready" || typeof value.url !== "string" || !isStrictLocalBridgeUrl(value.url)) return unavailable("reference-bridge-asset-not-ready");
  if (extension && !value.url.toLowerCase().endsWith(extension)) return unavailable("reference-bridge-asset-extension-invalid");
  return { kind: "ready", url: value.url };
};
const isStrictLocalBridgeUrl = (value) => /^\/assets\/brawlers\/3d\/[^\\]*$/.test(value);
const bridgeFace = (asset, atlas) => ({ symbol: null, exportName: null, resolved: asset?.kind === "ready" && atlas?.kind === "ready", ready: asset?.kind === "ready" && atlas?.kind === "ready", atlas: bridgeAsset(atlas, ".png"), binary: bridgeAsset(asset, ".bin"), startFrame: 0, endFrame: -1, fps: 60 });
const bridgeRuntimeEntry = (entry) => {
  const assets = entry.assets ?? {};
  const animations = assets.animations ?? {};
  const metadata = entry.animationMetadata ?? {};
  const animationMap = { idle: "IdleAnim", walking: "WalkAnim", weapon: "PrimarySkillAnim", ulti: "SecondarySkillAnim", lobby: "HappyAnim", lose: "SadAnim" };
  const faceField = (sourceKey) => ({ face: "IdleFace", happy: "HappyFace", sad: "SadFace" })[sourceKey] ?? `ReferenceFace:${sourceKey}`;
  const animationOutput = {};
  for (const [sourceKey, asset] of Object.entries(animations)) {
    const field = animationMap[sourceKey] ?? `ReferenceAnim:${sourceKey}`;
    if (!asset) continue;
    const detail = metadata[sourceKey] ?? {};
    animationOutput[field] = { symbol: null, exported: bridgeAsset(asset, ".glb"), label: detail.label ?? animationLabels[field] ?? field, startFrame: detail.startFrame ?? 0, endFrame: detail.endFrame ?? -1, fps: detail.fps ?? 60, faceField: typeof detail.face === "string" && detail.face ? faceField(detail.face) : null };
  }
  const atlas = assets.faceAtlas;
  const atlasForFace = (asset) => assets.faceAtlases?.[asset?.faceAtlasKey] ?? atlas;
  const faceAssets = { ...assets.faces, face: assets.face };
  const facesOutput = {};
  for (const field of faceFields) {
    const sourceKey = field.startsWith("Happy") || ["LobbyFace", "HeroScreenFace", "SignatureFace"].includes(field) ? "happy" : field.startsWith("Sad") ? "sad" : "face";
    facesOutput[field] = bridgeFace(faceAssets[sourceKey], atlasForFace(faceAssets[sourceKey]));
  }
  for (const [sourceKey, asset] of Object.entries(faceAssets)) facesOutput[faceField(sourceKey)] = bridgeFace(asset, atlasForFace(asset));
  const uvSource = bridgeUvSource(entry);
  const materialSlots = Array.isArray(entry.materialSlots) ? entry.materialSlots.map((slot) => {
    const output = { ...slot };
    output.uvSource = uvSource;
    output.stencilUvPolicy = slot.stencilUvPolicy ?? "identity";
    for (const key of ["diffuseTexture", "specularTexture", "diffuseLightmap", "specularLightmap", "stencilTexture", "emissionTexture", "colorizeTexture"]) if (slot[key] !== undefined) output[key] = bridgeAsset(slot[key]);
    return output;
  }) : [];
  return {
    brawlerId: entry.brawlerId,
    skinId: entry.skinId,
    character: entry.character,
    displayName: entry.displayName ?? undefined,
    publicCharacter: entry.character,
    released: true,
    baseModel: bridgeAsset(assets.geometry, ".glb"),
    diffuseTexture: bridgeAsset(assets.texture, ".png"),
    animations: animationOutput,
    faces: facesOutput,
    capabilities: { outline: { kind: "postprocess", enabled: entry.capabilities?.outline?.enabled === true } },
    assetGroup: "reference-bridge",
    materialSlots,
    cameraScale: Number(entry.cameraScale) || 1,
    faceFlags: { faceCoversWholeTexture: explicitTrue(entry.faceFlags?.coversWholeTexture) ? "true" : null, faceScaledUpTexture: explicitTrue(entry.faceFlags?.scaledUpTexture) ? "true" : null, disableHeadRotation: explicitTrue(entry.faceFlags?.disableHeadRotation) ? "true" : null },
    source: { referenceBridge: true, sourceKind: entry.source?.kind ?? null, assetSetId: entry.source?.assetSetId ?? null },
    sourceReadiness: { model: true, diffuse: true, idle: animationOutput.IdleAnim?.exported.kind === "ready", readyForConversion: false },
    conversionPlan: null,
    sourceBytes: null,
    unavailableReasons: [],
  };
};
const referenceRejections = [];
const validateReferenceBridge = (bridge) => {
  if (!bridge || bridge.kind !== "reference-asset-bridge" || !Array.isArray(bridge.entries)) throw new Error("reference bridge must be a reference-asset-bridge manifest");
  const accepted = [];
  for (const entry of bridge.entries) {
    try {
    const identity = { sourceKind: null, assetSetId: null };
    if (entry.status !== "ready") throw new Error(`reference bridge entry ${entry.skinId ?? "unknown"} is unavailable`);
    if (entry.source?.contentAddressed !== true) throw new Error(`reference bridge entry ${entry.skinId ?? "unknown"} is not content-addressed`);
    const assets = bridgeReadyAssets(entry);
    if (!assets.length) throw new Error(`reference bridge entry ${entry.skinId ?? "unknown"} has no assets`);
    const uvSource = bridgeUvSource(entry);
    const geometryMetadata = bridgeGeometryMetadata(entry);
    if (geometryMetadata.sourceKind && geometryMetadata.sourceKind !== entry.source?.kind) throw new Error(`reference bridge entry ${entry.skinId ?? "unknown"} mixes geometry source kind and bridge source kind`);
    if (uvSource === "67/68") {
      const range = bridgeGeometryUvRange(entry);
      if (!range || range.min.some((value) => value < -0.001) || range.max.some((value) => value > 0.501)) {
        throw new Error(`reference bridge entry ${entry.skinId ?? "unknown"} has unverified half-range 67/68 UV coordinates`);
      }
    }
    for (const slot of entry.materialSlots ?? []) if (slot.uvSource && slot.uvSource !== uvSource) throw new Error(`reference bridge entry ${entry.skinId ?? "unknown"} has a material UV policy mismatch: ${slot.uvSource} vs ${uvSource}`);
    for (const asset of assets) {
      if (asset.sourceKind === "pinned-local" || typeof asset.sourceKind !== "string" || typeof asset.assetSetId !== "string") throw new Error(`reference bridge entry ${entry.skinId ?? "unknown"} mixes or omits asset provenance`);
      if (!/^[a-f0-9]{64}$/i.test(asset.sha256 ?? "") || !asset.url.includes(asset.sha256.toLowerCase())) throw new Error(`reference bridge entry ${entry.skinId ?? "unknown"} has an invalid content hash`);
      if (convertedDir) {
        const relative = asset.url.replace(/^\/assets\/brawlers\/3d\//, "");
        const local = path.join(convertedDir, relative);
        if (!existsSync(local)) throw new Error(`reference bridge entry ${entry.skinId ?? "unknown"} asset is missing locally: ${asset.url}`);
        const actualHash = createHash("sha256").update(readFileSync(local)).digest("hex");
        if (actualHash !== asset.sha256.toLowerCase()) throw new Error(`reference bridge entry ${entry.skinId ?? "unknown"} asset hash does not match local bytes: ${asset.url}`);
      }
      if (identity.sourceKind === null) identity.sourceKind = asset.sourceKind;
      if (identity.assetSetId === null) identity.assetSetId = asset.assetSetId;
      if (identity.sourceKind !== asset.sourceKind || identity.assetSetId !== asset.assetSetId) throw new Error(`reference bridge entry ${entry.skinId ?? "unknown"} mixes source kinds or asset sets`);
    }
    accepted.push(entry);
    } catch (error) {
      if (!options.has("quarantine-reference-failures")) throw error;
      referenceRejections.push({ route: entry.route ?? null, skinId: entry.skinId ?? null, reason: String(error instanceof Error ? error.message : error) });
    }
  }
  return accepted;
};
const entries = confs.map((conf) => {
  const confCharacterNames = new Set((conf.Character ?? "").split(";"));
  const character = characters.find((candidate) => confCharacterNames.has(candidate.Name) || candidate.Name.split(";").some((name) => confCharacterNames.has(name)));
  const skin = skinRows.get(conf.Name);
  const animationSymbols = Object.fromEntries(animationFields.map((field) => [field, conf[field] || null]));
  const faceSymbols = Object.fromEntries(faceFields.map((field) => [field, conf[field] || null]));
  const faceExportNames = Object.fromEntries(faceFields.map((field) => [field, faceSymbols[field] ? faceExportBySymbol.get(faceSymbols[field]) ?? null : null]));
  const model = modelAsset(conf.Model);
  const modelSourceFile = modelBaseName(conf.Model);
  const modelSourcePresent = Boolean(modelSourceFile && sourceFiles.has(sourcePath(modelSourceFile)));
  const compositeModel = Boolean(conf.Model?.includes(":"));
  const diffuse = sourceTexture(skin?.DiffuseTexture);
  const animationDefinitions = Object.fromEntries(animationFields.map((field) => [field, animationBySymbol.get(animationSymbols[field]) ?? null]));
  const animationSources = Object.fromEntries(animationFields.map((field) => {
    const file = animationDefinitions[field]?.FileName;
    return [field, file && sourceFiles.has(sourcePath(file)) ? file : null];
  }));
  const animationPlayback = (field) => {
    const definition = animationDefinitions[field];
    const metadata = animationSources[field] ? sourceMetadata(`animations/${key}/${field}.meta.json`, { input: sourcePath(animationSources[field]), symbol: animationSymbols[field] }) : null;
    return { startFrame: Number(definition?.StartFrame || 0), endFrame: Number(definition?.EndFrame || -1), ...(validFrameRate(metadata?.fps) ? { fps: metadata.fps } : {}), speed: Number(definition?.Speed || 100) / 100 };
  };
  const idleSource = animationSources.IdleAnim;
  const id = characterId(character);
  const key = assetKey(id, conf.Name);
  const released = isReleasedCharacter(character);
  const apiCharacter = apiById.get(id) ?? apiByName.get((character?.Name ?? "").toLowerCase());
  const syntheticCharacter = Boolean(conf.Character?.includes(";"));
  let baseModelAsset = convertedDir && model ? convertedAsset("models", key, "glb") : unavailable(model ? "not-captured" : "model-not-present-in-pinned-source");
  const diffuseTextureAsset = convertedDir && diffuse ? convertedAsset("textures", key, "png") : unavailable(diffuse ? "not-captured" : "diffuse-texture-not-present-in-pinned-source");
  const materialResolution = baseModelAsset.kind === "ready" ? rawMaterialSlots(key, skin, diffuse, diffuseTextureAsset) : { slots: [], reason: null };
  const materialSlots = materialResolution.slots;
  if (materialResolution.reason) baseModelAsset = unavailable(materialResolution.reason);
  const unavailableReasons = [];
  if (baseModelAsset.kind === "unavailable") unavailableReasons.push(baseModelAsset.reason);
  if (syntheticCharacter) unavailableReasons.push("default-source-entry-missing");
  if (!model) unavailableReasons.push(compositeModel && modelSourcePresent ? "composite-model-not-captured" : "model-not-present-in-pinned-source");
  if (!diffuse) unavailableReasons.push("diffuse-texture-not-present-in-pinned-source");
  if (!conf.PortraitCameraFile || !sourceFiles.has(`${version}/sc3d/${conf.PortraitCameraFile}`)) unavailableReasons.push("portrait-camera-not-captured");
  if (!idleSource) unavailableReasons.push("idle-animation-not-present-in-pinned-source");
  const exportedAnimations = Object.fromEntries(animationFields.map((field) => [field, !animationSymbols[field] ? unavailable("not-configured") : !animationSources[field] ? unavailable("animation-symbol-not-resolved") : convertedAnimation(key, field, { input: sourcePath(animationSources[field]), symbol: animationSymbols[field] })]));
  const exportedFaces = Object.fromEntries(faceFields.map((field) => {
    const symbol = faceSymbols[field];
    const exportName = faceExportNames[field];
    if (!symbol) return [field, { atlas: unavailable("not-configured"), binary: unavailable("not-configured") }];
    if (!exportName) return [field, { atlas: unavailable("face-export-not-mapped"), binary: unavailable("face-export-not-mapped") }];
    const input = faceBySymbol.get(symbol)?.FileName;
    const metadata = input ? sourceMetadata(`faces/${key}/${field}.meta.json`, { input: `${version}/sc/${input}`, symbol, exportName }) : null;
    if (!metadata) return [field, { atlas: unavailable("face-source-mismatch"), binary: unavailable("face-source-mismatch") }];
    if (metadata.export_name_reference_base !== 0 || !Number.isInteger(metadata.export_object_id) || metadata.export_object_id < 0) return [field, { atlas: unavailable("face-export-name-mapping-unverified"), binary: unavailable("face-export-name-mapping-unverified") }];
    return [field, { atlas: convertedFaceAtlas(key, field), binary: convertedFace(key, field) }];
  }));
  if (Object.entries(animationSymbols).some(([field, symbol]) => symbol && exportedAnimations[field].kind !== "ready")) unavailableReasons.push("animation-export-not-run");
  if (Object.values(faceSymbols).some((symbol) => symbol && !faceExportBySymbol.has(symbol))) unavailableReasons.push("face-symbol-not-mapped");
  if (Object.entries(faceExportNames).some(([field, exportName]) => exportName && exportedFaces[field].binary.kind !== "ready")) unavailableReasons.push("face-export-not-captured");
  return {
    brawlerId: id,
    skinId: conf.Name,
    character: conf.Character,
    publicCharacter: apiCharacter?.name ?? null,
    released,
    assetGroup: "pinned-local",
    baseModel: baseModelAsset,
    diffuseTexture: diffuseTextureAsset,
    source: { model: conf.Model || null, modelFile: modelSourceFile, compositeModel, portraitCamera: conf.PortraitCameraFile || null, diffuse: skin?.DiffuseTexture || null, diffuseFile: diffuse, specular: skin?.SpecularTexture || null, materials: skin?.MaterialsFile || null, customShader: skin?.CustomShader || null, outlineShader: skin?.OutlineShader || null, animations: animationSources, idle: idleSource },
    animations: Object.fromEntries(animationFields.map((field) => [field, { symbol: animationSymbols[field], exported: exportedAnimations[field], label: animationLabels[field] ?? field, ...animationPlayback(field) }])),
    faces: Object.fromEntries(faceFields.map((field) => { const face = exportedFaces[field]; const exportName = faceExportNames[field]; return [field, { symbol: faceSymbols[field], exportName, resolved: Boolean(exportName), ready: Boolean(exportName && face.atlas.kind === "ready" && face.binary.kind === "ready"), atlas: face.atlas, binary: face.binary, startFrame: 0, endFrame: -1, fps: convertedFaceFps(key, field) ?? 60 }]; })),
    capabilities: { outline: { kind: "postprocess", enabled: baseModelAsset.kind === "ready" && diffuseTextureAsset.kind === "ready" } },
    materialSlots,
    cameraScale: Number(character?.HomeScreenScale) || 1,
    orientation: { heroX: character?.HeroScreenXOffset || null, heroZ: character?.HeroScreenZOffset || null, battleX: character?.BattleIntroXOffset || null, battleZ: character?.BattleIntroZOffset || null },
    faceFlags: { faceCoversWholeTexture: explicitTrue(conf.FaceCoversWholeTexture) ? "true" : null, faceScaledUpTexture: explicitTrue(conf.FaceScaledUpTexture) ? "true" : null, disableHeadRotation: explicitTrue(conf.DisableHeadRotation) ? "true" : null },
    conversionPlan: { key, model: model ? { input: sourcePath(model), output: `models/${key}.glb` } : null, texture: diffuse ? { input: sourcePath(diffuse), output: `textures/${key}.png` } : null, animations: Object.fromEntries(Object.entries(animationSources).filter(([, file]) => file).map(([field, file]) => [field, { symbol: animationSymbols[field], input: sourcePath(file), output: `animations/${key}/${field}.glb`, label: animationLabels[field] ?? field, ...animationPlayback(field) }])), faces: Object.fromEntries(Object.entries(faceSymbols).filter(([, symbol]) => symbol).map(([field, symbol]) => [field, { symbol, exportName: faceExportNames[field], input: faceBySymbol.get(symbol)?.FileName ? `${version}/sc/${faceBySymbol.get(symbol).FileName}` : null, atlas: `faces/${key}/${field}.png`, binary: `faces/${key}/${field}.bin`, startFrame: 0, endFrame: -1, fps: 60 }])) },
    sourceReadiness: { model: Boolean(model), diffuse: Boolean(diffuse), idle: Boolean(idleSource), readyForConversion: Boolean(!syntheticCharacter && model && diffuse && idleSource) },
    sourceBytes: null,
    unavailableReasons: [...new Set(unavailableReasons)],
  };
});
if (referenceBridge) {
  for (const bridgeEntry of validateReferenceBridge(referenceBridge)) {
    const replacement = bridgeRuntimeEntry(bridgeEntry);
    const existingIndex = entries.findIndex((entry) => entry.brawlerId === replacement.brawlerId && entry.skinId === replacement.skinId);
    if (existingIndex >= 0) entries[existingIndex] = replacement;
    else entries.push(replacement);
  }
}
const brawlerCharacters = characters.filter(isReleasedCharacter);
const defaults = brawlerCharacters.map((character) => entries.find((entry) => entry.skinId === character.DefaultSkin)).filter(Boolean);
const releasedSkins = entries.filter((entry) => entry.released);
const conversionReady = entries.filter((entry) => entry.sourceReadiness.readyForConversion);
const apiIntersection = apiCatalog.length ? brawlerCharacters.map((character) => ({ brawlerId: characterId(character), character: character.Name, apiName: (apiById.get(characterId(character)) ?? apiByName.get(character.Name.toLowerCase()))?.name ?? null, present: Boolean(apiById.get(characterId(character)) ?? apiByName.get(character.Name.toLowerCase())) })) : [];
const manifest = { schemaVersion: 1, source: { repository: "brawl-stars-assets-cache", commit, version, externalUrls: [], ...(converterDir ? { converter: { repository: "Daniil-SV/Supercell-Flat-Converter", commit: converterCommit, patch: "scripts/patches/supercell-flat-converter-continuous-rotation.patch" } } : {}), ...(referenceBridge ? { diagnosticReferenceBridge: { inventory: referenceBridge.source?.inventory ?? null, sourceKind: referenceBridge.entries[0]?.source?.kind ?? null, assetSetId: referenceBridge.entries[0]?.source?.assetSetId ?? null } } : {}) }, counts: { characters: characters.length, brawlerCharacters: brawlerCharacters.length, releasedBrawlers: brawlerCharacters.length, skins: skins.length, skinConfs: confs.length, releasedSkins: releasedSkins.length, defaults: defaults.length, sourceReadySkins: conversionReady.length, sourceReadyDefaults: defaults.filter((entry) => entry.sourceReadiness.readyForConversion).length, sourceBytesForReadySkins: null, sourceSc3dFiles: sourceFiles.size }, apiIntersection, defaults, releasedSkins, skins: entries };
if (packageDir && composedDir && textureDir) {
  await mkdir(path.join(packageDir, "models"), { recursive: true }); await mkdir(path.join(packageDir, "textures"), { recursive: true });
  const crowModel = path.join(composedDir, "crow-textured-idle.glb"); const crowTexture = path.join(textureDir, "crow_tex.png");
  await copyFile(crowModel, path.join(packageDir, "models", "16000012.glb")); await copyFile(crowTexture, path.join(packageDir, "textures", "16000012.png"));
  manifest.pilot = { status: "diagnostic-unverified", reason: "composed-idle-visual-QA-failed", brawlerId: 16000012, skinId: "CrowDefault", package: { model: "models/16000012.glb", texture: "textures/16000012.png" }, animations: { idle: "embedded-in-diagnostic-glb", walk: unavailable("animation-export-not-run"), win: unavailable("animation-export-not-run"), lose: unavailable("animation-export-not-run"), attack: unavailable("animation-export-not-run"), ulti: unavailable("animation-export-not-run") } };
}
if (referenceRejections.length) manifest.referenceRejections = referenceRejections;
if (JSON.stringify(manifest).includes("http://") || JSON.stringify(manifest).includes("https://")) throw new Error("manifest contains external URL");
const runtimeEntry = (entry) => ({
  brawlerId: entry.brawlerId,
  skinId: entry.skinId,
  character: entry.character,
  displayName: entry.displayName,
  publicCharacter: entry.publicCharacter,
  released: entry.released,
  assetGroup: entry.assetGroup,
  baseModel: entry.baseModel,
  diffuseTexture: entry.diffuseTexture,
  animations: Object.fromEntries(Object.entries(entry.animations).filter(([, animation]) => animation.exported.kind === "ready")),
  faces: Object.fromEntries(Object.entries(entry.faces).filter(([, face]) => face.ready === true)),
  capabilities: entry.capabilities,
  materialSlots: entry.materialSlots,
  cameraScale: entry.cameraScale,
  faceFlags: entry.faceFlags,
});
if (shardsDir) {
  await mkdir(shardsDir, { recursive: true });
  const shardIds = [...new Set([...defaults, ...releasedSkins].map((entry) => entry.brawlerId).filter((id) => Number.isSafeInteger(id)))].sort((left, right) => left - right);
  for (const brawlerId of shardIds) {
    const shard = {
      schemaVersion: 1,
      kind: "brawler",
      brawlerId,
      defaults: defaults.filter((entry) => entry.brawlerId === brawlerId).map(runtimeEntry),
      releasedSkins: releasedSkins.filter((entry) => entry.brawlerId === brawlerId).map(runtimeEntry),
    };
    if (JSON.stringify(shard).includes("http://") || JSON.stringify(shard).includes("https://")) throw new Error(`shard ${brawlerId} contains external URL`);
    const shardText = `${JSON.stringify(shard, null, 2)}\n`;
    const shardHash = createHash("sha256").update(shardText).digest("hex").slice(0, 16);
    await writeFile(path.join(shardsDir, `${brawlerId}.${shardHash}.json`), shardText);
  }
  const index = {
    schemaVersion: 1,
    kind: "index",
    brawlers: shardIds.map((brawlerId) => {
      const shardText = `${JSON.stringify({ schemaVersion: 1, kind: "brawler", brawlerId, defaults: defaults.filter((entry) => entry.brawlerId === brawlerId).map(runtimeEntry), releasedSkins: releasedSkins.filter((entry) => entry.brawlerId === brawlerId).map(runtimeEntry) }, null, 2)}\n`;
      const shardHash = createHash("sha256").update(shardText).digest("hex").slice(0, 16);
      return { brawlerId, shard: `/assets/brawlers/3d/catalog/${brawlerId}.${shardHash}.json` };
    }),
  };
  await writeFile(output, `${JSON.stringify(index, null, 2)}\n`);
  if (auditOutput) await writeFile(auditOutput, `${JSON.stringify(manifest, null, 2)}\n`);
} else {
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(JSON.stringify({ output, auditOutput: auditOutput ?? null, shardsDir: shardsDir ?? null, shardCount: shardsDir ? new Set([...defaults, ...releasedSkins].map((entry) => entry.brawlerId).filter((id) => Number.isSafeInteger(id))).size : 0, defaults: defaults.length, skins: entries.length, sourceSc3dFiles: sourceFiles.size, pilot: Boolean(manifest.pilot) }));
