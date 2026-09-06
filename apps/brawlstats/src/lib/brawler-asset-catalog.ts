import { appPath } from "./paths.ts";
import {
  isStrictLocalAssetUrl,
  localViewerAsset,
  type AnimationEntry,
  type BrawlerSkinManifest,
  type ScMaterialMetadata,
  type ScMaterialSlot,
  type StencilUvPolicy,
  type ViewerAssetGroup,
  type ViewerAsset,
} from "./brawler-viewer-contract.ts";

type CatalogAsset =
  | { readonly kind: "ready"; readonly url: string }
  | { readonly kind: "unavailable"; readonly reason?: string };

type CatalogAnimation = {
  readonly symbol: string | null;
  readonly exported: CatalogAsset;
  readonly label: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly fps: number;
  readonly speed?: number;
  readonly faceField?: string | null;
};

type CatalogFace = {
  readonly symbol: string | null;
  readonly resolved: boolean;
  readonly ready: boolean;
  readonly atlas: CatalogAsset;
  readonly binary: CatalogAsset;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly fps: number;
};

type CatalogCapability = { readonly kind: "postprocess"; readonly enabled: boolean };

type CatalogMaterialSlot = {
  readonly materialName: string;
  readonly diffuse?: boolean;
  readonly ambient?: boolean;
  readonly lightmapDiffuse?: boolean;
  readonly specular?: boolean;
  readonly opacity?: number;
  readonly stencil?: boolean;
  readonly stencilUvPolicy?: StencilUvPolicy;
  readonly uvSource?: ScMaterialMetadata["uvSource"];
  readonly diffuseTexture?: CatalogAsset;
  readonly diffuseLightmap?: CatalogAsset;
  readonly specularLightmap?: CatalogAsset;
  readonly stencilTexture?: CatalogAsset;
};

export const BRAWLER_ASSET_CATALOG_PATH = "/assets/brawlers/3d/catalog.json";
const BRAWLER_ASSET_CATALOG_REVISION = "2";

export function brawlerAssetCatalogUrl(): string {
  return appPath(`${BRAWLER_ASSET_CATALOG_PATH}?v=${BRAWLER_ASSET_CATALOG_REVISION}`);
}

export type BrawlerAssetCatalogEntry = {
  readonly brawlerId: number | null;
  readonly skinId: string;
  readonly character: string;
  readonly displayName?: string;
  readonly publicCharacter: string | null;
  readonly assetGroup: ViewerAssetGroup;
  readonly released: boolean;
  readonly baseModel: CatalogAsset;
  readonly diffuseTexture: CatalogAsset;
  readonly animations: Readonly<Record<string, CatalogAnimation>>;
  readonly faces: Readonly<Record<string, CatalogFace>>;
  readonly capabilities?: { readonly outline?: CatalogCapability };
  readonly materialSlots?: readonly CatalogMaterialSlot[];
  readonly cameraScale: number;
  readonly faceFlags?: {
    readonly faceCoversWholeTexture?: string | null;
    readonly faceScaledUpTexture?: string | null;
    readonly disableHeadRotation?: string | null;
  };
};

export type BrawlerAssetCatalog = {
  readonly schemaVersion: number;
  readonly defaults: readonly BrawlerAssetCatalogEntry[];
  readonly releasedSkins: readonly BrawlerAssetCatalogEntry[];
  readonly skins: readonly BrawlerAssetCatalogEntry[];
};

/** Share in-flight catalog loads, but never poison retries with a rejected promise. */
export function createBrawlerAssetCatalogRequestCache(
  load: (brawlerId: number) => Promise<BrawlerAssetCatalog>,
): (brawlerId: number) => Promise<BrawlerAssetCatalog> {
  const requests = new Map<number, Promise<BrawlerAssetCatalog>>();
  return (brawlerId) => {
    const existing = requests.get(brawlerId);
    if (existing) return existing;
    const request = load(brawlerId);
    requests.set(brawlerId, request);
    void request.catch(() => {
      if (requests.get(brawlerId) === request) requests.delete(brawlerId);
    });
    return request;
  };
}

type BrawlerAssetCatalogIndex = {
  readonly schemaVersion: 1;
  readonly kind: "index";
  readonly brawlers: readonly { readonly brawlerId: number; readonly shard: string }[];
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("brawler asset catalog must contain objects");
  return value as Record<string, unknown>;
}

function catalogAsset(value: unknown): CatalogAsset {
  const source = record(value);
  if (source.kind === "ready" && typeof source.url === "string" && isStrictLocalAssetUrl(source.url)) return { kind: "ready", url: source.url };
  if (source.kind === "unavailable") return { kind: "unavailable", reason: typeof source.reason === "string" ? source.reason : "not-captured" };
  throw new Error("catalog asset must be a strict same-origin asset or unavailable marker");
}

function materialUvSource(value: unknown): ScMaterialMetadata["uvSource"] {
  switch (value) {
    case "KHR_texture_transform":
    case "COLLADA2GLTF":
    case "67/68":
    case "default":
      return value;
    default:
      return undefined;
  }
}

function stencilPolicy(value: unknown): StencilUvPolicy | undefined {
  switch (value) {
    case "flip-y":
    case "identity":
    case "2x-flip-y":
    case "2x-identity":
      return value;
    default:
      return undefined;
  }
}

function catalogAssetGroup(source: Record<string, unknown>): ViewerAssetGroup {
  if (source.assetGroup === "reference-bridge") return "reference-bridge";
  if (source.assetGroup === "pinned-local") return "pinned-local";
  const metadata = source.source;
  if (typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) && record(metadata).referenceBridge === true) return "reference-bridge";
  return "pinned-local";
}

function optionalAsset(source: Record<string, unknown>, key: string): CatalogAsset | undefined {
  return source[key] === undefined ? undefined : catalogAsset(source[key]);
}

function catalogMaterialSlot(value: unknown): CatalogMaterialSlot {
  const source = record(value);
  if (typeof source.materialName !== "string" || source.materialName.length === 0) throw new Error("catalog material slot is missing its name");
  return {
    materialName: source.materialName,
    diffuse: typeof source.diffuse === "boolean" ? source.diffuse : undefined,
    ambient: typeof source.ambient === "boolean" ? source.ambient : undefined,
    lightmapDiffuse: typeof source.lightmapDiffuse === "boolean" ? source.lightmapDiffuse : undefined,
    specular: typeof source.specular === "boolean" ? source.specular : undefined,
    opacity: typeof source.opacity === "number" && Number.isFinite(source.opacity) ? source.opacity : undefined,
    stencil: typeof source.stencil === "boolean" ? source.stencil : undefined,
    stencilUvPolicy: stencilPolicy(source.stencilUvPolicy),
    uvSource: materialUvSource(source.uvSource),
    diffuseTexture: optionalAsset(source, "diffuseTexture"),
    diffuseLightmap: optionalAsset(source, "diffuseLightmap"),
    specularLightmap: optionalAsset(source, "specularLightmap"),
    stencilTexture: optionalAsset(source, "stencilTexture"),
  };
}

function catalogEntry(value: unknown): BrawlerAssetCatalogEntry {
  const source = record(value);
  if (typeof source.skinId !== "string" || typeof source.character !== "string") throw new Error("catalog skin entry is missing its identity");
  const animations = record(source.animations);
  const faces = record(source.faces);
  return {
    brawlerId: typeof source.brawlerId === "number" ? source.brawlerId : null,
    skinId: source.skinId,
    character: source.character,
    displayName: typeof source.displayName === "string" ? source.displayName : undefined,
    publicCharacter: typeof source.publicCharacter === "string" ? source.publicCharacter : null,
    assetGroup: catalogAssetGroup(source),
    released: source.released === true,
    baseModel: catalogAsset(source.baseModel),
    diffuseTexture: catalogAsset(source.diffuseTexture),
    animations: Object.fromEntries(Object.entries(animations).map(([key, value]) => {
      const animation = record(value);
      const frameStart = typeof animation.startFrame === "number" && Number.isFinite(animation.startFrame) ? animation.startFrame : 0;
      const frameEnd = typeof animation.endFrame === "number" && Number.isFinite(animation.endFrame) ? animation.endFrame : -1;
      const fps = typeof animation.fps === "number" && Number.isFinite(animation.fps) && animation.fps > 0 ? animation.fps : 60;
      const speed = animation.speed === undefined ? 1 : animation.speed;
      if (typeof speed !== "number" || !Number.isFinite(speed) || speed <= 0) throw new Error("animation speed must be a positive finite multiplier");
      const faceField = animation.faceField;
      if (faceField !== undefined && faceField !== null && typeof faceField !== "string") throw new Error("animation face association must be a field name or null");
      return [key, { symbol: typeof animation.symbol === "string" ? animation.symbol : null, exported: catalogAsset(animation.exported), label: typeof animation.label === "string" ? animation.label : key, startFrame: frameStart, endFrame: frameEnd, fps, speed, faceField }];
    })),
    faces: Object.fromEntries(Object.entries(faces).map(([key, value]) => {
      const face = record(value);
      const frameStart = typeof face.startFrame === "number" && Number.isFinite(face.startFrame) ? face.startFrame : 0;
      const frameEnd = typeof face.endFrame === "number" && Number.isFinite(face.endFrame) ? face.endFrame : -1;
      const fps = typeof face.fps === "number" && Number.isFinite(face.fps) && face.fps > 0 ? face.fps : 60;
      const atlas = catalogAsset(face.atlas);
      const binary = catalogAsset(face.binary);
      if (atlas.kind === "ready" && !atlas.url.toLowerCase().endsWith(".png")) throw new Error("face atlas must be a PNG asset");
      if (binary.kind === "ready" && !binary.url.toLowerCase().endsWith(".bin")) throw new Error("face binary must be a .bin asset");
      return [key, { symbol: typeof face.symbol === "string" ? face.symbol : null, resolved: face.resolved === true, ready: face.ready === true && atlas.kind === "ready" && binary.kind === "ready", atlas, binary, startFrame: frameStart, endFrame: frameEnd, fps }];
    })),
    capabilities: typeof source.capabilities === "object" && source.capabilities !== null ? { outline: typeof record(source.capabilities).outline === "object" && record(source.capabilities).outline !== null ? { kind: "postprocess", enabled: record(record(source.capabilities).outline).enabled === true } : undefined } : undefined,
    materialSlots: Array.isArray(source.materialSlots) ? source.materialSlots.map(catalogMaterialSlot) : undefined,
    cameraScale: typeof source.cameraScale === "number" && Number.isFinite(source.cameraScale) ? source.cameraScale : 1,
    faceFlags: typeof source.faceFlags === "object" && source.faceFlags !== null ? {
      faceCoversWholeTexture: typeof record(source.faceFlags).faceCoversWholeTexture === "string" ? record(source.faceFlags).faceCoversWholeTexture as string : null,
      faceScaledUpTexture: typeof record(source.faceFlags).faceScaledUpTexture === "string" ? record(source.faceFlags).faceScaledUpTexture as string : null,
      disableHeadRotation: typeof record(source.faceFlags).disableHeadRotation === "string" ? record(source.faceFlags).disableHeadRotation as string : null,
    } : undefined,
  };
}

export function parseBrawlerAssetCatalog(value: unknown): BrawlerAssetCatalog {
  const source = record(value);
  if (source.schemaVersion !== 1) throw new Error("unsupported brawler asset catalog schema");
  const defaults = Array.isArray(source.defaults) ? source.defaults.map(catalogEntry) : [];
  const releasedSkins = Array.isArray(source.releasedSkins) ? source.releasedSkins.map(catalogEntry) : [];
  const skins = Array.isArray(source.skins) ? source.skins.map(catalogEntry) : [];
  return { schemaVersion: 1, defaults, releasedSkins, skins };
}

function parseBrawlerAssetCatalogIndex(value: unknown): BrawlerAssetCatalogIndex {
  const source = record(value);
  if (source.schemaVersion !== 1 || source.kind !== "index" || !Array.isArray(source.brawlers)) throw new Error("unsupported brawler asset catalog index");
  const brawlers = source.brawlers.map((value) => {
    const brawler = record(value);
    if (typeof brawler.brawlerId !== "number" || !Number.isSafeInteger(brawler.brawlerId) || typeof brawler.shard !== "string" || !isStrictLocalAssetUrl(brawler.shard)) throw new Error("catalog index contains an invalid shard");
    return { brawlerId: brawler.brawlerId, shard: brawler.shard };
  });
  return { schemaVersion: 1, kind: "index", brawlers };
}

async function fetchCatalogJson(url: string): Promise<unknown> {
  if (!isStrictLocalAssetUrl(url)) throw new Error("brawler asset catalog must be loaded from a same-origin path");
  // Callers may pass either the source path or the already-resolved app path
  // returned by brawlerAssetCatalogUrl(). Avoid applying BASE_URL twice in a
  // unified build while keeping the public loader convenient for raw paths.
  const baseUrl = import.meta.env?.BASE_URL ?? "/";
  const resolvedUrl = baseUrl !== "/" && url.startsWith(baseUrl) ? url : appPath(url);
  const response = await fetch(resolvedUrl);
  if (!response.ok) throw new Error(`brawler asset catalog request failed: ${response.status}`);
  return await response.json() as unknown;
}

export async function loadBrawlerAssetCatalog(url: string, brawlerId?: number): Promise<BrawlerAssetCatalog> {
  const value = await fetchCatalogJson(url);
  const source = record(value);
  if (source.kind !== "index") return parseBrawlerAssetCatalog(value);
  if (brawlerId === undefined || !Number.isSafeInteger(brawlerId)) throw new Error("brawler ID is required for a sharded asset catalog");
  const index = parseBrawlerAssetCatalogIndex(value);
  const shard = index.brawlers.find((candidate) => candidate.brawlerId === brawlerId);
  if (!shard) return { schemaVersion: 1, defaults: [], releasedSkins: [], skins: [] };
  return parseBrawlerAssetCatalog(await fetchCatalogJson(shard.shard));
}

function viewerAsset(asset: CatalogAsset): ViewerAsset {
  return asset.kind === "ready" ? localViewerAsset(asset.url) : { kind: "unavailable", reason: "not-captured" };
}

function viewerMaterialSlot(source: CatalogMaterialSlot, assetGroup: ViewerAssetGroup): ScMaterialSlot {
  return {
    materialName: source.materialName,
    diffuse: source.diffuse,
    ambient: source.ambient,
    lightmapDiffuse: source.lightmapDiffuse,
    specular: source.specular,
    opacity: source.opacity,
    stencil: source.stencil,
    // The mirrored reference viewer's default stencil sampler flips the
    // render-target Y axis; keep that contract explicit for every bridged
    // skin unless its material metadata overrides it.
    stencilUvPolicy: source.stencilUvPolicy ?? (assetGroup === "reference-bridge" ? "flip-y" : "2x-flip-y"),
    uvSource: source.uvSource,
    ...(source.diffuseTexture === undefined ? {} : { diffuseTexture: viewerAsset(source.diffuseTexture) }),
    ...(source.diffuseLightmap === undefined ? {} : { diffuseLightmap: viewerAsset(source.diffuseLightmap) }),
    ...(source.specularLightmap === undefined ? {} : { specularLightmap: viewerAsset(source.specularLightmap) }),
    ...(source.stencilTexture === undefined ? {} : { stencilTexture: viewerAsset(source.stencilTexture) }),
  };
}

const faceFieldForAnimation: Readonly<Record<string, string>> = {
  IdleAnim: "IdleFace", WalkAnim: "WalkFace", HappyAnim: "HappyFace", HappyLoopAnim: "HappyLoopFace", SadAnim: "SadFace", SadLoopAnim: "SadLoopFace",
  LobbyAnim: "LobbyFace", LobbyLoopAnim: "LobbyLoopFace", HeroScreenIdleAnim: "HeroScreenIdleFace", HeroScreenAnim: "HeroScreenFace", HeroScreenLoopAnim: "HeroScreenLoopFace",
  SignatureAnim: "SignatureFace", ProfileAnim: "ProfileFace", IntroAnim: "IntroFace",
};

export function catalogEntryToViewerManifest(entry: BrawlerAssetCatalogEntry): BrawlerSkinManifest | undefined {
  if (entry.brawlerId === null || entry.baseModel.kind !== "ready" || entry.diffuseTexture.kind !== "ready") return undefined;
  const animations: Record<string, AnimationEntry> = {};
  for (const [key, source] of Object.entries(entry.animations)) {
    if (source.exported.kind !== "ready") continue;
    // New exports declare the source association. Only older catalogs use the
    // fixed role mapping; null explicitly opts out of any face animation.
    const faceField = source.faceField === undefined ? faceFieldForAnimation[key] : source.faceField;
    const face = faceField ? entry.faces[faceField] : undefined;
    const faceAtlas = face?.atlas ?? { kind: "unavailable" as const, reason: "not-captured" as const };
    const faceBinary = face?.binary ?? { kind: "unavailable" as const, reason: "not-captured" as const };
    // The body animation window controls the loop clock. Face start/end
    // metadata describes the native face export, but the reference viewer
    // resets that export when the selected body clip loops.
    animations[key] = [viewerAsset(source.exported), viewerAsset(faceAtlas), viewerAsset(faceBinary), source.startFrame, source.endFrame, source.label, source.fps, face?.fps ?? source.fps, source.speed ?? 1];
  }
  const faceAvailable = Object.values(entry.faces).some((face) => face.ready && face.resolved && face.atlas.kind === "ready" && face.binary.kind === "ready");
  return {
    brawlerId: entry.brawlerId,
    skinId: entry.skinId,
    baseModel: viewerAsset(entry.baseModel),
    diffuseTexture: viewerAsset(entry.diffuseTexture),
    animations,
    face: faceAvailable ? { kind: "available" } : { kind: "unavailable", reason: "not-captured" },
    outline: entry.capabilities?.outline?.enabled ? { kind: "available" } : { kind: "unavailable", reason: "not-captured" },
    cameraScale: entry.cameraScale,
    attachments: {},
    assetGroup: entry.assetGroup,
    materialSlots: entry.materialSlots?.map((slot) => viewerMaterialSlot(slot, entry.assetGroup)),
    faceFlags: {
      coversWholeTexture: entry.faceFlags?.faceCoversWholeTexture === "true",
      scaledUpTexture: entry.faceFlags?.faceScaledUpTexture === "true",
    },
  };
}

export function catalogAnimationKeys(entry: BrawlerAssetCatalogEntry): readonly string[] {
  return Object.entries(entry.animations).filter(([, animation]) => animation.exported.kind === "ready").map(([key]) => key);
}

export type CatalogAnimationOption = { readonly key: string; readonly label: string };

/** Keep the machine key for loading while presenting the source catalog label in the UI. */
export function catalogAnimationOptions(entry: BrawlerAssetCatalogEntry): readonly CatalogAnimationOption[] {
  return Object.entries(entry.animations)
    .filter(([, animation]) => animation.exported.kind === "ready")
    .map(([key, animation]) => ({ key, label: animation.label }));
}

/** Return catalog records for one stable game brawler ID, default skin first. */
export function catalogEntriesForBrawler(catalog: BrawlerAssetCatalog, brawlerId: number): readonly BrawlerAssetCatalogEntry[] {
  const entries = [...catalog.defaults, ...catalog.releasedSkins, ...catalog.skins]
    .filter((entry) => entry.brawlerId === brawlerId);
  const bySkin = new Map<string, BrawlerAssetCatalogEntry>();
  for (const entry of entries) {
    const existing = bySkin.get(entry.skinId);
    if (!existing || (!catalogEntryHasRuntime(existing) && catalogEntryHasRuntime(entry))) bySkin.set(entry.skinId, entry);
  }
  return [...bySkin.values()];
}

/** A selector must never advertise a skin that cannot load a complete local model. */
export function catalogEntryHasRuntime(entry: BrawlerAssetCatalogEntry): boolean {
  return entry.baseModel.kind === "ready" && entry.diffuseTexture.kind === "ready" && catalogAnimationKeys(entry).length > 0;
}

export function catalogEntryLabel(entry: BrawlerAssetCatalogEntry): string {
  if (entry.displayName) return entry.displayName;
  return entry.skinId === entry.character || entry.skinId.toLowerCase().includes("default")
    ? `${entry.character} (Default)`
    : entry.skinId;
}

export type CatalogViewerSelection = {
  readonly entries: readonly BrawlerAssetCatalogEntry[];
  readonly selectedEntry: BrawlerAssetCatalogEntry | undefined;
  readonly animationOptions: readonly CatalogAnimationOption[];
  readonly activeAnimation: string | undefined;
};

/** Resolve UI selections by stable IDs/keys, while filtering to complete local runtime entries. */
export function selectCatalogViewerEntry(
  catalog: BrawlerAssetCatalog | undefined,
  brawlerId: number,
  selectedSkin: string | undefined,
  selectedAnimation: string | undefined,
): CatalogViewerSelection {
  const entries = catalog ? catalogEntriesForBrawler(catalog, brawlerId).filter(catalogEntryHasRuntime) : [];
  const selectedEntry = entries.find((entry) => entry.skinId === selectedSkin) ?? entries[0];
  const animationOptions = selectedEntry ? catalogAnimationOptions(selectedEntry) : [];
  const activeAnimation = animationOptions.some((option) => option.key === selectedAnimation)
    ? selectedAnimation
    : animationOptions[0]?.key;
  return { entries, selectedEntry, animationOptions, activeAnimation };
}
