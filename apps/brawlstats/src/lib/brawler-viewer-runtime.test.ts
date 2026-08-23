import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { BrawlerSkinManifest } from "./brawler-viewer-contract.ts";
import { BrawlerViewerRuntime, type LoadedModel } from "./brawler-viewer-runtime.ts";

function fixtureManifest(customReady = true): BrawlerSkinManifest {
  const unavailable = { kind: "unavailable" as const, reason: "not-captured" as const };
  const ready = (url: string) => ({ kind: "ready" as const, url });
  return {
    brawlerId: 16000018,
    skinId: "fixture",
    assetGroup: "pinned-local",
    baseModel: ready("/assets/fixture/base.glb"),
    diffuseTexture: unavailable,
    animations: {
      idle: [ready("/assets/fixture/idle.glb"), unavailable, unavailable, 0, 60, "Idle"],
      custom_pose: [customReady ? ready("/assets/fixture/custom.glb") : unavailable, unavailable, unavailable, 10, 20, "Custom Pose"],
    },
    face: unavailable,
    outline: unavailable,
    cameraScale: 1,
    attachments: { weapon: "handSSC" },
  };
}

function faceFixtureBuffer(frameCount = 1): ArrayBuffer {
  const vertices = 4;
  const indices = 6;
  const frameBytes = 8 + vertices * 8 + vertices * 4 + vertices * 4 + vertices * 3 + indices * 2;
  const buffer = new ArrayBuffer(4 + frameCount * frameBytes);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint32(offset, frameCount, true);
  offset += 4;
  for (let frame = 0; frame < frameCount; frame += 1) {
    view.setUint32(offset, vertices, true);
    view.setUint32(offset + 4, indices, true);
    offset += 8;
    for (let index = 0; index < vertices; index += 1) {
      view.setFloat32(offset, index % 2 === 0 ? 0 : 100, true);
      view.setFloat32(offset + 4, index > 1 ? 100 : 0, true);
      offset += 8;
    }
    offset += vertices * 4;
    offset += vertices * 4;
    offset += vertices * 3;
    [0, 1, 2, 0, 2, 3].forEach((index) => {
      view.setUint16(offset, index, true);
      offset += 2;
    });
  }
  return buffer;
}

async function shaderForFaceFlags(faceFlags: BrawlerSkinManifest["faceFlags"]): Promise<string> {
  const manifest = {
    ...fixtureManifest(),
    faceFlags,
    animations: {
      idle: [
        { kind: "ready" as const, url: "/assets/fixture/idle.glb" },
        { kind: "ready" as const, url: "/assets/fixture/face.png" },
        { kind: "ready" as const, url: "/assets/fixture/face.bin" },
        0,
        0,
        "Idle",
      ],
    },
  } satisfies BrawlerSkinManifest;
  const runtime = new BrawlerViewerRuntime(manifest, {
    loadModel: async () => ({ scene: new THREE.Group(), animations: [] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => faceFixtureBuffer(),
  });
  await runtime.loadFace(manifest.animations.idle);
  let shader = "";
  let renderedScene: THREE.Object3D | undefined;
  runtime.renderFace({
    domElement: { width: 512, height: 512 },
    setRenderTarget: () => undefined,
    setClearAlpha: () => undefined,
    getClearAlpha: () => 1,
    clear: () => undefined,
    render: (scene) => { renderedScene = scene; },
  });
  renderedScene?.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.material instanceof THREE.ShaderMaterial) shader = object.material.vertexShader;
  });
  runtime.dispose();
  return shader;
}

test("keeps face staging out of the main render root", () => {
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async () => ({ scene: new THREE.Group(), animations: [] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  assert.equal(runtime.root.children.length, 0);
  runtime.dispose();
});

test("resets long native face timelines with the looping body clip", async () => {
  const base = new THREE.Group();
  const animation = new THREE.Group();
  const clip = new THREE.AnimationClip("idle", 1, []);
  const manifest = {
    ...fixtureManifest(),
    animations: {
      idle: [
        { kind: "ready" as const, url: "/assets/fixture/idle.glb" },
        { kind: "ready" as const, url: "/assets/fixture/face.png" },
        { kind: "ready" as const, url: "/assets/fixture/face.bin" },
        0,
        60,
        "Idle",
        60,
        30,
      ],
    },
  } satisfies BrawlerSkinManifest;
  const runtime = new BrawlerViewerRuntime(manifest, {
    loadModel: async (url) => url.endsWith("base.glb") ? { scene: base, animations: [] } : { scene: animation, animations: [clip] },
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => faceFixtureBuffer(100),
  });
  await runtime.selectAnimation("idle");
  runtime.update(2);
  assert.equal(runtime.getState().faceFrame, 0);
  runtime.dispose();
});

test("keeps a static pose skeleton and attachments when an animation has no clip", async () => {
  const base = new THREE.Group();
  const weapon = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  weapon.name = "weapon";
  base.add(weapon);
  const animation = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = "handSSC";
  animation.add(hand);
  const manifest = fixtureManifest();
  const runtime = new BrawlerViewerRuntime(manifest, {
    loadModel: async (url) => url.endsWith("base.glb") ? { scene: base, animations: [] } : { scene: animation, animations: [] },
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.selectAnimation("idle");
  assert.equal(runtime.getState().animationKey, "idle");
  assert.equal(runtime.getState().playing, false);
  assert.equal(runtime.root.getObjectByProperty("isMesh", true) !== undefined, true);
  assert.equal(runtime.root.getObjectByName("handSSC"), hand);
  assert.equal(weapon.parent, hand);
  runtime.dispose();
});

test("outline pass renders the host wrapper so centering and scale match the visible model", () => {
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async () => ({ scene: new THREE.Group(), animations: [] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  const wrapper = new THREE.Group();
  const rendered: THREE.Object3D[] = [];
  runtime.renderOutline({
    domElement: { width: 8, height: 8 },
    setRenderTarget: () => undefined,
    setClearAlpha: () => undefined,
    getClearAlpha: () => 1,
    clear: () => undefined,
    render: (scene) => rendered.push(scene),
  }, new THREE.PerspectiveCamera(), wrapper);
  assert.equal(rendered[0], wrapper);
  runtime.dispose();
});

test("outline pass clears persistent targets on every frame without accumulating ghosts", () => {
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async () => ({ scene: new THREE.Group(), animations: [] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  let currentTarget: THREE.WebGLRenderTarget | null = null;
  const clearTargets: (THREE.WebGLRenderTarget | null)[] = [];
  const renderColorSpaces: string[] = [];
  const renderer = {
    domElement: { width: 8, height: 8 },
    getRenderTarget: () => currentTarget,
    setRenderTarget: (target: THREE.WebGLRenderTarget | null) => { currentTarget = target; },
    setClearAlpha: () => undefined,
    getClearAlpha: () => 1,
    clear: () => { clearTargets.push(currentTarget); },
    render: () => { renderColorSpaces.push(currentTarget?.texture.colorSpace ?? THREE.NoColorSpace); },
  };
  const previous = new THREE.WebGLRenderTarget(2, 2);
  currentTarget = previous;
  const output = runtime.renderOutline(renderer, new THREE.PerspectiveCamera());
  assert.equal(output.colorSpace, THREE.NoColorSpace);
  runtime.renderOutline(renderer, new THREE.PerspectiveCamera());
  assert.equal(clearTargets.length, 6);
  assert.equal(clearTargets[0], clearTargets[3]);
  assert.notEqual(clearTargets[0], null);
  assert.notEqual(clearTargets[0], previous);
  assert.equal(clearTargets[2], null);
  assert.equal(clearTargets[1], clearTargets[4]);
  assert.equal(clearTargets[5], null);
  assert.equal(currentTarget, previous);
  // Each call renders the model mask first, then the outline quad. The raw
  // passthrough host composite keeps the target unconverted throughout.
  assert.equal(renderColorSpaces[1], THREE.NoColorSpace);
  assert.equal(renderColorSpaces[3], THREE.NoColorSpace);
  previous.dispose();
  runtime.dispose();
});

test("uses source face flags for all reference vertex transforms", async () => {
  const defaultShader = await shaderForFaceFlags(undefined);
  assert.match(defaultShader, /a_pos\.x\/512\.0-1\.0/);
  assert.match(defaultShader, /-a_pos\.y\/512\.0-1\.0/);

  const wholeTextureShader = await shaderForFaceFlags({ coversWholeTexture: true });
  assert.match(wholeTextureShader, /a_pos\.x\/512\.0\*2\.0-1\.0/);
  assert.match(wholeTextureShader, /a_pos\.y\/512\.0\*2\.0\+1\.0/);

  const scaledShader = await shaderForFaceFlags({ coversWholeTexture: true, scaledUpTexture: true });
  assert.match(scaledShader, /a_pos\.x\/512\.0-1\.0/);
  assert.match(scaledShader, /a_pos\.y\/512\.0\+1\.0/);
});

test("runtime selects custom animation keys and advances the selected clip", async () => {
  const base = new THREE.Group();
  const baseBone = new THREE.Bone();
  baseBone.name = "arm:SSC";
  base.add(baseBone);
  const animation = new THREE.Group();
  const animationBone = new THREE.Bone();
  animationBone.name = "armSSC";
  animation.add(animationBone);
  const idleAnimation = new THREE.Group();
  const idleBone = new THREE.Bone();
  idleBone.name = "armSSC";
  idleAnimation.add(idleBone);
  const clip = new THREE.AnimationClip("custom", 1, [
    new THREE.VectorKeyframeTrack("armSSC.position", [0, 1], [0, 0, 0, 2, 0, 0]),
  ]);
  const idleClip = new THREE.AnimationClip("idle", 1, [
    new THREE.VectorKeyframeTrack("armSSC.position", [0, 1], [0, 0, 0, 1, 0, 0]),
  ]);
  const models: Record<string, LoadedModel> = {
    "/assets/fixture/base.glb": { scene: base, animations: [] },
    "/assets/fixture/custom.glb": { scene: animation, animations: [clip] },
    "/assets/fixture/idle.glb": { scene: idleAnimation, animations: [idleClip] },
  };
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async (url) => models[url] ?? (() => { throw new Error(`missing fixture: ${url}`); })(),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.selectAnimation("custom_pose");
  assert.equal(runtime.getState().animationKey, "custom_pose");
  assert.equal(runtime.getState().playing, true);
  runtime.update(0.5);
  assert.equal(animationBone.position.x, 4 / 3);
  runtime.setPlaying(false);
  assert.equal(runtime.getState().playing, false);
  runtime.setOutlineEnabled(true);
  assert.equal(runtime.getState().outlineEnabled, true);
  await runtime.selectAnimation("idle");
  assert.equal(runtime.getState().animationKey, "idle");
  assert.equal(runtime.getState().playing, true);
  runtime.dispose();
});

test("framing bounds include the selected animation poses", async () => {
  const base = new THREE.Group();
  const baseBone = new THREE.Bone();
  baseBone.name = "arm:SSC";
  base.add(baseBone);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const vertexCount = geometry.attributes.position?.count ?? 0;
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(vertexCount * 4).fill(0), 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(new Array(vertexCount * 4).fill(0).map((value, index) => index % 4 === 0 ? 1 : value), 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.bind(new THREE.Skeleton([baseBone]));
  base.add(mesh);

  const animation = new THREE.Group();
  const animationBone = new THREE.Bone();
  animationBone.name = "armSSC";
  animation.add(animationBone);
  const clip = new THREE.AnimationClip("move", 1, [
    new THREE.VectorKeyframeTrack("armSSC.position", [0, 1], [0, 0, 0, 5, 0, 0]),
  ]);
  const runtime = new BrawlerViewerRuntime({
    ...fixtureManifest(),
    animations: {
      move: [{ kind: "ready" as const, url: "/assets/fixture/move.glb" }, { kind: "unavailable" as const, reason: "not-captured" as const }, { kind: "unavailable" as const, reason: "not-captured" as const }, 0, 60, "Move"],
    },
  }, {
    loadModel: async (url) => url.endsWith("base.glb") ? { scene: base, animations: [] } : { scene: animation, animations: [clip] },
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.selectAnimation("move");
  const bounds = runtime.getFramingBounds();
  assert.ok(bounds.max.x > 4, `expected sampled pose to extend bounds, got ${bounds.max.x}`);
  runtime.dispose();
});

test("disposes native face textures with the runtime", async () => {
  const manifest = {
    ...fixtureManifest(),
    animations: {
      idle: [
        { kind: "ready" as const, url: "/assets/fixture/idle.glb" },
        { kind: "ready" as const, url: "/assets/fixture/face.png" },
        { kind: "ready" as const, url: "/assets/fixture/face.bin" },
        0,
        0,
        "Idle",
      ],
    },
  } satisfies BrawlerSkinManifest;
  const texture = new THREE.Texture();
  let disposed = false;
  texture.addEventListener("dispose", () => { disposed = true; });
  const runtime = new BrawlerViewerRuntime(manifest, {
    loadModel: async () => ({ scene: new THREE.Group(), animations: [] }),
    loadTexture: async () => texture,
    loadBinary: async () => faceFixtureBuffer(),
  });
  await runtime.loadFace(manifest.animations.idle!);
  runtime.dispose();
  assert.equal(disposed, true);
});

test("disposes render meshes removed from animation exports", async () => {
  const base = new THREE.Group();
  const baseBone = new THREE.Bone();
  baseBone.name = "arm:SSC";
  base.add(baseBone);
  const animation = new THREE.Group();
  const animationBone = new THREE.Bone();
  animationBone.name = "armSSC";
  animation.add(animationBone);
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshBasicMaterial();
  let geometryDisposed = false;
  let materialDisposed = false;
  geometry.addEventListener("dispose", () => { geometryDisposed = true; });
  material.addEventListener("dispose", () => { materialDisposed = true; });
  animation.add(new THREE.Mesh(geometry, material));
  const clip = new THREE.AnimationClip("custom", 1, [
    new THREE.VectorKeyframeTrack("armSSC.position", [0, 1], [0, 0, 0, 1, 0, 0]),
  ]);
  const models: Record<string, LoadedModel> = {
    "/assets/fixture/base.glb": { scene: base, animations: [] },
    "/assets/fixture/custom.glb": { scene: animation, animations: [clip] },
  };
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async (url) => models[url] ?? (() => { throw new Error(`missing fixture: ${url}`); })(),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.selectAnimation("custom_pose");
  assert.equal(geometryDisposed, true);
  assert.equal(materialDisposed, true);
  runtime.dispose();
});

test("cleans a model that resolves after runtime disposal", async () => {
  let resolveModel: ((model: LoadedModel) => void) | undefined;
  const loading = new Promise<LoadedModel>((resolve) => { resolveModel = resolve; });
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async () => loading,
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  const pending = runtime.loadBase();
  runtime.dispose();

  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshBasicMaterial();
  let geometryDisposed = false;
  let materialDisposed = false;
  geometry.addEventListener("dispose", () => { geometryDisposed = true; });
  material.addEventListener("dispose", () => { materialDisposed = true; });
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(geometry, material));
  resolveModel?.({ scene, animations: [] });

  await assert.rejects(pending, /viewer runtime is disposed/);
  assert.equal(geometryDisposed, true);
  assert.equal(materialDisposed, true);
  assert.equal(runtime.root.children.length, 0);
});

test("runtime rejects unavailable and external animation assets", async () => {
  const manifest = fixtureManifest(false);
  const runtime = new BrawlerViewerRuntime(manifest, {
    loadModel: async () => ({ scene: new THREE.Group(), animations: [] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await assert.rejects(() => runtime.selectAnimation("custom_pose"), /unavailable/);
  runtime.dispose();
});

test("material slots match by name and share one loaded texture", async () => {
  const THREE = await import("three");
  const scene = new THREE.Group();
  for (const name of ["body", "weapon"]) {
    const material = new THREE.MeshBasicMaterial();
    material.name = name;
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  }
  const manifest = {
    ...fixtureManifest(),
    materialSlots: [
      { materialName: "body", diffuse: true, diffuseTexture: { kind: "ready" as const, url: "/assets/shared.png" } },
      { materialName: "weapon", diffuse: true, diffuseTexture: { kind: "ready" as const, url: "/assets/shared.png" } },
    ],
  };
  let textureLoads = 0;
  const runtime = new BrawlerViewerRuntime(manifest, {
    loadModel: async () => ({ scene, animations: [] }),
    loadTexture: async () => { textureLoads += 1; return new THREE.Texture(); },
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.loadBase();
  assert.equal(textureLoads, 1);
  assert.equal(scene.children.every((child) => child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial), true);
  runtime.dispose();
});

test("face disable clears specialized stencil targets", async () => {
  const THREE = await import("three");
  const scene = new THREE.Group();
  const material = new THREE.ShaderMaterial({ uniforms: { stencilTex: { value: null } } });
  scene.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async () => ({ scene, animations: [] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.loadBase();
  const target = new THREE.Texture();
  material.uniforms.stencilTex.value = target;
  runtime.setFaceEnabled(false);
  assert.equal(material.uniforms.stencilTex.value, null);
  target.dispose();
  runtime.dispose();
});

test("fallback stencil materials use the asset-group UV policy", async () => {
  const scene = new THREE.Group();
  const material = new THREE.MeshBasicMaterial();
  material.name = "character_mat";
  scene.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  const manifest = { ...fixtureManifest(), assetGroup: "reference-bridge" as const };
  const runtime = new BrawlerViewerRuntime(manifest, {
    loadModel: async () => ({ scene, animations: [] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.loadBase();
  runtime.renderFace({
    domElement: { width: 512, height: 512 },
    setRenderTarget: () => undefined,
    setClearAlpha: () => undefined,
    getClearAlpha: () => 1,
    clear: () => undefined,
    render: () => undefined,
  });
  type CompileParameters = Parameters<THREE.Material["onBeforeCompile"]>[0];
  const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <uv_vertex>", fragmentShader: "#include <common>\n#include <map_fragment>" } as unknown as CompileParameters;
  material.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
  assert.match(shader.vertexShader, /vMapUv \* vec2\(1\.0, -1\.0\) \+ vec2\(0\.0, 1\.0\)/);
  runtime.dispose();
});
