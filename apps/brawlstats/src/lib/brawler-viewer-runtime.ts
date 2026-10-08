import * as THREE from "three";
import {
  type AnimationEntry,
  type BrawlerSkinManifest,
  type ScMaterialMetadata,
  type ScMaterialSlot,
  attachNamedObjects,
  configureDiffuseTexture,
  configureFaceTexture,
  configureLinearTexture,
  createFaceRenderTarget,
  createOutlineMaterial,
  decodeFaceBinary,
  mergeAnimationHierarchy,
  rebindSkinnedMeshes,
  removeRenderableAnimationNodes,
  retargetAnimationClip,
  isStrictLocalAssetUrl,
  ReferenceBoneSynchronizer,
  viewerPlaybackWindow,
  shouldPreserveReferenceRotation,
} from "./brawler-viewer-contract.ts";
import { createScMaterial, faceRenderTargetUvTransform } from "./sc-material.ts";
import { appPath } from "./paths.ts";

export type LoadedModel = {
  readonly scene: THREE.Object3D;
  readonly animations: readonly THREE.AnimationClip[];
};

/** Keep indexed primitives independent of unused vertices from other bone palettes. */
export function compactReferenceGeometry(model: LoadedModel): number {
  const compacted = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  model.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const source: THREE.BufferGeometry = object.geometry;
    const existing = compacted.get(source);
    if (existing) { object.geometry = existing; return; }
    const index = source.index;
    const position = source.getAttribute("position");
    if (!index || !position) return;
    const used = [...new Set(Array.from(index.array))];
    if (used.some((vertex) => !Number.isSafeInteger(vertex) || vertex < 0 || vertex >= position.count)) throw new Error("reference mesh index is outside its vertex buffer");
    if (used.length === position.count) return;
    const remap = new Map(used.map((vertex, compactIndex) => [vertex, compactIndex]));
    const copyAttribute = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute => {
      if (attribute.count !== position.count) throw new Error("reference mesh attributes have inconsistent vertex counts");
      const interleaved = attribute instanceof THREE.InterleavedBufferAttribute;
      const original = interleaved ? attribute.data.array : attribute.array;
      const array = original.slice(0, used.length * attribute.itemSize);
      const stride = interleaved ? attribute.data.stride : attribute.itemSize;
      const offset = interleaved ? attribute.offset : 0;
      for (let target = 0; target < used.length; target++) for (let component = 0; component < attribute.itemSize; component++) {
        array[target * attribute.itemSize + component] = original[used[target] * stride + offset + component];
      }
      const result = new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized);
      result.name = attribute.name;
      result.setUsage(interleaved ? attribute.data.usage : attribute.usage);
      if (attribute instanceof THREE.BufferAttribute) result.gpuType = attribute.gpuType;
      return result;
    };
    const geometry = source.clone();
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, copyAttribute(attribute));
    if (Object.keys(source.morphAttributes).some((name) => !["position", "normal", "color"].includes(name))) throw new Error("reference mesh has an unsupported morph attribute");
    for (const name of ["position", "normal", "color"] as const) {
      const attributes = source.morphAttributes[name];
      if (attributes) geometry.morphAttributes[name] = attributes.map(copyAttribute);
    }
    geometry.setIndex(Array.from(index.array, (vertex) => {
      const result = remap.get(vertex);
      if (result === undefined) throw new Error("reference index remapping failed");
      return result;
    }));
    geometry.boundingBox = null;
    geometry.boundingSphere = null;
    compacted.set(source, geometry);
    object.geometry = geometry;
  });
  return compacted.size;
}

/** Repair mirrored reference rotations in memory, without rewriting source assets. */
export function normalizeReferenceModelRotations(model: LoadedModel, preserveNodeNames: ReadonlySet<string> = new Set()): {
  readonly normalizedNodeCount: number;
  readonly normalizedSampleCount: number;
  readonly maximumNormDeviation: number;
} {
  let normalizedNodeCount = 0;
  let normalizedSampleCount = 0;
  let maximumNormDeviation = 0;
  const rotationNorm = (values: readonly number[], label: string): number => {
    const norm = Math.hypot(...values);
    if (!Number.isFinite(norm) || norm === 0) throw new Error(`reference rotation is zero or non-finite: ${label}`);
    maximumNormDeviation = Math.max(maximumNormDeviation, Math.abs(norm - 1));
    return norm;
  };
  model.scene.traverse((node) => {
    if (node.scale.x === 0 && node.scale.y === 0 && node.scale.z === 0 && node.position.toArray().every(Number.isFinite)) {
      // A fully collapsed transform has no observable orientation. Three's
      // decomposition of its zero-scale matrix can produce NaN quaternions.
      // Identity preserves the exact collapsed transform and its translation.
      if (!node.quaternion.equals(new THREE.Quaternion())) {
        node.quaternion.identity();
        node.updateMatrix();
        normalizedNodeCount += 1;
      }
      return;
    }
    const norm = rotationNorm(node.quaternion.toArray(), node.name);
    if (preserveNodeNames.has(node.name)) return;
    if (Math.abs(norm - 1) <= 1e-6) return;
    const { x, y, z, w } = node.quaternion;
    node.quaternion.set(x / norm, y / norm, z / norm, w / norm);
    node.updateMatrix();
    normalizedNodeCount += 1;
  });
  for (const clip of model.animations) for (const track of clip.tracks) {
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue;
    // glTF cubic rotation accessors interleave incoming tangent, value, outgoing
    // tangent. Tangents are derivatives and must never be normalized as rotations.
    const factory = "createInterpolant" in track ? track.createInterpolant : undefined;
    const cubic = typeof factory === "function" && "isInterpolantFactoryMethodGLTFCubicSpline" in factory && factory.isInterpolantFactoryMethodGLTFCubicSpline === true;
    const stride = cubic ? 12 : 4;
    if (track.getValueSize() !== stride || track.times.length === 0) throw new Error(`reference rotation track has an invalid shape: ${track.name}`);
    if (!Array.from(track.values).every(Number.isFinite)) throw new Error(`reference rotation is zero or non-finite: ${track.name}`);
    for (let offset = cubic ? 4 : 0; offset < track.values.length; offset += stride) {
      const norm = rotationNorm(Array.from(track.values.slice(offset, offset + 4)), track.name);
      if (preserveNodeNames.has(track.name.slice(0, track.name.lastIndexOf(".")))) continue;
      if (Math.abs(norm - 1) <= 1e-6) continue;
      const interpolation = track.getInterpolation();
      if (cubic || (interpolation !== THREE.InterpolateLinear && interpolation !== THREE.InterpolateDiscrete)) {
        throw new Error(`reference non-unit rotation uses unsupported interpolation: ${track.name}`);
      }
      for (let component = 0; component < 4; component += 1) track.values[offset + component] /= norm;
      normalizedSampleCount += 1;
    }
  }
  return { normalizedNodeCount, normalizedSampleCount, maximumNormDeviation };
}

export type ViewerRuntimeLoader = {
  readonly loadModel: (url: string) => Promise<LoadedModel>;
  readonly loadTexture: (url: string) => Promise<THREE.Texture>;
  readonly loadBinary: (url: string) => Promise<ArrayBuffer>;
};

export type ViewerRenderer = {
  readonly domElement: { readonly width: number; readonly height: number };
  readonly getRenderTarget?: () => THREE.WebGLRenderTarget | null;
  setRenderTarget(target: THREE.WebGLRenderTarget | null): void;
  setClearAlpha(alpha: number): void;
  getClearAlpha(): number;
  clear(): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
};

export type ViewerRuntimeState = {
  readonly animationKey: string | undefined;
  readonly playing: boolean;
  readonly faceEnabled: boolean;
  readonly outlineEnabled: boolean;
  readonly faceFrame: number;
};

/** Use the game's hero-screen pair when captured; older packages only have a win and idle pair. */
export function selectHomeAnimationSequence(animations: Readonly<Record<string, AnimationEntry>>): { readonly start: string; readonly loop: string } | undefined {
  if (animations.HeroScreenAnim?.[0].kind === "ready" && animations.HeroScreenLoopAnim?.[0].kind === "ready") return { start: "HeroScreenAnim", loop: "HeroScreenLoopAnim" };
  if (animations.HappyAnim?.[0].kind === "ready" && animations.IdleAnim?.[0].kind === "ready") return { start: "HappyAnim", loop: "IdleAnim" };
  return undefined;
}

/** Center the sampled animation envelope, retaining every pose for camera fitting. */
export function centerModelForFraming(root: THREE.Object3D, sampledBounds: THREE.Box3): {
  readonly wrapper: THREE.Group;
  readonly bounds: THREE.Box3;
  readonly largestDimension: number;
} {
  const size = sampledBounds.getSize(new THREE.Vector3());
  const largestDimension = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(largestDimension) || largestDimension <= 0) throw new Error("model has invalid dimensions");
  const wrapper = new THREE.Group();
  wrapper.add(root);
  wrapper.position.copy(sampledBounds.getCenter(new THREE.Vector3())).multiplyScalar(-1);
  wrapper.updateMatrixWorld(true);
  return { wrapper, bounds: sampledBounds.clone().applyMatrix4(wrapper.matrixWorld), largestDimension };
}

/** Measure a perspective fit without moving the camera that is rendering the current frame. */
export function fitPerspectiveCameraDistance(camera: THREE.PerspectiveCamera, bounds: THREE.Box3, direction: THREE.Vector3): number {
  const corners: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const probe = camera.clone();
  probe.position.copy(direction);
  probe.lookAt(0, 0, 0);
  probe.updateMatrixWorld(true);
  const vertical = Math.tan(THREE.MathUtils.degToRad(probe.fov / 2));
  const horizontal = vertical * probe.aspect;
  return corners.reduce((required, corner) => {
    const view = probe.worldToLocal(corner.clone());
    return Math.max(required, 1 + view.z + Math.abs(view.y) / vertical, 1 + view.z + Math.abs(view.x) / horizontal);
  }, 1) * 1.08;
}

/** Include ordinary intro motion while rescuing a jump from a distant staged prop. */
export function startupFramingBounds(loopBounds: THREE.Box3, introBounds: THREE.Box3): THREE.Box3 {
  const combined = loopBounds.clone().union(introBounds);
  const loopSize = loopBounds.getSize(new THREE.Vector3());
  const combinedSize = combined.getSize(new THREE.Vector3());
  if (combinedSize.x <= loopSize.x * 1.8 && combinedSize.y <= loopSize.y * 1.8 && combinedSize.z <= loopSize.z * 1.8) return combined;
  // A high jump can be real even when a thrown prop makes the lateral envelope
  // unusable. Keep only that upward motion; the rest of the camera fit stays
  // anchored to the resting character instead of the distant prop.
  const upward = introBounds.max.y - loopBounds.max.y;
  if (upward > loopSize.y * 0.65 && upward <= loopSize.y) {
    const fitted = loopBounds.clone();
    // A thrown prop can approach the camera while rising. Leave extra room
    // above its sampled world-space height for that perspective projection.
    fitted.max.y = introBounds.max.y + loopSize.y * 0.3;
    return fitted;
  }
  return loopBounds.clone();
}

function assetUrl(asset: { readonly kind: "ready"; readonly url: string }): string {
  if (!isStrictLocalAssetUrl(asset.url)) throw new Error("viewer runtime accepts same-origin assets only");
  return asset.url;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      material.dispose();
    });
  });
}

function boundsForObject(root: THREE.Object3D): THREE.Box3 {
  try {
    return new THREE.Box3().setFromObject(root, true);
  } catch {
    // A malformed skin skeleton should not prevent the PNG/runtime fallback
    // from rendering; the non-precise bounds path remains a safe fallback.
    return new THREE.Box3().setFromObject(root);
  }
}

function framingMeshes(root: THREE.Object3D): readonly THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    for (let parent = object.parent; parent; parent = parent.parent) if (!parent.visible) return;
    meshes.push(object);
  });
  if (meshes.length < 3) return meshes;
  const samples = meshes.map((mesh) => {
    const bounds = boundsForObject(mesh);
    return { mesh, bounds, center: bounds.getCenter(new THREE.Vector3()), extent: bounds.getSize(new THREE.Vector3()).length() };
  });
  const median = (values: readonly number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  // Tiny staged props must not pull the cluster center away from the body.
  // Chester has more offstage candy pieces than substantial body meshes.
  const largestExtent = Math.max(...samples.map((sample) => sample.extent));
  const substantial = samples.filter((sample) => sample.extent >= largestExtent * 0.1);
  const core = substantial.length >= 2 ? substantial : samples;
  const center = new THREE.Vector3(median(core.map((sample) => sample.center.x)), median(core.map((sample) => sample.center.y)), median(core.map((sample) => sample.center.z)));
  const extents = core.map((sample) => sample.extent).sort((a, b) => a - b);
  const characterExtent = extents[Math.floor((extents.length - 1) * 0.75)];
  const focusedCore = core.filter((sample) => Math.max(Math.abs(sample.center.x - center.x), Math.abs(sample.center.y - center.y), Math.abs(sample.center.z - center.z)) <= characterExtent * 1.75);
  const bodyBounds = new THREE.Box3();
  for (const sample of focusedCore) bodyBounds.union(sample.bounds);
  const margin = bodyBounds.getSize(new THREE.Vector3()).length() * 0.1;
  const nearby = bodyBounds.clone().expandByScalar(margin);
  const focused = samples.filter((sample) => focusedCore.includes(sample) || (!core.includes(sample) && nearby.containsPoint(sample.center))).map((sample) => sample.mesh);
  return focused.length ? focused : meshes;
}

function boundsForMeshes(meshes: readonly THREE.Mesh[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const mesh of meshes) bounds.union(boundsForObject(mesh));
  return bounds;
}

// Jester's source hero clips park unused candy, sad-ball, and surprise-box
// parts below the character at 0.1 scale. Our closer viewer camera exposes
// those storage meshes as specks along the bottom edge.
const JESTER_HERO_STAGED_MESHES = new Set([
  "mesh_0", "mesh_0_1",
  "goodCandy1_GEO", "goodCandy2_GEO", "goodCandy3_GEO",
  "badCandy1_GEO", "badCandy2_GEO", "badCandy3_GEO",
  "glove_GEO", "box_lid_GEO", "mesh_13", "mesh_13_1", "arm_GEO",
]);

type BoneEffectFrame = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly offsetX: number; readonly offsetY: number } | null;
type BoneEffectAtlas = { readonly fps: number; readonly atlasWidth: number; readonly atlasHeight: number; readonly frames: readonly BoneEffectFrame[] };
type BoneEffectSpec = { readonly bone: string; readonly atlas: string; readonly frames: string; readonly worldUnitsPerPixel: number; readonly localOffset: readonly [number, number, number] };

// BoneEffect1/BoneEffectUse1=always in the pinned v69 skin configuration.
// Other skins can supply the same source-backed fields after their FX exports
// have been checked; do not infer effects from the presence of a bone alone.
const ALWAYS_BONE_EFFECTS: Readonly<Record<string, BoneEffectSpec>> = {
  "16000109:AttractorDefault": {
    bone: "hand_fx_s",
    atlas: "/images/brawl-effects/cosmo-hand.png",
    frames: "/images/brawl-effects/cosmo-hand.json",
    worldUnitsPerPixel: 0.09,
    // SC's effect pixels are screen-space; this maps the orbit above the palm
    // in the 3D hand socket while retaining the source frame offsets.
    localOffset: [-0.8, -1.3, 0],
  },
};

function parseBoneEffectAtlas(data: ArrayBuffer): BoneEffectAtlas {
  const value: unknown = JSON.parse(new TextDecoder().decode(data));
  if (typeof value !== "object" || value === null) throw new Error("bone effect atlas is invalid");
  const atlas = value as Partial<BoneEffectAtlas>;
  if (!Number.isFinite(atlas.fps) || !Number.isFinite(atlas.atlasWidth) || !Number.isFinite(atlas.atlasHeight) || !Array.isArray(atlas.frames) || atlas.frames.length === 0) throw new Error("bone effect atlas dimensions are invalid");
  if (atlas.fps! <= 0 || atlas.atlasWidth! <= 0 || atlas.atlasHeight! <= 0) throw new Error("bone effect atlas dimensions are invalid");
  for (const frame of atlas.frames) {
    if (frame === null) continue;
    if (typeof frame !== "object" || ![frame.x, frame.y, frame.width, frame.height, frame.offsetX, frame.offsetY].every(Number.isFinite)) throw new Error("bone effect frame is invalid");
    if (frame.width <= 0 || frame.height <= 0 || frame.x < 0 || frame.y < 0 || frame.x + frame.width > atlas.atlasWidth! || frame.y + frame.height > atlas.atlasHeight!) throw new Error("bone effect frame exceeds its atlas");
  }
  return atlas as BoneEffectAtlas;
}

export function applyBoneEffectFrame(sprite: THREE.Sprite, atlas: BoneEffectAtlas, frameIndex: number, worldUnitsPerPixel: number, localOffset: readonly [number, number, number] = [0, 0, 0]): void {
  const frame = atlas.frames[((frameIndex % atlas.frames.length) + atlas.frames.length) % atlas.frames.length];
  sprite.visible = frame !== null;
  if (!frame) return;
  const texture = (sprite.material as THREE.SpriteMaterial).map;
  if (!texture) throw new Error("bone effect sprite has no atlas texture");
  texture.repeat.set(frame.width / atlas.atlasWidth, frame.height / atlas.atlasHeight);
  texture.offset.set(frame.x / atlas.atlasWidth, 1 - (frame.y + frame.height) / atlas.atlasHeight);
  texture.updateMatrix();
  sprite.position.set((frame.offsetX + frame.width / 2) * worldUnitsPerPixel + localOffset[0], -(frame.offsetY + frame.height / 2) * worldUnitsPerPixel + localOffset[1], localOffset[2]);
  sprite.scale.set(frame.width * worldUnitsPerPixel, frame.height * worldUnitsPerPixel, 1);
}

export class BrawlerViewerRuntime {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly faceRoot = new THREE.Group();
  private baseModel: LoadedModel | undefined;
  private animationModel: LoadedModel | undefined;
  private action: THREE.AnimationAction | undefined;
  private faceTexture: THREE.Texture | undefined;
  private faceFrames: ReturnType<typeof decodeFaceBinary> | undefined;
  private faceMesh: THREE.Mesh | undefined;
  private animationRange: readonly [number, number] | undefined;
  private animationFps = 60;
  private bodyLocalTime = 0;
  private completedAnimationCycles = 0;
  private animationDuration = 0;
  private sourceClipDuration = 0;
  private referenceBones: ReferenceBoneSynchronizer | undefined;
  private playbackSpeed = 1;
  private faceFps = 60;
  private referenceFaceTiming = false;
  private readonly baseAttachments: {
    readonly object: THREE.Object3D;
    readonly parent: THREE.Object3D;
    readonly transform: THREE.Matrix4;
  }[] = [];
  private diffuseTexture: THREE.Texture | undefined;
  private readonly faceTarget = createFaceRenderTarget();
  private readonly outlineTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false });
  private readonly outlineOutput = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
  private readonly outlineScene = new THREE.Scene();
  private readonly outlineCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly outlineQuad: THREE.Mesh;
  private readonly stencilBindings = new Map<THREE.Material, { readonly uniform: { value: THREE.Texture | null } }>();
  private readonly textureCache = new Map<string, Promise<THREE.Texture>>();
  private readonly ownedTextures = new Set<THREE.Texture>();
  private readonly suppressedMeshes = new Map<THREE.Mesh, boolean>();
  private boneEffect: { readonly spec: BoneEffectSpec; readonly atlas: BoneEffectAtlas; readonly sprite: THREE.Sprite } | undefined;
  private boneEffectTime = 0;
  private state: ViewerRuntimeState = {
    animationKey: undefined,
    playing: false,
    faceEnabled: false,
    outlineEnabled: false,
    faceFrame: 0,
  };
  private readonly manifest: BrawlerSkinManifest;
  private readonly loader: ViewerRuntimeLoader;
  private disposed = false;

  constructor(manifest: BrawlerSkinManifest, loader: ViewerRuntimeLoader) {
    this.manifest = manifest;
    this.loader = loader;
    if (manifest.baseModel.kind !== "ready") throw new Error("base model is unavailable");
    this.mixer = new THREE.AnimationMixer(this.root);
    this.outlineQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), createOutlineMaterial());
    this.outlineScene.add(this.outlineQuad);
  }

  getState(): ViewerRuntimeState {
    return this.state;
  }

  getCompletedAnimationCycles(): number {
    return this.completedAnimationCycles;
  }

  hasAnimationClip(): boolean {
    return this.action !== undefined && this.animationRange !== undefined;
  }

  getCurrentPoseBounds(): THREE.Box3 {
    this.root.updateMatrixWorld(true);
    return boundsForObject(this.root);
  }

  /**
   * Return bounds that include the selected animation's sampled poses. This is
   * used once during viewer setup so a moving limb or body does not get clipped
   * by a camera fitted only to the bind pose.
   */
  getFramingBounds(): THREE.Box3 {
    this.root.updateMatrixWorld(true);
    const meshes = framingMeshes(this.root);
    const bounds = meshes.length ? boundsForMeshes(meshes) : boundsForObject(this.root);
    const action = this.action;
    const range = this.animationRange;
    if (!action || !range || !Number.isFinite(this.animationFps) || this.animationFps <= 0) return bounds;

    const [startFrame, endFrame] = range;
    const frameCount = Math.max(1, endFrame - startFrame + 1);
    const sampleCount = Math.min(180, Math.max(2, Math.ceil(frameCount)));
    const originalTime = action.time;
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const progress = sampleCount === 1 ? 0 : sample / (sampleCount - 1);
      action.time = (startFrame + (endFrame - startFrame) * progress) / this.animationFps;
      if (this.manifest.assetGroup === "reference-bridge" && this.sourceClipDuration > 0) action.time %= this.sourceClipDuration;
      this.mixer.update(0);
      this.referenceBones?.update();
      this.root.updateMatrixWorld(true);
      bounds.union(meshes.length ? boundsForMeshes(meshes) : boundsForObject(this.root));
    }
    action.time = originalTime;
    this.mixer.update(0);
    this.referenceBones?.update();
    this.root.updateMatrixWorld(true);
    return bounds;
  }

  async loadBase(): Promise<void> {
    this.assertActive();
    const baseAsset = this.manifest.baseModel;
    if (baseAsset.kind !== "ready") throw new Error("base model is unavailable");
    const baseModel = await this.loader.loadModel(assetUrl(baseAsset));
    if (this.disposed) {
      disposeObject(baseModel.scene);
      throw new Error("viewer runtime is disposed");
    }
    this.prepareLoadedModel(baseModel);
    this.baseModel = baseModel;
    if (this.manifest.assetGroup === "reference-bridge") this.referenceBones = new ReferenceBoneSynchronizer(baseModel.scene);
    this.root.add(this.baseModel.scene);
    const effectSpec = ALWAYS_BONE_EFFECTS[`${this.manifest.brawlerId}:${this.manifest.skinId}`];
    if (effectSpec) {
      const [textureResult, dataResult] = await Promise.allSettled([
        this.loader.loadTexture(appPath(effectSpec.atlas)),
        this.loader.loadBinary(appPath(effectSpec.frames)),
      ]);
      const texture = textureResult.status === "fulfilled" ? textureResult.value : undefined;
      if (this.disposed) { texture?.dispose(); throw new Error("viewer runtime is disposed"); }
      try {
        if (textureResult.status === "rejected") throw textureResult.reason;
        if (dataResult.status === "rejected") throw dataResult.reason;
        const atlas = parseBoneEffectAtlas(dataResult.value);
        const effectTexture = textureResult.value;
        effectTexture.colorSpace = THREE.SRGBColorSpace;
        effectTexture.generateMipmaps = false;
        effectTexture.minFilter = THREE.LinearFilter;
        effectTexture.magFilter = THREE.LinearFilter;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: effectTexture, transparent: true, depthTest: false, depthWrite: false }));
        sprite.name = `BoneEffect:${effectSpec.bone}`;
        sprite.renderOrder = 10;
        applyBoneEffectFrame(sprite, atlas, 0, effectSpec.worldUnitsPerPixel, effectSpec.localOffset);
        this.ownedTextures.add(effectTexture);
        this.boneEffect = { spec: effectSpec, atlas, sprite };
      } catch (error) {
        texture?.dispose();
        console.warn(`[BrawlerViewerRuntime] ${this.manifest.brawlerId} bone effect unavailable`, error);
      }
    }
    for (const name of Object.keys(this.manifest.attachments)) {
      const object = baseModel.scene.getObjectByName(name);
      if (!object?.parent) continue;
      object.updateMatrix();
      this.baseAttachments.push({ object, parent: object.parent, transform: object.matrix.clone() });
    }
    const diffuseAsset = this.manifest.diffuseTexture;
    if (diffuseAsset.kind === "ready") {
      this.diffuseTexture = await this.loadTextureAsset(diffuseAsset, "diffuse", configureDiffuseTexture);
      this.assertActive();
      this.applyDiffuseTexture(this.baseModel.scene, this.diffuseTexture);
    }
    if (this.manifest.materialSlots) {
      await this.applyMaterialSpecializations(this.baseModel.scene, this.manifest.materialSlots);
      this.assertActive();
    }
  }

  async selectAnimation(key: string): Promise<void> {
    this.assertActive();
    const entry = this.manifest.animations[key];
    if (!entry) throw new Error(`unknown animation: ${key}`);
    const animationAsset = entry[0];
    if (animationAsset.kind !== "ready") throw new Error(`animation is unavailable: ${key}`);
    if (!this.baseModel) await this.loadBase();
    if (!this.baseModel) throw new Error("base model failed to load");

    for (const [mesh, visible] of this.suppressedMeshes) mesh.visible = visible;
    this.suppressedMeshes.clear();
    this.action?.stop();
    this.referenceBones?.restore();
    this.restoreBaseAttachments();
    this.boneEffect?.sprite.parent?.remove(this.boneEffect.sprite);
    if (this.animationModel) {
      this.mixer.uncacheRoot(this.animationModel.scene);
      this.root.remove(this.animationModel.scene);
      disposeObject(this.animationModel.scene);
    }
    const animationModel = await this.loader.loadModel(assetUrl(animationAsset));
    if (this.disposed) {
      disposeObject(animationModel.scene);
      throw new Error("viewer runtime is disposed");
    }
    this.prepareLoadedModel(animationModel);
    const sourceClip = animationModel.animations[0];
    this.animationModel = animationModel;
    const nodeMap = new Map<string, THREE.Object3D>();
    if (this.referenceBones) {
      this.baseModel.scene.traverse((node) => nodeMap.set(node.name.replaceAll(":", ""), node));
    } else {
      for (const [name, node] of mergeAnimationHierarchy(this.baseModel.scene, this.animationModel.scene)) nodeMap.set(name, node);
      rebindSkinnedMeshes(this.baseModel.scene, nodeMap);
    }
    removeRenderableAnimationNodes(this.animationModel.scene).forEach(disposeObject);
    this.root.add(this.animationModel.scene);
    this.referenceBones?.setAnimation(this.animationModel.scene);
    attachNamedObjects(this.baseModel.scene, nodeMap, this.manifest.attachments);
    if (this.boneEffect) {
      const anchor = nodeMap.get(this.boneEffect.spec.bone);
      if (!anchor) throw new Error(`bone effect anchor is missing: ${this.boneEffect.spec.bone}`);
      anchor.add(this.boneEffect.sprite);
    }
    if (this.manifest.brawlerId === 16000063 && this.manifest.skinId === "JesterDefault" && (key === "HeroScreenAnim" || key === "HeroScreenLoopAnim")) {
      this.baseModel.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !JESTER_HERO_STAGED_MESHES.has(object.name)) return;
        this.suppressedMeshes.set(object, object.visible);
        object.visible = false;
      });
    }
    this.bodyLocalTime = 0;
    this.completedAnimationCycles = 0;
    if (!sourceClip) {
      // Some mirrored packages carry no AnimationClip because the exported
      // scene itself is the authoritative static pose/skeleton. Keep that
      // hierarchy so bind-pose geometry, bones, and named attachments are
      // merged exactly like a clip-bearing package.
      this.action = undefined;
      this.animationRange = undefined;
      await this.loadFace(entry);
      this.state = { ...this.state, animationKey: key, playing: false };
      return;
    }
    const clip = retargetAnimationClip(sourceClip, this.animationModel.scene);
    this.action = this.mixer.clipAction(clip, this.animationModel.scene);
    this.action.play();
    this.animationFps = entry[6] && Number.isFinite(entry[6]) && entry[6] > 0 ? entry[6] : 60;
    this.playbackSpeed = entry[8] ?? 1;
    if (!Number.isFinite(this.playbackSpeed) || this.playbackSpeed <= 0) throw new Error("animation speed must be a positive finite multiplier");
    const window = viewerPlaybackWindow({ assetGroup: this.manifest.assetGroup, startFrame: entry[3], endFrame: entry[4], fps: this.animationFps, clipDuration: sourceClip.duration });
    this.animationDuration = window.duration;
    this.sourceClipDuration = sourceClip.duration;
    const lastClipFrame = sourceClip.duration * this.animationFps;
    this.animationRange = [window.start * this.animationFps, this.manifest.assetGroup === "reference-bridge"
      ? (window.start + window.duration) * this.animationFps
      : Math.max(window.start * this.animationFps, entry[4] < 0 ? lastClipFrame : Math.min(entry[4], lastClipFrame))];
    this.action.time = this.sourceTime(window.start);
    this.mixer.update(0);
    this.referenceBones?.update();
    this.state = { ...this.state, animationKey: key, playing: true };
    await this.loadFace(entry);
    this.faceFps = entry[7] && Number.isFinite(entry[7]) && entry[7] > 0 ? entry[7] : this.animationFps;
  }

  async loadFace(entry: AnimationEntry): Promise<void> {
    this.clearFace();
    if (entry[1].kind !== "ready" || entry[2].kind !== "ready") return;
    this.faceTexture = await this.loadTextureAsset(entry[1], "face", configureFaceTexture);
    this.faceFrames = decodeFaceBinary(await this.loader.loadBinary(assetUrl(entry[2])));
    this.faceFps = entry[7] && Number.isFinite(entry[7]) && entry[7] > 0 ? entry[7] : this.animationFps;
    this.referenceFaceTiming = entry[9] === "reference";
    this.assertActive();
    this.faceMesh = this.createFaceMesh();
    this.faceRoot.add(this.faceMesh);
    this.state = { ...this.state, faceEnabled: true, faceFrame: 0 };
  }

  setPlaying(playing: boolean): void {
    if (!this.action) return;
    this.action.paused = !playing;
    this.state = { ...this.state, playing };
  }

  setFaceEnabled(enabled: boolean): void {
    this.state = { ...this.state, faceEnabled: enabled };
    if (!enabled) this.updateStencilUniforms(null);
    if (this.faceMesh) this.faceMesh.visible = enabled;
  }

  setOutlineEnabled(enabled: boolean): void {
    this.state = { ...this.state, outlineEnabled: enabled };
  }

  renderFace(renderer: ViewerRenderer): THREE.Texture {
    renderer.setRenderTarget(this.faceTarget);
    const clearAlpha = renderer.getClearAlpha();
    // The face texture is also the stencil mask for the body. Clearing it
    // with an opaque alpha turns every body pixel into a stencil pixel and
    // replaces the diffuse skin with the dark background.
    renderer.setClearAlpha(0);
    renderer.clear();
    renderer.render(this.faceRoot, this.outlineCamera);
    renderer.setClearAlpha(clearAlpha);
    renderer.setRenderTarget(null);
    this.bindStencilTexture(this.faceTarget.texture);
    return this.faceTarget.texture;
  }

  renderOutline(renderer: ViewerRenderer, camera: THREE.Camera, renderRoot: THREE.Object3D = this.root): THREE.Texture {
    const previousRenderTarget = renderer.getRenderTarget?.() ?? null;
    const width = Math.max(renderer.domElement.width, 1);
    const height = Math.max(renderer.domElement.height, 1);
    this.outlineTarget.setSize(width, height);
    this.outlineOutput.setSize(width, height);
    renderer.setRenderTarget(this.outlineTarget);
    renderer.clear();
    // The host viewer may center/scale the runtime root inside a wrapper. Use
    // that transformed wrapper for the mask, otherwise the outline pass is
    // offset from the visible model.
    renderer.render(renderRoot, camera);
    const material = this.outlineQuad.material;
    if (material instanceof THREE.ShaderMaterial) {
      material.uniforms.tDiffuse.value = this.outlineTarget.texture;
      material.uniforms.u_resolution.value.set(width, height);
    }
    renderer.setRenderTarget(this.outlineOutput);
    // The output target is persistent across frames. Clear it before drawing
    // the new outline quad or transparent pixels accumulate as ghost models.
    renderer.clear();
    renderer.render(this.outlineScene, this.outlineCamera);
    renderer.setRenderTarget(null);
    // The host composites the returned texture into the default framebuffer
    // immediately after this call. Clear that framebuffer so its previous
    // composite cannot leak into the next frame.
    renderer.clear();
    renderer.setRenderTarget(previousRenderTarget);
    return this.outlineOutput.texture;
  }

  update(deltaSeconds: number): void {
    if (this.boneEffect && (this.state.playing || !this.hasAnimationClip())) {
      this.boneEffectTime += deltaSeconds;
      const frame = Math.floor(this.boneEffectTime * this.boneEffect.atlas.fps);
      applyBoneEffectFrame(this.boneEffect.sprite, this.boneEffect.atlas, frame, this.boneEffect.spec.worldUnitsPerPixel, this.boneEffect.spec.localOffset);
    }
    if (this.action && this.animationRange) {
      if (this.state.playing) {
        const elapsed = this.bodyLocalTime + deltaSeconds * this.playbackSpeed;
        this.completedAnimationCycles += Math.floor(elapsed / this.animationDuration);
        this.bodyLocalTime = elapsed % this.animationDuration;
      }
      // The face and completion counter follow the outer window. The mixer
      // repeats its source clip independently inside that window.
      this.action.time = this.sourceTime(this.animationRange[0] / this.animationFps + this.bodyLocalTime);
      this.mixer.update(0);
    }
    this.referenceBones?.update();
    if (!this.faceMesh || !this.faceFrames || !this.state.faceEnabled) return;
    // The native viewer advances the face at its own FPS but resets it with
    // the selected body animation loop. This keeps long face exports (for
    // example Colt's) from drifting into a later closed-eye state.
    const ticks = Math.floor(this.bodyLocalTime * this.faceFps + 1e-9);
    const count = this.faceFrames.frames.length;
    // Reference setBuffer starts before binary frame 0. Its first tick draws
    // frame 0, but a body-loop goToFrame(0) has already consumed that frame.
    // Live playback keeps advancing when a face export is shorter than its
    // body; the seek UI's N-2 clamp does not describe that rollover.
    const referenceTicks = ticks + (this.completedAnimationCycles > 0 ? 1 : 0);
    const next = this.referenceFaceTiming
      ? referenceTicks < count ? Math.max(0, referenceTicks - 1) : referenceTicks % count
      : ticks % count;
    if (next !== this.state.faceFrame) {
      this.state = { ...this.state, faceFrame: next };
      this.applyFaceFrame(next);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.action?.stop();
    if (this.boneEffect) {
      this.boneEffect.sprite.parent?.remove(this.boneEffect.sprite);
      this.boneEffect.sprite.material.dispose();
      this.boneEffect = undefined;
    }
    this.mixer.stopAllAction();
    this.restoreBaseAttachments();
    if (this.baseModel) disposeObject(this.baseModel.scene);
    if (this.animationModel) disposeObject(this.animationModel.scene);
    this.clearFace();
    this.ownedTextures.forEach((texture) => texture.dispose());
    this.ownedTextures.clear();
    this.faceTarget.dispose();
    this.outlineTarget.dispose();
    this.outlineOutput.dispose();
    this.outlineQuad.geometry.dispose();
    if (this.outlineQuad.material instanceof THREE.Material) this.outlineQuad.material.dispose();
    this.root.clear();
  }

  private applyDiffuseTexture(root: THREE.Object3D, texture: THREE.Texture): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial) {
          material.map = texture;
          material.needsUpdate = true;
        }
      });
    });
  }

  private async loadTextureAsset(
    asset: { readonly kind: "ready"; readonly url: string },
    sampling: "diffuse" | "face",
    configure: (texture: THREE.Texture) => THREE.Texture,
  ): Promise<THREE.Texture> {
    const url = assetUrl(asset);
    const cacheKey = `${sampling}:${url}`;
    let pending = this.textureCache.get(cacheKey);
    if (!pending) {
      pending = this.loader.loadTexture(url).then((texture) => {
        if (this.disposed) {
          texture.dispose();
          throw new Error("viewer runtime is disposed");
        }
        this.ownedTextures.add(texture);
        return texture;
      });
      this.textureCache.set(cacheKey, pending);
    }
    return configure(await pending);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("viewer runtime is disposed");
  }

  private sourceTime(time: number): number {
    return this.manifest.assetGroup === "reference-bridge" && this.sourceClipDuration > 0 ? time % this.sourceClipDuration : time;
  }

  private prepareLoadedModel(model: LoadedModel): void {
    try {
      compactReferenceGeometry(model);
      // Animated bones can move beyond the converter's rest-pose bounds (Buster disappears otherwise).
      model.scene.traverse((object) => {
        if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false;
      });
      if (this.manifest.assetGroup === "reference-bridge") {
        // Trixie's book_s keys author a non-rigid book deformation. Reference
        // a_ copies that raw matrix; unit normalization changes its shape.
        // Keep the established repair for other mirrored rotations.
        const preserved = shouldPreserveReferenceRotation(this.manifest.skinId, this.manifest.assetGroup, "book_s") ? new Set(["book_s"]) : new Set<string>();
        normalizeReferenceModelRotations(model, preserved);
      }
    } catch (error) {
      disposeObject(model.scene);
      throw error;
    }
  }

  private restoreBaseAttachments(): void {
    for (const { object, parent, transform } of this.baseAttachments) {
      parent.add(object);
      transform.decompose(object.position, object.quaternion, object.scale);
      object.updateMatrix();
    }
  }

  private async applyMaterialSpecializations(root: THREE.Object3D, slots: readonly ScMaterialSlot[]): Promise<void> {
    const textures = async (slot: ScMaterialSlot) => ({
      diffuse: slot.diffuseTexture?.kind === "ready" ? await this.loadTextureAsset(slot.diffuseTexture, "diffuse", configureDiffuseTexture) : undefined,
      diffuseLightmap: slot.diffuseLightmap?.kind === "ready" ? await this.loadTextureAsset(slot.diffuseLightmap, "diffuse", configureLinearTexture) : undefined,
      specularLightmap: slot.specularLightmap?.kind === "ready" ? await this.loadTextureAsset(slot.specularLightmap, "diffuse", configureLinearTexture) : undefined,
      stencil: slot.stencilTexture?.kind === "ready" ? await this.loadTextureAsset(slot.stencilTexture, "face", configureFaceTexture) : undefined,
    });
    const replacements: Promise<void>[] = [];
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const multiMaterial = Array.isArray(object.material);
      object.material = materials.map((material) => {
        const slot = materialSlotFor(slots, material.name);
        if (!slot) return material;
        const replacement = createScMaterial(slot, {}, object instanceof THREE.SkinnedMesh);
        replacements.push(textures(slot).then((loaded) => {
          const specialized = createScMaterial(slot, loaded, object instanceof THREE.SkinnedMesh);
          if (this.disposed) {
            specialized.dispose();
            replacement.dispose();
            throw new Error("viewer runtime is disposed");
          }
          if (multiMaterial && Array.isArray(object.material)) {
            object.material = object.material.map((item) => item === replacement ? specialized : item);
          } else {
            object.material = specialized;
          }
          material.dispose();
          replacement.dispose();
        }));
        return replacement;
      });
      if (!multiMaterial && Array.isArray(object.material)) object.material = object.material[0] ?? materials[0];
    });
    await Promise.all(replacements);
  }

  private bindStencilTexture(texture: THREE.Texture): void {
    const model = this.baseModel?.scene;
    if (!model) return;
    this.updateStencilUniforms(texture);
  }

  private updateStencilUniforms(texture: THREE.Texture | null): void {
    const model = this.baseModel?.scene;
    if (!model) return;
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (material instanceof THREE.ShaderMaterial && material.uniforms.stencilTex) {
          material.uniforms.stencilTex.value = texture;
          return;
        }
        if (!(material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial)) return;
        const existing = this.stencilBindings.get(material);
        if (existing) {
          existing.uniform.value = texture;
          return;
        }
        const uniform = { value: texture };
        this.stencilBindings.set(material, { uniform });
        const [scaleX, scaleY, offsetX, offsetY] = faceRenderTargetUvTransform(this.stencilMetadataForMaterial(material));
        const glslFloat = (value: number) => Number.isInteger(value) ? value.toFixed(1) : String(value);
        const previous = material.onBeforeCompile;
        material.onBeforeCompile = (shader, renderer) => {
          previous(shader, renderer);
          shader.uniforms.stencilTex = uniform;
          shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 viewerStencilUv;");
          shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>\nviewerStencilUv = vMapUv * vec2(${glslFloat(scaleX)}, ${glslFloat(scaleY)}) + vec2(${glslFloat(offsetX)}, ${glslFloat(offsetY)});`);
          shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D stencilTex; varying vec2 viewerStencilUv;");
          shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\nvec4 viewerStencil = texture2D(stencilTex, viewerStencilUv); diffuseColor.rgb = mix(diffuseColor.rgb, viewerStencil.rgb, viewerStencil.a);");
        };
        material.needsUpdate = true;
      });
    });
  }

  private stencilMetadataForMaterial(material: THREE.Material): Pick<ScMaterialMetadata, "stencilUvPolicy" | "uvSource"> {
    const slot = (this.manifest.materialSlots ? materialSlotFor(this.manifest.materialSlots, material.name) : undefined);
    return {
      stencilUvPolicy: slot?.stencilUvPolicy ?? (this.manifest.assetGroup === "reference-bridge" ? "flip-y" : "2x-flip-y"),
      uvSource: slot?.uvSource ?? this.manifest.material?.uvSource,
    };
  }

  private createFaceMesh(): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    const coversWholeTexture = this.manifest.faceFlags?.coversWholeTexture === true;
    const scaledUpTexture = this.manifest.faceFlags?.scaledUpTexture === true;
    const faceX = coversWholeTexture && !scaledUpTexture ? "a_pos.x/512.0*2.0-1.0" : "a_pos.x/512.0-1.0";
    const faceY = scaledUpTexture ? "a_pos.y/512.0+1.0" : coversWholeTexture ? "a_pos.y/512.0*2.0+1.0" : "-a_pos.y/512.0-1.0";
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.faceTexture } },
      vertexShader: `attribute vec2 a_pos; attribute vec2 a_uv; attribute vec4 a_colormul; attribute vec3 a_coloradd; varying vec2 v_uv; varying vec4 v_mul; varying vec3 v_add; void main(){v_uv=a_uv;v_mul=a_colormul;v_add=a_coloradd;gl_Position=vec4(${faceX},${faceY},0.0,1.0);}`,
      fragmentShader: "uniform sampler2D map; varying vec2 v_uv; varying vec4 v_mul; varying vec3 v_add; void main(){vec4 c=texture2D(map,v_uv)*v_mul;c.rgb+=v_add*c.a;gl_FragColor=vec4(c.rgb*v_mul.a,c.a);}",
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    this.applyFaceFrame(0, mesh);
    return mesh;
  }

  private applyFaceFrame(frameIndex: number, target = this.faceMesh): void {
    const frame = this.faceFrames?.frames[frameIndex];
    if (!frame || !target) return;
    const geometry = target.geometry;
    geometry.setAttribute("a_pos", new THREE.Float32BufferAttribute(frame.vertices.flatMap((vertex) => vertex.position), 2));
    geometry.setAttribute("a_uv", new THREE.Uint16BufferAttribute(frame.vertices.flatMap((vertex) => [vertex.uv[0] * 65535, vertex.uv[1] * 65535]), 2, true));
    geometry.setAttribute("a_colormul", new THREE.Uint8BufferAttribute(frame.vertices.flatMap((vertex) => vertex.colorMultiplier.map((value) => value * 255)), 4, true));
    geometry.setAttribute("a_coloradd", new THREE.Uint8BufferAttribute(frame.vertices.flatMap((vertex) => vertex.colorAdd.map((value) => value * 255)), 3, true));
    geometry.setIndex(Array.from(frame.indices));
  }

  private clearFace(): void {
    this.updateStencilUniforms(null);
    if (this.faceMesh) {
      this.faceMesh.geometry.dispose();
      if (this.faceMesh.material instanceof THREE.Material) this.faceMesh.material.dispose();
      this.faceRoot.remove(this.faceMesh);
    }
    this.faceMesh = undefined;
    this.faceFrames = undefined;
    this.faceFps = 60;
    this.faceTexture = undefined;
    this.state = { ...this.state, faceEnabled: false, faceFrame: 0 };
  }
}

/**
 * Match a GLB material to its catalog slot. Some exports namespace material
 * names ("brawl_shader_setup:character_mat") while the catalog does not;
 * unmatched materials fall back to lit standard materials that render black
 * in the SC pipeline. The namespace is stripped only when that is unambiguous.
 */
export function materialSlotFor(slots: readonly ScMaterialSlot[], name: string): ScMaterialSlot | undefined {
  const exact = slots.find((candidate) => candidate.materialName === name);
  if (exact) return exact;
  const local = name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : undefined;
  if (!local) return undefined;
  const matches = slots.filter((candidate) => candidate.materialName === local);
  return matches.length === 1 ? matches[0] : undefined;
}
