import * as THREE from "three";
import type { ScMaterialMetadata } from "./brawler-viewer-contract.ts";

export type ScMaterialTextures = {
  readonly diffuse?: THREE.Texture;
  readonly diffuseLightmap?: THREE.Texture;
  readonly specularLightmap?: THREE.Texture;
  readonly stencil?: THREE.Texture;
};

export function blendStencilColor(
  diffuse: readonly [number, number, number],
  stencil: readonly [number, number, number],
  stencilAlpha: number,
  factor: number,
): readonly [number, number, number] {
  const weight = stencilAlpha * factor;
  return [
    diffuse[0] * (1 - weight) + stencil[0] * factor,
    diffuse[1] * (1 - weight) + stencil[1] * factor,
    diffuse[2] * (1 - weight) + stencil[2] * factor,
  ];
}

export function diffuseUvTransform(metadata: Pick<ScMaterialMetadata, "uvSource">): readonly [number, number, number, number] {
  switch (metadata.uvSource) {
    case "KHR_texture_transform": return [1 / 4096, 1 / 4096, 0, 0];
    case "COLLADA2GLTF": return [1, -1, 0, 1];
    case "67/68": return [2, 2, 0, 0];
    default: return [1, 1, 0, 0];
  }
}

export function stencilUvTransform(metadata: Pick<ScMaterialMetadata, "stencilUvPolicy">): readonly [number, number, number, number] {
  switch (metadata.stencilUvPolicy) {
    case "identity": return [1, 1, 0, 0];
    case "2x-identity": return [2, 2, 0, 0];
    case "2x-flip-y": return [2, -2, 0, 1];
    default: return [1, -1, 0, 1];
  }
}

export function createScMaterial(metadata: ScMaterialMetadata, textures: ScMaterialTextures = {}, skinned = false): THREE.ShaderMaterial {
  void skinned;
  const transform = diffuseUvTransform(metadata);
  const stencilTransform = stencilUvTransform(metadata);
  const opacity = metadata.opacity ?? 1;
  // Stencil is an in-place colour overlay. The reference uber material keeps
  // depth testing/writes enabled while applying it; treating stencil as
  // transparency lets overlapping double-sided triangles blend independently
  // and produces the faceted/scrambled body seen on bridge geometry.
  const transparent = opacity < 1;
  // ShaderMaterial passes custom defines straight into GLSL. Boolean values
  // become `#define USE_DIFFUSE true`, which is invalid in a preprocessor
  // conditional on WebGL2. Use integer feature flags instead.
  const defines: Record<string, number> = {
    USE_DIFFUSE: metadata.diffuse === true && textures.diffuse !== undefined ? 1 : 0,
    USE_LIGHTMAP: metadata.lightmapDiffuse === true && textures.diffuseLightmap !== undefined ? 1 : 0,
    USE_SPECULAR: metadata.specular === true && textures.specularLightmap !== undefined ? 1 : 0,
    USE_STENCIL: metadata.stencil === true ? 1 : 0,
  };
  const material = new THREE.ShaderMaterial({
    // Three.js adds USE_SKINNING from the actual SkinnedMesh. Defining it here
    // as well makes WebGLProgram emit a duplicate macro and fails compilation.
    defines,
    uniforms: {
      diffuseTex: { value: textures.diffuse ?? null },
      diffuseLightmap: { value: textures.diffuseLightmap ?? null },
      specularLightmap: { value: textures.specularLightmap ?? null },
      stencilTex: { value: textures.stencil ?? null },
      diffuseUvTransform: { value: new THREE.Vector4(...transform) },
      stencilUvTransform: { value: new THREE.Vector4(...stencilTransform) },
      opacity: { value: opacity },
    },
    vertexShader: `#include <common>
#include <skinning_pars_vertex>
uniform vec4 diffuseUvTransform;
uniform vec4 stencilUvTransform;
varying vec2 vDiffuseUv;
varying vec2 vLightUv;
varying vec2 vStencilUv;
varying vec3 vSkinnedNormal;
void main(){
  vec3 transformed = position;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  vSkinnedNormal = normalize(objectNormal);
  vDiffuseUv=uv*diffuseUvTransform.xy+diffuseUvTransform.zw;
  vLightUv=normalize(mat3(modelViewMatrix)*vSkinnedNormal).xy*vec2(0.5,-0.5)+vec2(0.5);
  // Diffuse and stencil atlases use different coordinate spaces for pinned
  // local assets. The stencil mask always starts from raw mesh UVs; applying
  // the diffuse 67/68 scale here samples the wrong face region.
  vStencilUv=uv*stencilUvTransform.xy+stencilUvTransform.zw;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(transformed,1.0);
}`,
    fragmentShader: `uniform sampler2D diffuseTex;
uniform sampler2D diffuseLightmap;
uniform sampler2D specularLightmap;
uniform sampler2D stencilTex;
uniform float opacity;
varying vec2 vDiffuseUv;
varying vec2 vLightUv;
varying vec2 vStencilUv;
void main(){
  vec4 color=vec4(1.0);
#if USE_DIFFUSE
  color*=texture2D(diffuseTex,vDiffuseUv);
#endif
#if USE_LIGHTMAP
  color.rgb*=texture2D(diffuseLightmap,vLightUv).rgb;
#endif
#if USE_SPECULAR
  vec3 specular=texture2D(specularLightmap,vLightUv).rgb;
#if USE_DIFFUSE
  // SC's SPECULAR slot samples the diffuse atlas as specularTex2D before
  // adding the lightmap contribution. Adding the lightmap by itself turns
  // dark Crow/Shelly/Colt materials into a pale wash.
  specular*=texture2D(diffuseTex,vDiffuseUv).rgb;
#endif
  color.rgb+=specular;
#endif
#if USE_STENCIL
  vec4 stencil=texture2D(stencilTex,vStencilUv);
  float factor=step(vStencilUv.x,1.0)*step(vStencilUv.y,1.0);
  color.rgb=color.rgb*(1.0-stencil.a*factor)+stencil.rgb*factor;
#endif
  color.a*=opacity;
  gl_FragColor=color;
}`,
    transparent,
    depthWrite: !transparent,
    side: THREE.DoubleSide,
  });
  return material;
}
