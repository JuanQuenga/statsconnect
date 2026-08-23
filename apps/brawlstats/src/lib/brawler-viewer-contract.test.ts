import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  compositeFaceColor,
  configureDiffuseTexture,
  configureFaceTexture,
  configureLinearTexture,
  createFaceRenderTarget,
  createOutlineCompositeMaterial,
  decodeFaceBinary,
  localSkinManifest,
  localViewerAsset,
  isStrictLocalAssetUrl,
  mergeAnimationHierarchy,
  rebindSkinnedMeshes,
  removeRenderableAnimationNodes,
  sanitizedNodeName,
  referenceSkinIsLocallyCapturable,
  unavailableSkinManifest,
} from "./brawler-viewer-contract.ts";

test("keeps uncaptured skins unavailable until assets and transforms are proven", () => {
  const manifest = unavailableSkinManifest(16000012, "regression-fixture");
  assert.equal(manifest.baseModel.kind, "unavailable");
  assert.equal(manifest.face.kind, "unavailable");
});

test("only permits same-origin viewer asset paths", () => {
  const manifest = localSkinManifest(16000018, "default", "/assets/brawlers/3d/16000018.glb", "/assets/brawlers/3d/16000018.webp", 1);
  assert.match(manifest.baseModel.kind === "ready" ? manifest.baseModel.url : "", /^\/assets\//);
  assert.throws(() => localViewerAsset("https://cdn.example.invalid/model.glb"), /same-origin/);
  assert.throws(() => localViewerAsset("http://cdn.example.invalid/model.glb"), /same-origin/);
  assert.throws(() => localViewerAsset("//cdn.example.invalid/model.glb"), /same-origin/);
  assert.throws(() => localViewerAsset("/assets\\cdn/model.glb"), /same-origin/);
  assert.equal(isStrictLocalAssetUrl("/assets/brawlers/3d/catalog.json?v=2"), true);
});

test("keeps generator records unavailable until local capture exists", () => {
  assert.equal(referenceSkinIsLocallyCapturable({
    skin: "Default",
    character: "Example",
    modelAsset: "68.250/sc3d/example.glb",
    diffuseTexture: "example.sctx",
    homeScreenScale: "260",
    animations: {},
    faces: {},
  }), false);
});

test("sanitizes source node separators without changing other names", () => {
  assert.equal(sanitizedNodeName("head_s:SSC"), "head_sSSC");
});

test("decodes the native face binary header and frame payload", () => {
  const buffer = new ArrayBuffer(4 + 8 + (2 * 8) + (2 * 4) + (2 * 4) + (2 * 3) + (3 * 2));
  const view = new DataView(buffer);
  view.setUint32(0, 1, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 3, true);
  view.setFloat32(12, 12.5, true);
  view.setFloat32(16, -3.25, true);
  view.setFloat32(20, 7, true);
  view.setFloat32(24, 9, true);
  view.setUint16(28, 32768, true);
  view.setUint16(30, 65535, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 16384, true);
  view.setUint8(36, 255); view.setUint8(37, 128); view.setUint8(38, 64); view.setUint8(39, 32);
  view.setUint8(40, 16); view.setUint8(41, 32); view.setUint8(42, 48); view.setUint8(43, 64);
  view.setUint8(44, 1); view.setUint8(45, 2); view.setUint8(46, 3);
  view.setUint8(47, 4); view.setUint8(48, 5); view.setUint8(49, 6);
  view.setUint16(50, 0, true); view.setUint16(52, 1, true); view.setUint16(54, 0, true);
  const decoded = decodeFaceBinary(buffer);
  assert.equal(decoded.frames.length, 1);
  assert.deepEqual(decoded.frames[0]?.vertices[0], {
    position: [12.5, -3.25],
    uv: [32768 / 65535, 1],
    colorMultiplier: [1, 128 / 255, 64 / 255, 32 / 255],
    colorAdd: [1 / 255, 2 / 255, 3 / 255],
  });
  assert.deepEqual(decoded.frames[0]?.vertices[1]?.position, [7, 9]);
  assert.deepEqual(decoded.frames[0]?.indices, [0, 1, 0]);
});

test("creates a 512px transparent face target", () => {
  const target = createFaceRenderTarget();
  assert.equal(target.width, 512);
  assert.equal(target.height, 512);
  assert.equal(target.depthBuffer, false);
  target.dispose();
});

test("uses a raw shader for the host outline composite", () => {
  const material = createOutlineCompositeMaterial();
  assert.equal(material instanceof THREE.ShaderMaterial, true);
  assert.match(material.fragmentShader, /texture2D\(tDiffuse,vUv\)/);
  assert.equal(material.toneMapped, false);
  assert.equal(material.transparent, true);
  material.dispose();
});

test("keeps the reference face color multiplier/add order", () => {
  assert.deepEqual(compositeFaceColor([0.8, 0.5, 0.2, 0.75], [0.5, 1, 1, 0.5], [0.1, 0.2, 0.3]), {
    rgb: [0.21875, 0.2875, 0.15625],
    alpha: 0.375,
  });
});

test("configures face textures for the native transparent pass", async () => {
  const THREE = await import("three");
  const texture = configureFaceTexture(new THREE.Texture());
  assert.equal(texture.flipY, false);
  assert.equal(texture.colorSpace, THREE.NoColorSpace);
  assert.equal(texture.magFilter, THREE.NearestFilter);
  assert.equal(texture.minFilter, THREE.NearestFilter);
  texture.dispose();
});

test("keeps diffuse textures in the reference shader color space and mipmapped", async () => {
  const THREE = await import("three");
  const texture = configureDiffuseTexture(new THREE.Texture());
  assert.equal(texture.flipY, false);
  assert.equal(texture.colorSpace, THREE.NoColorSpace);
  assert.equal(texture.magFilter, THREE.LinearFilter);
  assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(texture.generateMipmaps, true);
  texture.dispose();
});

test("keeps lightmaps in linear color space", async () => {
  const THREE = await import("three");
  const texture = configureLinearTexture(new THREE.Texture());
  assert.equal(texture.flipY, false);
  assert.equal(texture.colorSpace, THREE.NoColorSpace);
  assert.equal(texture.magFilter, THREE.LinearFilter);
  assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
  texture.dispose();
});

test("clones missing animation helper parents and rebinds by sanitized names", async () => {
  const THREE = await import("three");
  const base = new THREE.Group();
  const baseHand = new THREE.Bone();
  baseHand.name = "hand";
  const socket = new THREE.Object3D();
  socket.name = "weapon:SSC";
  baseHand.add(socket);
  const geometryBone = new THREE.Bone();
  geometryBone.name = "arm:SSC";
  base.add(baseHand, geometryBone);
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.bind(new THREE.Skeleton([geometryBone]));
  base.add(mesh);

  const animation = new THREE.Group();
  const animationHand = new THREE.Bone();
  animationHand.name = "hand";
  const animationBone = new THREE.Bone();
  animationBone.name = "armSSC";
  animation.add(animationHand, animationBone);
  const nodes = mergeAnimationHierarchy(base, animation);
  assert.equal(nodes.get("weaponSSC")?.parent, animationHand);
  assert.equal(rebindSkinnedMeshes(base, nodes), 1);
  assert.equal(mesh.skeleton.bones[0], animationBone);
  animationBone.position.x = 3;
  assert.equal(mesh.skeleton.bones[0]?.position.x, 3);
  mesh.geometry.dispose();
  mesh.material.dispose();
});

test("promotes matching animation transforms to bones without losing children", async () => {
  const THREE = await import("three");
  const base = new THREE.Group();
  const geometryBone = new THREE.Bone();
  geometryBone.name = "hips_s";
  base.add(geometryBone);
  const animation = new THREE.Group();
  const animationNode = new THREE.Object3D();
  animationNode.name = "hips_s";
  animationNode.position.x = 4;
  const child = new THREE.Object3D();
  child.name = "weapon:SSC";
  animationNode.add(child);
  animation.add(animationNode);
  const nodes = mergeAnimationHierarchy(base, animation);
  const promoted = nodes.get("hips_s");
  assert.ok(promoted instanceof THREE.Bone);
  assert.equal(promoted.position.x, 4);
  assert.equal(promoted.getObjectByName("weapon:SSC"), child);
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.bind(new THREE.Skeleton([geometryBone]));
  base.add(mesh);
  assert.equal(rebindSkinnedMeshes(base, nodes), 1);
  assert.equal(mesh.skeleton.bones[0], promoted);
  mesh.geometry.dispose();
  mesh.material.dispose();
});

test("removes animation-side render meshes but keeps skeleton sockets", async () => {
  const THREE = await import("three");
  const animation = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = "R_wrist_s";
  const socket = new THREE.Object3D();
  socket.name = "weaponSSC";
  hand.add(socket);
  const duplicate = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  duplicate.name = "weaponGeo";
  animation.add(hand, duplicate);
  assert.equal(removeRenderableAnimationNodes(animation).length, 1);
  assert.equal(animation.getObjectByName("R_wrist_s"), hand);
  assert.equal(hand.getObjectByName("weaponSSC"), socket);
  assert.equal(animation.getObjectByName("weaponGeo"), undefined);
  duplicate.geometry.dispose();
  duplicate.material.dispose();
});
