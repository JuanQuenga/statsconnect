import assert from "node:assert/strict";
import test from "node:test";
import { blendStencilColor, diffuseUvTransform, stencilUvTransform, createScMaterial } from "./sc-material.ts";

test("uses the proven version-specific diffuse UV transforms", () => {
  assert.deepEqual(diffuseUvTransform({ uvSource: "KHR_texture_transform" }), [1 / 4096, 1 / 4096, 0, 0]);
  assert.deepEqual(diffuseUvTransform({ uvSource: "COLLADA2GLTF" }), [1, -1, 0, 1]);
  assert.deepEqual(diffuseUvTransform({ uvSource: "67/68" }), [2, 2, 0, 0]);
  assert.deepEqual(diffuseUvTransform({ uvSource: "default" }), [1, 1, 0, 0]);
});

test("keeps stencil UV policy explicit per asset group", () => {
  assert.deepEqual(stencilUvTransform({ stencilUvPolicy: "identity" }), [1, 1, 0, 0]);
  assert.deepEqual(stencilUvTransform({ stencilUvPolicy: "flip-y" }), [1, -1, 0, 1]);
  assert.deepEqual(stencilUvTransform({ stencilUvPolicy: "2x-flip-y" }), [2, -2, 0, 1]);
  assert.deepEqual(stencilUvTransform({ stencilUvPolicy: "2x-identity" }), [2, 2, 0, 0]);
  assert.deepEqual(stencilUvTransform({}), [1, -1, 0, 1]);
});

test("specializes diffuse/lightmap/specular/stencil and opacity paths", () => {
  const material = createScMaterial({
    diffuse: true,
    lightmapDiffuse: true,
    specular: true,
    stencil: true,
    opacity: 0.8,
    uvSource: "COLLADA2GLTF",
  });
  assert.equal(material.defines?.USE_DIFFUSE, 0);
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false);
  assert.match(material.fragmentShader, /USE_LIGHTMAP/);
  assert.match(material.fragmentShader, /vStencilUv/);
  assert.match(material.fragmentShader, /specular\*=texture2D\(diffuseTex,vDiffuseUv\)/);
  assert.match(material.vertexShader, /stencilUvTransform/);
  material.dispose();
});

test("keeps stencil UVs independent from the diffuse UV transform", () => {
  const material = createScMaterial({ diffuse: true, stencil: true, uvSource: "67/68", stencilUvPolicy: "flip-y" }, {}, false);
  assert.match(material.vertexShader, /vDiffuseUv=uv\*diffuseUvTransform\.xy/);
  assert.match(material.vertexShader, /vStencilUv=uv\*stencilUvTransform\.xy/);
  assert.doesNotMatch(material.vertexShader, /vStencilUv=vDiffuseUv/);
  material.dispose();
});

test("keeps stencil overlays opaque for stable depth composition", () => {
  const material = createScMaterial({ diffuse: true, stencil: true, opacity: 1 }, {}, false);
  assert.equal(material.transparent, false);
  assert.equal(material.depthWrite, true);
  material.dispose();
});

test("uses premultiplied stencil alpha exactly once", () => {
  assert.deepEqual(blendStencilColor([0.8, 0.4, 0.2], [0.1, 0.9, 0.7], 0.5, 0.25).map((value) => Number(value.toFixed(6))), [0.725, 0.575, 0.35]);
});

test("skinned specialization includes skin transforms and view-space normals", () => {
  const material = createScMaterial({ diffuse: true, lightmapDiffuse: true }, {}, true);
  assert.equal(material.defines?.USE_SKINNING, undefined);
  assert.match(material.vertexShader, /skinbase_vertex/);
  assert.match(material.vertexShader, /skinnormal_vertex/);
  assert.match(material.vertexShader, /skinning_vertex/);
  assert.match(material.vertexShader, /mat3\(modelViewMatrix\).*vSkinnedNormal/);
  material.dispose();
});
