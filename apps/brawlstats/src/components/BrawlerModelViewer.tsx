import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { brawlerModel3dUrl } from "@/lib/brawler-models";

type ModelValidation =
  | { kind: "valid"; animation: THREE.AnimationClip }
  | { kind: "invalid"; reason: string };

type MaterialInspection =
  | { kind: "valid" }
  | { kind: "invalid"; reason: string };

function materialTextureSlots(material: THREE.Material): readonly (THREE.Texture | null)[] {
  if (material instanceof THREE.MeshPhysicalMaterial) {
    return [
      material.map,
      material.lightMap,
      material.aoMap,
      material.emissiveMap,
      material.bumpMap,
      material.normalMap,
      material.displacementMap,
      material.roughnessMap,
      material.metalnessMap,
      material.alphaMap,
      material.envMap,
      material.anisotropyMap,
      material.clearcoatMap,
      material.clearcoatRoughnessMap,
      material.clearcoatNormalMap,
      material.iridescenceMap,
      material.iridescenceThicknessMap,
      material.sheenColorMap,
      material.sheenRoughnessMap,
      material.transmissionMap,
      material.thicknessMap,
      material.specularIntensityMap,
      material.specularColorMap,
    ];
  }

  if (material instanceof THREE.MeshStandardMaterial) {
    return [
      material.map,
      material.lightMap,
      material.aoMap,
      material.emissiveMap,
      material.bumpMap,
      material.normalMap,
      material.displacementMap,
      material.roughnessMap,
      material.metalnessMap,
      material.alphaMap,
      material.envMap,
    ];
  }

  if (material instanceof THREE.MeshBasicMaterial) {
    return [material.map, material.lightMap, material.aoMap, material.alphaMap, material.envMap];
  }

  return [];
}

function hasImageDimensions(image: unknown): boolean {
  if (typeof image !== "object" || image === null || !("width" in image) || !("height" in image)) return false;
  return typeof image.width === "number" && image.width > 0 && typeof image.height === "number" && image.height > 0;
}

function inspectMaterial(material: THREE.Material): MaterialInspection {
  if (!(material instanceof THREE.Material) || !material.visible || material.opacity <= 0) {
    return { kind: "invalid", reason: "model contains an unusable material" };
  }

  const textureSlots = materialTextureSlots(material);
  if (textureSlots.some((texture) => texture !== null && !(texture instanceof THREE.Texture))) {
    return { kind: "invalid", reason: "model contains an invalid texture" };
  }

  if (textureSlots.some((texture) => texture instanceof THREE.Texture && !hasImageDimensions(texture.image))) {
    return { kind: "invalid", reason: "model texture did not load" };
  }

  return { kind: "valid" };
}

function validateModel(gltf: GLTF): ModelValidation {
  let meshCount = 0;
  let materialCount = 0;
  let invalidMaterialReason: string | undefined;

  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    meshCount += 1;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.length === 0) {
      invalidMaterialReason = "model mesh has no material";
      return;
    }

    for (const material of materials) {
      const inspection = inspectMaterial(material);
      if (inspection.kind === "invalid") {
        invalidMaterialReason = inspection.reason;
        return;
      }
      materialCount += 1;
    }
  });

  if (meshCount === 0) return { kind: "invalid", reason: "model contains no renderable mesh" };
  if (invalidMaterialReason) return { kind: "invalid", reason: invalidMaterialReason };
  if (materialCount === 0) return { kind: "invalid", reason: "model contains no usable material" };

  const playableAnimations = gltf.animations.filter((animation) => animation.duration > 0 && animation.tracks.length > 0);
  const animation = playableAnimations.find((candidate) => /idle/i.test(candidate.name)) ?? playableAnimations[0];
  if (!animation) return { kind: "invalid", reason: "model contains no embedded animation" };

  return { kind: "valid", animation };
}

function disposeModelResources(model: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of meshMaterials) {
      if (!(material instanceof THREE.Material)) continue;
      materials.add(material);
      for (const texture of materialTextureSlots(material)) {
        if (texture instanceof THREE.Texture) textures.add(texture);
      }
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
}

function reportModelFallback(brawlerId: number, reason: string, error?: unknown): void {
  const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
  console.warn(`[BrawlerModelViewer] ${brawlerId}: ${reason}${detail}`);
}

type BrawlerModelViewerProps = {
  brawlerId: number;
  alt: string;
  artworkSrc: string;
  fallbackSrc?: string;
  artworkKind: "model";
  className?: string;
};

export function BrawlerModelViewer({
  brawlerId,
  alt,
  artworkSrc,
  fallbackSrc,
  artworkKind,
  className,
}: BrawlerModelViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [modelReady, setModelReady] = useState(false);
  const modelUrl = brawlerModel3dUrl(brawlerId);

  useEffect(() => {
    setModelReady(false);
    const canvas = canvasRef.current;
    if (!canvas || !modelUrl) return;

    let cancelled = false;
    let animationFrame = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let mixer: THREE.AnimationMixer | undefined;
    let model: THREE.Object3D | undefined;

    const loadModel = async () => {
      try {
        const gltf = await new GLTFLoader().loadAsync(modelUrl);
        if (cancelled) {
          disposeModelResources(gltf.scene);
          return;
        }

        const validation = validateModel(gltf);
        if (validation.kind === "invalid") {
          disposeModelResources(gltf.scene);
          reportModelFallback(brawlerId, `${validation.reason}; keeping PNG fallback`);
          return;
        }

        const loadedModel = gltf.scene;
        model = loadedModel;
        loadedModel.traverse((object) => {
          if (object instanceof THREE.SkinnedMesh) object.pose();
        });

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas });
        renderer.setClearAlpha(0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));

        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2.2));
        const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
        keyLight.position.set(3, 4, 5);
        scene.add(keyLight);

        const bounds = new THREE.Box3().setFromObject(loadedModel);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const largestDimension = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(largestDimension) || largestDimension <= 0) {
          disposeModelResources(loadedModel);
          model = undefined;
          renderer.dispose();
          renderer = undefined;
          reportModelFallback(brawlerId, "model has invalid dimensions; keeping PNG fallback");
          return;
        }

        loadedModel.position.sub(center);
        const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
        camera.position.set(largestDimension * 0.45, largestDimension * 0.15, largestDimension * 2.2);
        camera.lookAt(0, 0, 0);
        scene.add(loadedModel);
        mixer = new THREE.AnimationMixer(loadedModel);
        mixer.clipAction(validation.animation, loadedModel).reset().play();

        const resize = () => {
          if (!renderer) return;
          const width = canvas.clientWidth;
          const height = canvas.clientHeight;
          renderer.setSize(width, height, false);
          camera.aspect = width / Math.max(height, 1);
          camera.updateProjectionMatrix();
        };

        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        resize();
        setModelReady(true);

        const clock = new THREE.Clock();
        const render = () => {
          if (cancelled || !renderer) return;
          mixer?.update(clock.getDelta());
          loadedModel.rotation.y += 0.0035;
          renderer.render(scene, camera);
          animationFrame = window.requestAnimationFrame(render);
        };
        render();
      } catch (error: unknown) {
        window.cancelAnimationFrame(animationFrame);
        mixer?.stopAllAction();
        if (mixer && model) mixer.uncacheRoot(model);
        if (model) {
          disposeModelResources(model);
          model = undefined;
        }
        resizeObserver?.disconnect();
        renderer?.dispose();
        renderer = undefined;
        if (!cancelled) {
          setModelReady(false);
          reportModelFallback(brawlerId, "GLB, texture, or CORS load failed; keeping PNG fallback", error);
        }
      }
    };

    void loadModel();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      mixer?.stopAllAction();
      if (mixer && model) mixer.uncacheRoot(model);
      if (model) disposeModelResources(model);
      renderer?.dispose();
    };
  }, [brawlerId, modelUrl]);

  return (
    <div className={className}>
      <ImageWithFallback
        src={artworkSrc}
        fallbackSrc={fallbackSrc}
        alt={alt}
        data-art-kind={artworkKind}
        className="h-full w-full object-contain drop-shadow-2xl"
      />
      {modelUrl ? (
        <canvas
          ref={canvasRef}
          aria-label={`${alt} 3D model`}
          aria-hidden={!modelReady}
          className={`absolute inset-0 h-full w-full transition-opacity ${modelReady ? "opacity-100" : "pointer-events-none opacity-0"}`}
        />
      ) : null}
    </div>
  );
}
