import * as THREE from "three";
import { appPath } from "./paths.ts";

export type ViewerAsset =
  | { readonly kind: "ready"; readonly url: string }
  | { readonly kind: "unavailable"; readonly reason: "not-captured" | "transform-unverified" };

export function localViewerAsset(path: string): ViewerAsset {
  if (!isStrictLocalAssetUrl(path)) throw new Error("viewer assets must be same-origin paths");
  return { kind: "ready", url: appPath(path) };
}

export function isStrictLocalAssetUrl(path: string): boolean {
  return /^\/(?![\\/])[^\\]*$/.test(path);
}

export type AnimationEntry = readonly [
  animation: ViewerAsset,
  faceAtlas: ViewerAsset,
  faceBinary: ViewerAsset,
  startFrame: number,
  endFrame: number,
  label: string,
  animationFps?: number,
  faceFps?: number,
  playbackSpeed?: number,
];

export type ViewerFeature =
  | { readonly kind: "available" }
  | { readonly kind: "unavailable"; readonly reason: "not-captured" | "transform-unverified" };

export type ViewerAssetGroup = "pinned-local" | "reference-bridge";
export type StencilUvPolicy = "flip-y" | "identity" | "2x-flip-y" | "2x-identity";

export type BrawlerSkinManifest = {
  readonly brawlerId: number;
  readonly skinId: string;
  readonly baseModel: ViewerAsset;
  readonly diffuseTexture: ViewerAsset;
  readonly animations: Readonly<Record<string, AnimationEntry>>;
  readonly face: ViewerFeature;
  readonly outline: ViewerFeature;
  readonly cameraScale: number;
  readonly attachments: Readonly<Record<string, string>>;
  readonly assetGroup: ViewerAssetGroup;
  readonly fileVersion?: string;
  readonly material?: ScMaterialMetadata;
  readonly materialSlots?: readonly ScMaterialSlot[];
  readonly faceFlags?: { readonly coversWholeTexture?: boolean; readonly scaledUpTexture?: boolean };
};

export type ScMaterialMetadata = {
  readonly diffuse?: boolean;
  readonly ambient?: boolean;
  readonly lightmapDiffuse?: boolean;
  readonly specular?: boolean;
  readonly opacity?: number;
  readonly stencil?: boolean;
  readonly stencilUvPolicy?: StencilUvPolicy;
  readonly uvSource?: "KHR_texture_transform" | "COLLADA2GLTF" | "67/68" | "default";
};

export type ScMaterialSlot = ScMaterialMetadata & {
  readonly materialName: string;
  readonly diffuseTexture?: ViewerAsset;
  readonly diffuseLightmap?: ViewerAsset;
  readonly specularLightmap?: ViewerAsset;
  readonly stencilTexture?: ViewerAsset;
};

export type ReferenceSkinRecord = {
  readonly skin: string;
  readonly character: string;
  readonly modelAsset: string | null;
  readonly diffuseTexture: string | null;
  readonly homeScreenScale: string | null;
  readonly animations: Readonly<Record<string, string | null>>;
  readonly faces: Readonly<Record<string, string | null>>;
};

export function referenceSkinIsLocallyCapturable(record: ReferenceSkinRecord): boolean {
  return record.modelAsset?.startsWith("/") === true && record.diffuseTexture?.startsWith("/") === true;
}

export function unavailableSkinManifest(brawlerId: number, skinId: string): BrawlerSkinManifest {
  const unavailable: ViewerAsset = { kind: "unavailable", reason: "not-captured" };
  return {
    brawlerId,
    skinId,
    assetGroup: "pinned-local",
    baseModel: unavailable,
    diffuseTexture: unavailable,
    animations: {},
    face: { kind: "unavailable", reason: "transform-unverified" },
    outline: { kind: "unavailable", reason: "not-captured" },
    cameraScale: 1,
    attachments: {},
  };
}

export function localSkinManifest(
  brawlerId: number,
  skinId: string,
  baseModelPath: string,
  diffuseTexturePath: string,
  cameraScale: number,
  attachments: Readonly<Record<string, string>> = {},
): BrawlerSkinManifest {
  return {
    brawlerId,
    skinId,
    assetGroup: "pinned-local",
    baseModel: localViewerAsset(baseModelPath),
    diffuseTexture: localViewerAsset(diffuseTexturePath),
    animations: {},
    face: { kind: "unavailable", reason: "transform-unverified" },
    outline: { kind: "unavailable", reason: "not-captured" },
    cameraScale,
    attachments,
  };
}

export type FaceVertex = {
  readonly position: readonly [number, number];
  readonly uv: readonly [number, number];
  readonly colorMultiplier: readonly [number, number, number, number];
  readonly colorAdd: readonly [number, number, number];
};

export type FaceFrame = {
  readonly vertices: readonly FaceVertex[];
  readonly indices: readonly number[];
};

export type FaceBinary = { readonly frames: readonly FaceFrame[] };

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function requireBytes(view: DataView, offset: number, size: number): void {
  if (offset + size > view.byteLength) throw new Error("face binary is truncated");
}

export function decodeFaceBinary(buffer: ArrayBuffer): FaceBinary {
  const view = new DataView(buffer);
  requireBytes(view, 0, 4);
  const frameCount = readU32(view, 0);
  if (frameCount === 0) throw new Error("face binary contains no frames");
  let offset = 4;
  const frames: FaceFrame[] = [];

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    requireBytes(view, offset, 8);
    const vertexCount = readU32(view, offset);
    const indexCount = readU32(view, offset + 4);
    if (vertexCount === 0 && indexCount === 0) {
      // A zero/zero source frame is a valid transparent frame. Rendering zero
      // triangles after clearing the face target preserves that blank frame.
      frames.push({ vertices: [], indices: [] });
      offset += 8;
      continue;
    }
    if (vertexCount === 0 || indexCount === 0) throw new Error("face frame contains no geometry");
    offset += 8;
    requireBytes(view, offset, vertexCount * 8 + vertexCount * 4 + vertexCount * 4 + vertexCount * 3 + indexCount * 2);
    const positions = new Float32Array(buffer.slice(offset, offset + vertexCount * 8));
    offset += vertexCount * 8;
    const uvs = new Uint16Array(buffer.slice(offset, offset + vertexCount * 4));
    offset += vertexCount * 4;
    const colorMultiplier = new Uint8Array(buffer.slice(offset, offset + vertexCount * 4));
    offset += vertexCount * 4;
    const colorAdd = new Uint8Array(buffer.slice(offset, offset + vertexCount * 3));
    offset += vertexCount * 3;
    const vertices: FaceVertex[] = [];
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      const positionOffset = vertexIndex * 2;
      const uvOffset = vertexIndex * 2;
      const multiplierOffset = vertexIndex * 4;
      const addOffset = vertexIndex * 3;
      vertices.push({
        position: [positions[positionOffset] ?? 0, positions[positionOffset + 1] ?? 0],
        uv: [(uvs[uvOffset] ?? 0) / 65535, (uvs[uvOffset + 1] ?? 0) / 65535],
        colorMultiplier: [(colorMultiplier[multiplierOffset] ?? 0) / 255, (colorMultiplier[multiplierOffset + 1] ?? 0) / 255, (colorMultiplier[multiplierOffset + 2] ?? 0) / 255, (colorMultiplier[multiplierOffset + 3] ?? 0) / 255],
        colorAdd: [(colorAdd[addOffset] ?? 0) / 255, (colorAdd[addOffset + 1] ?? 0) / 255, (colorAdd[addOffset + 2] ?? 0) / 255],
      });
    }
    requireBytes(view, offset, indexCount * 2);
    const indices = Array.from({ length: indexCount }, (_, index) => view.getUint16(offset + index * 2, true));
    offset += indexCount * 2;
    frames.push({ vertices, indices });
  }
  if (offset !== view.byteLength) throw new Error("face binary has trailing bytes");
  return { frames };
}

export function sanitizedNodeName(name: string): string {
  return name.replaceAll(":", "");
}

export function animationTrackNodeName(trackName: string): string {
  return sanitizedNodeName(trackName.split(".", 1)[0] ?? trackName);
}

export function retargetAnimationClip(clip: THREE.AnimationClip, target: THREE.Object3D): THREE.AnimationClip {
  const nodes = new Map<string, THREE.Object3D>();
  target.traverse((node) => nodes.set(sanitizedNodeName(node.name), node));
  const tracks = clip.tracks.map((track) => {
    const nodeName = animationTrackNodeName(track.name);
    const node = nodes.get(nodeName);
    if (!node) throw new Error(`animation target is missing: ${nodeName}`);
    const suffix = track.name.slice(track.name.indexOf("."));
    const replacement = track.clone();
    replacement.name = `${node.name}${suffix}`;
    return replacement;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export function mergeAnimationHierarchy(base: THREE.Object3D, animation: THREE.Object3D): Map<string, THREE.Object3D> {
  const nodes = new Map<string, THREE.Object3D>();
  animation.traverse((node) => nodes.set(sanitizedNodeName(node.name), node));
  const cloneMissingGeometryNode = (source: THREE.Object3D): THREE.Object3D => {
    if (source === base) return animation;
    const key = sanitizedNodeName(source.name);
    const existing = nodes.get(key);
    if (existing) {
      if (source instanceof THREE.Bone && !(existing instanceof THREE.Bone)) {
        const promoted = new THREE.Bone();
        promoted.name = existing.name;
        promoted.position.copy(existing.position);
        promoted.quaternion.copy(existing.quaternion);
        promoted.scale.copy(existing.scale);
        promoted.visible = existing.visible;
        promoted.userData = { ...existing.userData };
        const parent = existing.parent;
        const children = [...existing.children];
        const childIndex = parent ? parent.children.indexOf(existing) : -1;
        if (parent) parent.remove(existing);
        if (parent) parent.add(promoted);
        children.forEach((child) => promoted.add(child));
        if (parent && childIndex >= 0) {
          const promotedIndex = parent.children.indexOf(promoted);
          parent.children.splice(promotedIndex, 1);
          parent.children.splice(childIndex, 0, promoted);
        }
        nodes.set(key, promoted);
        return promoted;
      }
      return existing;
    }
    const parent = source.parent ? cloneMissingGeometryNode(source.parent) : animation;
    const clone = source.clone(false);
    parent.add(clone);
    nodes.set(key, clone);
    return clone;
  };
  base.traverse((node) => {
    if (node instanceof THREE.Mesh) return;
    cloneMissingGeometryNode(node);
  });
  return nodes;
}

export function rebindSkinnedMeshes(root: THREE.Object3D, nodes: ReadonlyMap<string, THREE.Object3D>): number {
  let rebound = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const oldSkeleton = object.skeleton;
    const bones = oldSkeleton.bones.map((bone) => {
      const replacement = nodes.get(sanitizedNodeName(bone.name));
      if (!replacement) throw new Error(`skeleton target is missing: ${bone.name}`);
      if (!(replacement instanceof THREE.Bone)) throw new Error(`skeleton target is not a bone: ${bone.name}`);
      return replacement;
    });
    object.bind(new THREE.Skeleton(bones, oldSkeleton.boneInverses), object.bindMatrix);
    rebound += 1;
  });
  return rebound;
}

/**
 * Animation exports can carry a second copy of the geometry scene. Keep the
 * animation skeleton/helpers authoritative, but never render that duplicate
 * geometry beside the base skin.
 */
export function removeRenderableAnimationNodes(root: THREE.Object3D): readonly THREE.Object3D[] {
  const renderables: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) renderables.push(object);
  });
  renderables.forEach((object) => object.parent?.remove(object));
  return renderables;
}

export function attachNamedObjects(root: THREE.Object3D, nodes: ReadonlyMap<string, THREE.Object3D>, attachments: Readonly<Record<string, string>>): number {
  let attached = 0;
  for (const [objectName, targetName] of Object.entries(attachments)) {
    const object = root.getObjectByName(objectName);
    const target = nodes.get(sanitizedNodeName(targetName));
    if (!object || !target || object === target) continue;
    target.attach(object);
    attached += 1;
  }
  return attached;
}

export function compositeFaceColor(
  texture: readonly [number, number, number, number],
  multiplier: readonly [number, number, number, number],
  add: readonly [number, number, number],
): { readonly rgb: readonly [number, number, number]; readonly alpha: number } {
  const alpha = texture[3] * multiplier[3];
  return { rgb: [
    (texture[0] * multiplier[0] + add[0] * alpha) * multiplier[3],
    (texture[1] * multiplier[1] + add[1] * alpha) * multiplier[3],
    (texture[2] * multiplier[2] + add[2] * alpha) * multiplier[3],
  ], alpha };
}

export function configureFaceTexture(texture: THREE.Texture): THREE.Texture {
  // The native face UVs are authored for the WebGL texture origin. Three's
  // image loader otherwise flips the atlas on upload, turning the face quad
  // into a sampled strip of unrelated animation frames.
  texture.flipY = false;
  // Match the reference viewer's SC shader inputs; renderer output encoding
  // handles display conversion rather than texture color management.
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function configureDiffuseTexture(texture: THREE.Texture): THREE.Texture {
  texture.flipY = false;
  // Match the reference viewer's SC shader inputs; renderer output encoding
  // handles display conversion rather than texture color management.
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function configureLinearTexture(texture: THREE.Texture): THREE.Texture {
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createFaceRenderTarget(): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(512, 512, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

export function createOutlineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      u_outlineScale: { value: 1 },
      u_outlineColor: { value: new THREE.Color(0x000000) },
      u_backgroundColor: { value: new THREE.Color(0x000000) },
      u_resolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.0);}",
    fragmentShader: "uniform sampler2D tDiffuse; uniform float u_outlineScale; uniform vec2 u_resolution; uniform vec3 u_outlineColor; uniform vec3 u_backgroundColor; varying vec2 vUv; void main(){ vec4 c=texture2D(tDiffuse,vUv); float a=0.0; for(int i=0;i<8;i++){float r=6.2831853*float(i)/8.0; a=max(a,texture2D(tDiffuse,vUv+vec2(cos(r),sin(r))*u_outlineScale/u_resolution).a);} float edge=max(a-c.a,0.0); gl_FragColor=vec4(mix(c.rgb,u_outlineColor,edge),max(c.a,edge));}",
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

/**
 * Composite the postprocess output without MeshBasicMaterial's implicit
 * texture color conversion. The reference SC pass writes raw colors and the
 * host needs to sample/copy them unchanged into the default framebuffer.
 */
export function createOutlineCompositeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.0);}",
    fragmentShader: "uniform sampler2D tDiffuse; varying vec2 vUv; void main(){gl_FragColor=texture2D(tDiffuse,vUv);}",
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}
