import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { AnimationEntry, BrawlerSkinManifest } from "./brawler-viewer-contract.ts";
import { BrawlerViewerRuntime, applyBoneEffectFrame, centerModelForFraming, fitPerspectiveCameraDistance, normalizeReferenceModelRotations, compactReferenceGeometry, selectHomeAnimationSequence, startupFramingBounds, type LoadedModel } from "./brawler-viewer-runtime.ts";

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

test("prefers captured hero-screen intro and loop, with win and idle fallback", () => {
  const source = fixtureManifest().animations;
  const idle = source.idle!;
  const unavailable = [{ kind: "unavailable" as const, reason: "not-captured" as const }, idle[1], idle[2], idle[3], idle[4], idle[5]] satisfies AnimationEntry;
  assert.deepEqual(selectHomeAnimationSequence({ HappyAnim: idle, IdleAnim: idle }), { start: "HappyAnim", loop: "IdleAnim" });
  assert.deepEqual(selectHomeAnimationSequence({ HappyAnim: idle, IdleAnim: idle, HeroScreenAnim: idle, HeroScreenLoopAnim: idle }), { start: "HeroScreenAnim", loop: "HeroScreenLoopAnim" });
  assert.deepEqual(selectHomeAnimationSequence({ HappyAnim: idle, IdleAnim: idle, HeroScreenAnim: unavailable, HeroScreenLoopAnim: idle }), { start: "HappyAnim", loop: "IdleAnim" });
  assert.equal(selectHomeAnimationSequence({ HeroScreenAnim: idle, IdleAnim: idle }), undefined);
});

test("bone effect atlas frames preserve source offsets and transparent gaps", () => {
  const texture = new THREE.Texture();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  const atlas = { fps: 30, atlasWidth: 200, atlasHeight: 100, frames: [
    { x: 40, y: 20, width: 50, height: 30, offsetX: -20, offsetY: -25 }, null,
  ] };
  applyBoneEffectFrame(sprite, atlas, 0, 0.02);
  assert.deepEqual(texture.repeat.toArray(), [0.25, 0.3]);
  assert.deepEqual(texture.offset.toArray(), [0.2, 0.5]);
  assert.deepEqual(sprite.position.toArray(), [0.1, 0.2, 0]);
  assert.deepEqual(sprite.scale.toArray(), [1, 0.6, 1]);
  applyBoneEffectFrame(sprite, atlas, 1, 0.02);
  assert.equal(sprite.visible, false);
  applyBoneEffectFrame(sprite, atlas, 2, 0.02);
  assert.equal(sprite.visible, true);
  applyBoneEffectFrame(sprite, atlas, 0, 0.02, [-0.8, -1.3, 0.2]);
  assert.ok(Math.abs(sprite.position.x + 0.7) < 1e-9);
  assert.ok(Math.abs(sprite.position.y + 1.1) < 1e-9);
  assert.equal(sprite.position.z, 0.2);
  sprite.material.dispose();
  texture.dispose();
});

test("Cosmo's always-on hand effect follows the selected skeleton and advances on a static pose", async () => {
  const manifest = { ...fixtureManifest(), brawlerId: 16000109, skinId: "AttractorDefault" };
  const urls: string[] = [];
  const bytes = new TextEncoder().encode(JSON.stringify({ fps: 2, atlasWidth: 100, atlasHeight: 100, frames: [
    { x: 0, y: 0, width: 20, height: 20, offsetX: -10, offsetY: -10 },
    { x: 20, y: 0, width: 30, height: 20, offsetX: -15, offsetY: -10 },
  ] }));
  const runtime = new BrawlerViewerRuntime(manifest, {
    loadModel: async () => { const scene = new THREE.Group(); const bone = new THREE.Bone(); bone.name = "hand_fx_s"; scene.add(bone); return { scene, animations: [] }; },
    loadTexture: async (url) => { urls.push(url); return new THREE.Texture(); },
    loadBinary: async (url) => { urls.push(url); return bytes.buffer as ArrayBuffer; },
  });
  await runtime.selectAnimation("idle");
  const sprite = runtime.root.getObjectByName("BoneEffect:hand_fx_s");
  assert.ok(sprite instanceof THREE.Sprite);
  assert.equal(sprite.parent?.name, "hand_fx_s");
  assert.equal(runtime.getState().playing, false);
  assert.ok(urls.some((url) => url.endsWith("/images/brawl-effects/cosmo-hand.png")));
  assert.ok(urls.some((url) => url.endsWith("/images/brawl-effects/cosmo-hand.json")));
  assert.deepEqual(sprite.position.toArray(), [-0.8, -1.3, 0]);
  runtime.update(0.6);
  assert.ok(Math.abs(sprite.scale.x - 2.7) < 1e-9);
  assert.ok(Math.abs(sprite.scale.y - 1.8) < 1e-9);
  assert.equal(sprite.scale.z, 1);
  await runtime.selectAnimation("idle");
  assert.equal(runtime.root.getObjectByName("BoneEffect:hand_fx_s"), sprite);
  assert.equal(sprite.parent?.name, "hand_fx_s");
  runtime.dispose();
});

test("an unavailable Cosmo hand effect leaves the 3D model usable and disposes its texture", async () => {
  const manifest = { ...fixtureManifest(), brawlerId: 16000109, skinId: "AttractorDefault" };
  const texture = new THREE.Texture();
  let textureDisposals = 0;
  texture.addEventListener("dispose", () => { textureDisposals += 1; });
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    const runtime = new BrawlerViewerRuntime(manifest, {
      loadModel: async () => { const scene = new THREE.Group(); const bone = new THREE.Bone(); bone.name = "hand_fx_s"; scene.add(bone); return { scene, animations: [] }; },
      loadTexture: async () => texture,
      loadBinary: async () => new TextEncoder().encode("invalid JSON").buffer as ArrayBuffer,
    });
    await runtime.selectAnimation("idle");
    assert.equal(runtime.getState().animationKey, "idle");
    assert.equal(runtime.root.getObjectByName("BoneEffect:hand_fx_s"), undefined);
    assert.equal(textureDisposals, 1);
    assert.equal(warnings.length, 1);
    runtime.dispose();
    assert.equal(textureDisposals, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test("camera distance measurement preserves the live camera pose", () => {
  const camera = new THREE.PerspectiveCamera(20, 1.5, 0.01, 100);
  camera.position.set(4, 3, 24);
  camera.lookAt(2, 1, 0);
  camera.updateMatrixWorld(true);
  const position = camera.position.clone();
  const rotation = camera.quaternion.clone();
  const distance = fitPerspectiveCameraDistance(camera, new THREE.Box3(new THREE.Vector3(-4, -6, -3), new THREE.Vector3(4, 6, 3)), new THREE.Vector3(0.2, 0.1, 1).normalize());
  assert.ok(distance > 0 && Number.isFinite(distance));
  assert.deepEqual(camera.position, position);
  assert.deepEqual(camera.quaternion.toArray(), rotation.toArray());
});

test("startup framing includes nearby intro poses but ignores a distant staged prop", () => {
  const loop = new THREE.Box3(new THREE.Vector3(-5, 0, -3), new THREE.Vector3(5, 10, 3));
  const normalIntro = new THREE.Box3(new THREE.Vector3(-6, -1, -3), new THREE.Vector3(6, 13, 4));
  const detachedIntro = new THREE.Box3(new THREE.Vector3(-6, -60, -3), new THREE.Vector3(6, 13, 4));
  assert.deepEqual(startupFramingBounds(loop, normalIntro), normalIntro);
  assert.deepEqual(startupFramingBounds(loop, detachedIntro), loop);
  const jumpingIntro = new THREE.Box3(new THREE.Vector3(-19, -10, -14), new THREE.Vector3(13, 18, 48));
  assert.deepEqual(startupFramingBounds(loop, jumpingIntro), new THREE.Box3(new THREE.Vector3(-5, 0, -3), new THREE.Vector3(5, 21, 3)));
  const thrownPropIntro = new THREE.Box3(new THREE.Vector3(-8, -2, -6), new THREE.Vector3(17, 15, 6));
  assert.deepEqual(startupFramingBounds(loop, thrownPropIntro), loop);
});

test("framing ignores meshes staged far from the visible character", async () => {
  const scene = new THREE.Group();
  for (const y of [0, 1, -60]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.position.y = y;
    scene.add(mesh);
  }
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async () => ({ scene, animations: [] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.loadBase();
  const bounds = runtime.getFramingBounds();
  assert.ok(bounds.min.y > -2);
  assert.ok(bounds.max.y < 3);
  runtime.dispose();
});

test("framing ignores a microscopic offstage prop near the character cluster", async () => {
  const scene = new THREE.Group();
  for (const x of [-1, 0, 1]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 2), new THREE.MeshBasicMaterial());
    mesh.position.x = x;
    scene.add(mesh);
  }
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), new THREE.MeshBasicMaterial());
  prop.position.set(14, -3, 0);
  scene.add(prop);
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async () => ({ scene, animations: [] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.loadBase();
  const bounds = runtime.getFramingBounds();
  assert.ok(bounds.max.x < 5);
  assert.ok(bounds.min.y > -4);
  runtime.dispose();
});

test("offstage prop count does not pull framing away from the head", async () => {
  const scene = new THREE.Group();
  for (const y of [3, 7, 11]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 3), new THREE.MeshBasicMaterial());
    mesh.position.y = y;
    scene.add(mesh);
  }
  for (let index = 0; index < 8; index += 1) {
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshBasicMaterial());
    prop.position.set(index * 0.5, -3, 0);
    scene.add(prop);
  }
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async () => ({ scene, animations: [] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.loadBase();
  const bounds = runtime.getFramingBounds();
  assert.ok(bounds.max.y >= 14);
  assert.ok(bounds.min.y > -1);
  runtime.dispose();
});

test("substantial staged props below a character do not shrink the character in frame", async () => {
  const scene = new THREE.Group();
  for (const y of [2, 4, 6, 8, 10, 11]) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 3), new THREE.MeshBasicMaterial());
    body.position.y = y;
    scene.add(body);
  }
  for (const y of [-15, -18]) {
    const prop = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 2), new THREE.MeshBasicMaterial());
    prop.position.y = y;
    scene.add(prop);
  }
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async () => ({ scene, animations: [] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.loadBase();
  const bounds = runtime.getFramingBounds();
  assert.ok(bounds.max.y >= 13);
  assert.ok(bounds.min.y > -1);
  runtime.dispose();
});

test("Chester hides source-staged hero props and restores them for other animations", async () => {
  const base = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial());
  body.name = "body_GEO";
  const glove = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  glove.name = "glove_GEO";
  const candy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  candy.name = "goodCandy1_GEO";
  base.add(body, glove, candy);
  const unavailable = { kind: "unavailable" as const, reason: "not-captured" as const };
  const hero = [{ kind: "ready" as const, url: "/assets/fixture/hero.glb" }, unavailable, unavailable, 0, -1, "Hero"] as const;
  const manifest = { ...fixtureManifest(), brawlerId: 16000063, skinId: "JesterDefault", animations: { ...fixtureManifest().animations, HeroScreenLoopAnim: hero } };
  const runtime = new BrawlerViewerRuntime(manifest, {
    loadModel: async (url) => ({ scene: url.endsWith("base.glb") ? base : new THREE.Group(), animations: [] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.loadBase();
  await runtime.selectAnimation("HeroScreenLoopAnim");
  assert.equal(body.visible, true);
  assert.equal(glove.visible, false);
  assert.equal(candy.visible, false);
  await runtime.selectAnimation("idle");
  assert.equal(glove.visible, true);
  assert.equal(candy.visible, true);
  runtime.dispose();
});

test("shared vertex buffers do not bind unused vertices to the wrong primitive skeleton", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 20, 20, 20], 3));
  geometry.setAttribute("uv", new THREE.Uint16BufferAttribute([0, 0, 65535, 0, 0, 65535, 10, 10], 2, true));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 99, 0, 0, 0], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setIndex([0, 1, 2]);
  const bone = new THREE.Bone();
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.add(bone); mesh.bind(new THREE.Skeleton([bone]));
  assert.throws(() => mesh.computeBoundingBox());
  assert.equal(compactReferenceGeometry({ scene: mesh, animations: [] }), 1);
  assert.equal(mesh.geometry.attributes.position.count, 3);
  assert.equal(mesh.geometry.attributes.uv.getX(1), 1);
  assert.deepEqual(Array.from(mesh.geometry.index!.array), [0, 1, 2]);
  mesh.computeBoundingBox();
  assert.deepEqual(mesh.boundingBox?.max.toArray(), [1, 1, 0]);
  assert.equal(compactReferenceGeometry({ scene: mesh, animations: [] }), 0);
});

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

test("reference 120 fps body windows retain the 30 fps face phase through home loops and pauses", async () => {
  const ready = (url: string) => ({ kind: "ready" as const, url });
  const clip = new THREE.AnimationClip("win", 13, []);
  const runtime = new BrawlerViewerRuntime({
    ...fixtureManifest(), assetGroup: "reference-bridge",
    animations: {
      intro: [ready("/win.glb"), ready("/face.png"), ready("/face.bin"), 0, 1138, "Win", 120, 30, 1, "reference"],
      loop: [ready("/win.glb"), ready("/face.png"), ready("/face.bin"), 1019, 1138, "Loop", 120, 30, 1, "reference"],
    },
  }, {
    loadModel: async () => ({ scene: new THREE.Group(), animations: [clip] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => faceFixtureBuffer(293),
  });
  await runtime.selectAnimation("intro");
  runtime.update(0.1);
  assert.equal(runtime.getState().faceFrame, 2);
  runtime.update(1138 / 120 - 0.1 + 1e-10);
  assert.equal(runtime.getCompletedAnimationCycles(), 1);
  assert.equal(runtime.getState().faceFrame, 0);
  runtime.update(0.1);
  assert.equal(runtime.getState().faceFrame, 3);
  await runtime.selectAnimation("loop");
  assert.equal(runtime.getState().faceFrame, 0);
  runtime.update(0.1);
  assert.equal(runtime.getState().faceFrame, 2);
  runtime.setPlaying(false);
  runtime.update(1);
  assert.equal(runtime.getState().faceFrame, 2);
  runtime.setPlaying(true);
  runtime.update(119 / 120 - 0.1 + 1e-10);
  assert.equal(runtime.getCompletedAnimationCycles(), 1);
  assert.equal(runtime.getState().faceFrame, 0);
  await runtime.selectAnimation("intro");
  assert.equal(runtime.getState().faceFrame, 0);
  runtime.dispose();
});

test("reference live faces roll over when shorter than the body instead of clamping to the seek endpoint", async () => {
  const ready = (url: string) => ({ kind: "ready" as const, url });
  const runtime = new BrawlerViewerRuntime({
    ...fixtureManifest(), assetGroup: "reference-bridge",
    animations: { win: [ready("/win.glb"), ready("/face.png"), ready("/face.bin"), 0, 300, "Win", 30, 30, 1, "reference"] },
  }, {
    loadModel: async () => ({ scene: new THREE.Group(), animations: [new THREE.AnimationClip("win", 12, [])] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => faceFixtureBuffer(5),
  });
  await runtime.selectAnimation("win");
  runtime.update(4 / 30);
  assert.equal(runtime.getState().faceFrame, 3);
  runtime.update(1 / 30);
  assert.equal(runtime.getState().faceFrame, 0);
  runtime.update(4 / 30);
  assert.equal(runtime.getState().faceFrame, 4);
  runtime.update(1 / 30);
  assert.equal(runtime.getState().faceFrame, 0);
  runtime.update(10 - 10 / 30 + 1e-10);
  assert.equal(runtime.getCompletedAnimationCycles(), 1);
  assert.equal(runtime.getState().faceFrame, 0);
  runtime.update(4 / 30);
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
  assert.equal(runtime.getCompletedAnimationCycles(), 0);
  runtime.update(0.5);
  assert.ok(Math.abs(animationBone.position.x - 0.6) < 1e-6);
  runtime.update(0.6);
  const completedCycles = runtime.getCompletedAnimationCycles();
  assert.ok(completedCycles > 0);
  runtime.setPlaying(false);
  runtime.update(2);
  assert.equal(runtime.getCompletedAnimationCycles(), completedCycles);
  assert.equal(runtime.getState().playing, false);
  runtime.setOutlineEnabled(true);
  assert.equal(runtime.getState().outlineEnabled, true);
  await runtime.selectAnimation("idle");
  assert.equal(runtime.getState().animationKey, "idle");
  assert.equal(runtime.getState().playing, true);
  assert.equal(runtime.getCompletedAnimationCycles(), 0);
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
  runtime.update(0.25);
  runtime.setPlaying(false);
  const originalPosition = animationBone.position.clone();
  const currentPose = runtime.getCurrentPoseBounds();
  const bounds = runtime.getFramingBounds();
  assert.ok(bounds.max.x > currentPose.max.x);
  assert.ok(bounds.max.x >= 5.5, `expected final sampled pose to extend bounds, got ${bounds.max.x}`);
  assert.deepEqual(animationBone.position, originalPosition);
  assert.equal(runtime.getState().playing, false);
  const framed = centerModelForFraming(runtime.root, bounds);
  assert.equal(framed.largestDimension, 6);
  assert.ok(framed.bounds.containsBox(bounds.clone().translate(framed.wrapper.position)));
  assert.ok(!new THREE.Box3().setFromObject(framed.wrapper, true).containsBox(framed.bounds));
  assert.deepEqual(framed.bounds.getCenter(new THREE.Vector3()), new THREE.Vector3());
  const parentedBounds = runtime.getFramingBounds();
  assert.deepEqual(parentedBounds.min.toArray(), framed.bounds.min.toArray());
  assert.deepEqual(parentedBounds.max.toArray(), framed.bounds.max.toArray());
  runtime.dispose();
});

test("body pose and face share the selected frame-range clock across loops and pauses", async () => {
  const base = new THREE.Group();
  const animation = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = "armSSC";
  animation.add(bone);
  const clip = new THREE.AnimationClip("move", 1, [
    new THREE.VectorKeyframeTrack("armSSC.position", [0, 1], [0, 0, 0, 60, 0, 0]),
  ]);
  const ready = (url: string) => ({ kind: "ready" as const, url });
  const runtime = new BrawlerViewerRuntime({
    ...fixtureManifest(),
    animations: { move: [ready("/move.glb"), ready("/face.png"), ready("/face.bin"), 10, 20, "Move", 60, 30] },
  }, {
    loadModel: async (url) => url.endsWith("base.glb") ? { scene: base, animations: [] } : { scene: animation, animations: [clip] },
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => faceFixtureBuffer(100),
  });
  await runtime.selectAnimation("move");
  assert.equal(bone.position.x, 10);
  runtime.update(0.5);
  assert.ok(Math.abs(bone.position.x - 18) < 1e-6);
  assert.equal(runtime.getState().faceFrame, 4);
  runtime.setPlaying(false);
  runtime.update(1);
  assert.ok(Math.abs(bone.position.x - 18) < 1e-6);
  assert.equal(runtime.getState().faceFrame, 4);
  runtime.setPlaying(true);
  runtime.update(0.06);
  assert.ok(Math.abs(bone.position.x - 10.6) < 1e-6);
  assert.equal(runtime.getState().faceFrame, 0);
  runtime.dispose();
});

test("playback speed scales body and face time without changing source frame rates", async () => {
  const base = new THREE.Group();
  const animation = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = "armSSC";
  animation.add(bone);
  const clip = new THREE.AnimationClip("move", 1, [
    new THREE.VectorKeyframeTrack("armSSC.position", [0, 1], [0, 0, 0, 60, 0, 0]),
  ]);
  const ready = (url: string) => ({ kind: "ready" as const, url });
  const runtime = new BrawlerViewerRuntime({
    ...fixtureManifest(),
    animations: { move: [ready("/move.glb"), ready("/face.png"), ready("/face.bin"), 10, 20, "Move", 60, 30, 2] },
  }, {
    loadModel: async (url) => url.endsWith("base.glb") ? { scene: base, animations: [] } : { scene: animation, animations: [clip] },
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => faceFixtureBuffer(100),
  });
  await runtime.selectAnimation("move");
  runtime.update(0.25);
  assert.ok(Math.abs(bone.position.x - 18) < 1e-6);
  assert.equal(runtime.getState().faceFrame, 4);
  runtime.dispose();
});

test("animation reselection retains base attachments without disposing or accumulating their poses", async () => {
  const base = new THREE.Group();
  const weapon = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  weapon.name = "weapon";
  weapon.position.x = 2;
  base.add(weapon);
  let disposed = 0;
  weapon.geometry.addEventListener("dispose", () => { disposed += 1; });
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async (url) => {
      if (url.endsWith("base.glb")) return { scene: base, animations: [] };
      const scene = new THREE.Group();
      const hand = new THREE.Bone();
      hand.name = "handSSC";
      hand.position.x = 5;
      scene.add(hand);
      return { scene, animations: [] };
    },
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  for (const animation of ["idle", "custom_pose", "idle"]) {
    await runtime.selectAnimation(animation);
    assert.equal(weapon.parent, runtime.root.getObjectByName("handSSC"));
    assert.equal(weapon.getWorldPosition(new THREE.Vector3()).x, 2);
    assert.equal(disposed, 0);
  }
  runtime.dispose();
  assert.equal(disposed, 1);
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

test("face targets stay bound to base materials reparented onto animation sockets", async () => {
  const base = new THREE.Group();
  const material = new THREE.ShaderMaterial({ uniforms: { stencilTex: { value: null } } });
  const weapon = new THREE.Mesh(new THREE.BoxGeometry(), material);
  weapon.name = "weapon";
  base.add(weapon);
  const animation = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = "handSSC";
  animation.add(hand);
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async (url) => url.endsWith("base.glb") ? { scene: base, animations: [] } : { scene: animation, animations: [] },
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.selectAnimation("idle");
  const target = runtime.renderFace({
    domElement: { width: 512, height: 512 },
    setRenderTarget: () => undefined,
    setClearAlpha: () => undefined,
    getClearAlpha: () => 1,
    clear: () => undefined,
    render: () => undefined,
  });
  assert.equal(material.uniforms.stencilTex.value, target);
  runtime.setFaceEnabled(false);
  assert.equal(material.uniforms.stencilTex.value, null);
  runtime.dispose();
});

test("fallback stencil materials preserve source UV scale and precision", async () => {
  for (const [uvSource, expected] of [
    ["default", /vMapUv \* vec2\(1\.0, -1\.0\) \+ vec2\(0\.0, 1\.0\)/],
    ["KHR_texture_transform", /vMapUv \* vec2\(0\.000244140625, -0\.000244140625\) \+ vec2\(0\.0, 1\.0\)/],
  ] as const) {
    const scene = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    material.name = "character_mat";
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
    const manifest = { ...fixtureManifest(), assetGroup: "reference-bridge" as const, material: { uvSource } };
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
    assert.match(shader.vertexShader, expected);
    runtime.dispose();
  }
});

test("reference imports retain normalization for non-skeleton transforms", async () => {
  const base = new THREE.Group();
  base.quaternion.set(-0.0059287757612764835, -0.08970484137535095, 0.5365720987319946, -0.00472392188385129);
  const animation = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = "armSSC";
  animation.add(bone);
  const values = [0.7282984852790833, -0.33103081583976746, 0.7526689767837524, -0.40734928846359253];
  const track = new THREE.QuaternionKeyframeTrack("armSSC.quaternion", [0, 1], [...values, ...values]);
  const runtime = new BrawlerViewerRuntime({ ...fixtureManifest(), assetGroup: "reference-bridge" }, {
    loadModel: async (url) => url.endsWith("base.glb") ? { scene: base, animations: [] } : { scene: animation, animations: [new THREE.AnimationClip("move", 1, [track])] },
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.selectAnimation("idle");
  assert.ok(Math.abs(base.quaternion.length() - 1) < 1e-6);
  assert.ok(Math.abs(bone.quaternion.length() - 1) < 1e-6);
  assert.ok(Math.abs(Math.hypot(...track.values.slice(0, 4)) - 1) < 1e-6);
  runtime.dispose();
});

test("reference outer windows repeat the source clip without resetting the face or completion clock", async () => {
  const base = new THREE.Group();
  const animation = new THREE.Group();
  const bone = new THREE.Bone(); bone.name = "armSSC"; animation.add(bone);
  const clip = new THREE.AnimationClip("short", 1, [new THREE.VectorKeyframeTrack("armSSC.position", [0, 1], [0, 0, 0, 60, 0, 0])]);
  const ready = (url: string) => ({ kind: "ready" as const, url });
  const runtime = new BrawlerViewerRuntime({ ...fixtureManifest(), assetGroup: "reference-bridge",
    animations: { long: [ready("/short.glb"), ready("/face.png"), ready("/face.bin"), 15, 135, "Long", 60, 30] },
  }, {
    loadModel: async (url) => url.endsWith("base.glb") ? { scene: base, animations: [] } : { scene: animation, animations: [clip] },
    loadTexture: async () => new THREE.Texture(), loadBinary: async () => faceFixtureBuffer(100),
  });
  await runtime.selectAnimation("long");
  runtime.update(1.1);
  assert.ok(Math.abs(bone.position.x - 21) < 1e-6);
  assert.equal(runtime.getCompletedAnimationCycles(), 0);
  assert.equal(runtime.getState().faceFrame, 33);
  runtime.setPlaying(false); runtime.update(10); runtime.setPlaying(true);
  runtime.update(1);
  assert.ok(Math.abs(bone.position.x - 21) < 1e-6);
  assert.equal(runtime.getCompletedAnimationCycles(), 1);
  assert.equal(runtime.getState().faceFrame, 3);
  runtime.dispose();
});

test("reference negative ends retain the full source period after a nonzero start", async () => {
  const animation = new THREE.Group();
  const bone = new THREE.Bone(); bone.name = "armSSC"; animation.add(bone);
  const clip = new THREE.AnimationClip("short", 1, [new THREE.VectorKeyframeTrack("armSSC.position", [0, 1], [0, 0, 0, 60, 0, 0])]);
  const source = fixtureManifest();
  const runtime = new BrawlerViewerRuntime({ ...source, assetGroup: "reference-bridge",
    animations: { ...source.animations, idle: [source.animations.idle![0], source.animations.idle![1], source.animations.idle![2], 30, -1, "Idle", 60] },
  }, {
    loadModel: async (url) => url.endsWith("base.glb") ? { scene: new THREE.Group(), animations: [] } : { scene: animation, animations: [clip] },
    loadTexture: async () => new THREE.Texture(), loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.selectAnimation("idle"); runtime.update(0.75);
  assert.equal(runtime.getCompletedAnimationCycles(), 0);
  assert.ok(Math.abs(bone.position.x - 15) < 1e-6);
  runtime.update(0.5);
  assert.equal(runtime.getCompletedAnimationCycles(), 1);
  assert.ok(Math.abs(bone.position.x - 45) < 1e-6);
  runtime.dispose();
});

test("Trixie's book retains authored non-unit samples and raw deformation across animation changes", async () => {
  const base = new THREE.Group();
  const book = new THREE.Bone(); book.name = "book_s"; base.add(book);
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  base.add(mesh); mesh.bind(new THREE.Skeleton([book]));
  const samples = [.7, .4, .1, .9, .7, .4, .1, .9];
  let source: THREE.Bone | undefined;
  let track: THREE.QuaternionKeyframeTrack | undefined;
  const runtime = new BrawlerViewerRuntime({ ...fixtureManifest(), skinId: "PercenterTrixie", assetGroup: "reference-bridge" }, {
    loadModel: async (url) => {
      if (url.endsWith("base.glb")) return { scene: base, animations: [] };
      const scene = new THREE.Group(); source = new THREE.Bone(); source.name = "book_s"; scene.add(source);
      track = new THREE.QuaternionKeyframeTrack("book_s.quaternion", [0, 1], samples);
      return { scene, animations: [new THREE.AnimationClip("book", 1, [track])] };
    }, loadTexture: async () => new THREE.Texture(), loadBinary: async () => new ArrayBuffer(0),
  });
  for (const key of ["idle", "custom_pose", "idle"]) {
    await runtime.selectAnimation(key); runtime.update(0.01); runtime.root.updateMatrixWorld(true);
    assert.ok(source && track);
    assert.ok(Math.abs(Math.hypot(...track.values.slice(0, 4)) - Math.hypot(...samples.slice(0, 4))) < 1e-7);
    assert.ok(book.matrix.elements.every((value, index) => Math.abs(value - source!.matrix.elements[index]!) < 1e-9));
    assert.equal(mesh.skeleton.bones[0], book);
    assert.equal(book.matrixAutoUpdate, false);
  }
  runtime.dispose();
});

test("reference rotation repair reports corrections and leaves valid unit values unchanged", () => {
  const scene = new THREE.Group();
  scene.quaternion.set(0, 0, 0, 0.5440717246134249);
  const track = new THREE.QuaternionKeyframeTrack("bone.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1.1715136004843671]);
  const model = { scene, animations: [new THREE.AnimationClip("move", 1, [track])] };
  const result = normalizeReferenceModelRotations(model);
  assert.equal(result.normalizedNodeCount, 1);
  assert.equal(result.normalizedSampleCount, 1);
  assert.ok(Math.abs(result.maximumNormDeviation - 0.4559282753865751) < 1e-6);
  assert.deepEqual(Array.from(track.values), [0, 0, 0, 1, 0, 0, 0, 1]);
  assert.deepEqual(normalizeReferenceModelRotations(model), { normalizedNodeCount: 0, normalizedSampleCount: 0, maximumNormDeviation: 0 });
});

test("collapsed reference transforms retain their matrix without a NaN orientation", () => {
  const node = new THREE.Object3D();
  node.name = "hidden-accessory";
  const authored = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(1, 2, 3);
  node.applyMatrix4(authored);
  const scene = new THREE.Group();
  scene.add(node);
  normalizeReferenceModelRotations({ scene, animations: [] });
  assert.deepEqual(node.quaternion.toArray(), [0, 0, 0, 1]);
  assert.deepEqual(node.scale.toArray(), [0, 0, 0]);
  assert.ok(node.matrix.equals(authored));
});

test("reference rotation repair rejects zero and non-finite nodes or samples", () => {
  for (const value of [0, NaN, Infinity]) {
    const scene = new THREE.Group();
    scene.quaternion.set(0, 0, 0, value);
    assert.throws(() => normalizeReferenceModelRotations({ scene, animations: [] }), /zero or non-finite/);
    const track = new THREE.QuaternionKeyframeTrack("bone.quaternion", [0], [0, 0, 0, value]);
    assert.throws(() => normalizeReferenceModelRotations({ scene: new THREE.Group(), animations: [new THREE.AnimationClip("move", 1, [track])] }), /zero or non-finite/);
  }
});

test("disposes freshly loaded base and animation models rejected by reference normalization", async () => {
  for (const rejectedStage of ["base", "animation"]) {
    const rejectedScene = new THREE.Group();
    rejectedScene.quaternion.set(0, 0, 0, 0);
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    rejectedScene.add(new THREE.Mesh(geometry, material));
    let geometryDisposals = 0;
    let materialDisposals = 0;
    geometry.addEventListener("dispose", () => { geometryDisposals += 1; });
    material.addEventListener("dispose", () => { materialDisposals += 1; });
    const runtime = new BrawlerViewerRuntime({ ...fixtureManifest(), assetGroup: "reference-bridge" }, {
      loadModel: async (url) => ({
        scene: (url.endsWith("base.glb") ? "base" : "animation") === rejectedStage ? rejectedScene : new THREE.Group(),
        animations: [],
      }),
      loadTexture: async () => new THREE.Texture(),
      loadBinary: async () => new ArrayBuffer(0),
    });
    await assert.rejects(() => runtime.selectAnimation("idle"), /zero or non-finite/);
    assert.equal(geometryDisposals, 1);
    assert.equal(materialDisposals, 1);
    assert.equal(rejectedScene.parent, null);
    runtime.dispose();
    assert.equal(geometryDisposals, 1);
    assert.equal(materialDisposals, 1);
  }
});

test("reference cubic rotation validation does not normalize tangent rows", () => {
  const track = new THREE.QuaternionKeyframeTrack("bone.quaternion", [0], [0, 0, 0, 0, 0, 0, 0, 1, 4, 5, 6, 7]);
  // GLTFLoader tags its custom factory and stores three VEC4 rows per key.
  Object.assign(track, { createInterpolant: Object.assign(() => undefined, { isInterpolantFactoryMethodGLTFCubicSpline: true }) });
  const model = { scene: new THREE.Group(), animations: [new THREE.AnimationClip("move", 1, [track])] };
  const before = Array.from(track.values);
  assert.equal(normalizeReferenceModelRotations(model).normalizedSampleCount, 0);
  assert.deepEqual(Array.from(track.values), before);
  track.values[7] = 0.5440717;
  assert.throws(() => normalizeReferenceModelRotations(model), /unsupported interpolation/);
  assert.deepEqual(Array.from(track.values.slice(8)), [4, 5, 6, 7]);
});

test("reference normalization does not bypass strict pinned-local materialization", async () => {
  const base = new THREE.Group();
  base.quaternion.set(0, 0, 0, 0.54);
  const runtime = new BrawlerViewerRuntime(fixtureManifest(), {
    loadModel: async () => ({ scene: base, animations: [] }),
    loadTexture: async () => new THREE.Texture(),
    loadBinary: async () => new ArrayBuffer(0),
  });
  await runtime.loadBase();
  assert.equal(base.quaternion.w, 0.54);
  runtime.dispose();
});

test("material slots match namespaced GLB material names only when unambiguous", async () => {
  const { materialSlotFor } = await import("./brawler-viewer-runtime.ts");
  const slots = [{ materialName: "character_mat" }, { materialName: "character_metal_mat" }] as const;
  assert.equal(materialSlotFor(slots, "character_mat")?.materialName, "character_mat");
  assert.equal(materialSlotFor(slots, "brawl_shader_setup:character_mat")?.materialName, "character_mat");
  assert.equal(materialSlotFor(slots, "brawl_shader_setup:unknown_mat"), undefined);
  const ambiguous = [{ materialName: "x_mat" }, { materialName: "x_mat" }] as const;
  assert.equal(materialSlotFor(ambiguous, "ns:x_mat"), undefined);
});
