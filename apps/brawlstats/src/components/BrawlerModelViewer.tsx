import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import {
  brawlerModel3dAsset,
  brawlerModel3dUrl,
  brawlerModelAnimationUrl,
} from "@/lib/brawler-models";
import { appPath } from "@/lib/paths";

function materialTextures(material: THREE.Material): readonly (THREE.Texture | null)[] {
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

function disposeModelResources(model: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of meshMaterials) {
      materials.add(material);
      for (const texture of materialTextures(material)) {
        if (texture) textures.add(texture);
      }
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
}

function applyDiffuseAtlas(model: THREE.Object3D, texture: THREE.Texture): number {
  const replacedMaterials = new Set<THREE.Material>();
  const replacedTextures = new Set<THREE.Texture>();
  const normalizedGeometries = new Set<THREE.BufferGeometry>();
  const previewMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
  });
  let meshCount = 0;

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    meshCount += 1;
    if (!normalizedGeometries.has(object.geometry)) {
      const uv = object.geometry.getAttribute("uv");
      if (uv && !uv.normalized) {
        const normalizedUv = new Float32Array(uv.count * 2);
        for (let index = 0; index < uv.count; index += 1) {
          normalizedUv[index * 2] = uv.getX(index) / 4096;
          normalizedUv[index * 2 + 1] = uv.getY(index) / 4096;
        }
        object.geometry.setAttribute("uv", new THREE.BufferAttribute(normalizedUv, 2));
      }
      normalizedGeometries.add(object.geometry);
    }
    const previousMaterials = Array.isArray(object.material) ? object.material : [object.material];
    previousMaterials.forEach((material) => {
      replacedMaterials.add(material);
      materialTextures(material).forEach((materialTexture) => {
        if (materialTexture && materialTexture !== texture) replacedTextures.add(materialTexture);
      });
    });
    object.material = Array.isArray(object.material)
      ? object.material.map(() => previewMaterial)
      : previewMaterial;
  });

  replacedTextures.forEach((materialTexture) => materialTexture.dispose());
  replacedMaterials.forEach((material) => material.dispose());
  return meshCount;
}

function rotationOnlyIdleClip(animations: readonly THREE.AnimationClip[]): THREE.AnimationClip | undefined {
  for (const animation of animations) {
    if (animation.duration <= 0) continue;
    const rotationTracks = animation.tracks.filter(
      (track): track is THREE.QuaternionKeyframeTrack => track instanceof THREE.QuaternionKeyframeTrack,
    );
    if (rotationTracks.length > 0) {
      return new THREE.AnimationClip(`${animation.name || "idle"}-in-place`, animation.duration, rotationTracks);
    }
  }
  return undefined;
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

type IdleAnimationState = "unavailable" | "loading" | "playing" | "failed";

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
  const [idleAnimationState, setIdleAnimationState] = useState<IdleAnimationState>("unavailable");
  const modelAsset = brawlerModel3dAsset(brawlerId);
  const modelUrl = brawlerModel3dUrl(brawlerId);
  const animationUrl = brawlerModelAnimationUrl(brawlerId);
  const textureUrl = modelAsset ? appPath(`/assets/brawlers/3d/${brawlerId}.webp`) : undefined;

  useEffect(() => {
    setModelReady(false);
    setIdleAnimationState(animationUrl ? "loading" : "unavailable");
    const canvas = canvasRef.current;
    if (!canvas || !modelUrl || !textureUrl) return;

    let cancelled = false;
    let animationFrame = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let mixer: THREE.AnimationMixer | undefined;
    let model: THREE.Object3D | undefined;

    const loadModel = async () => {
      let loadingStage = "geometry";
      try {
        const loadingManager = new THREE.LoadingManager();
        loadingManager.setURLModifier((url) => {
          if (/\.pvr(?:$|\?)/i.test(url)) return textureUrl;
          if (/menu_(?:metal_)?(?:diffuse|specular)_lightmap\.png(?:$|\?)/i.test(url)) return textureUrl;
          return url;
        });
        const loader = new GLTFLoader(loadingManager);
        const modelGltf = await loader.loadAsync(modelUrl);
        model = modelGltf.scene;
        if (cancelled) {
          disposeModelResources(model);
          model = undefined;
          return;
        }

        loadingStage = "diffuse atlas";
        const texture = await new THREE.TextureLoader().loadAsync(textureUrl);
        if (cancelled) {
          texture.dispose();
          disposeModelResources(model);
          model = undefined;
          return;
        }

        loadingStage = "WebGL renderer";
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.needsUpdate = true;
        const meshCount = applyDiffuseAtlas(model, texture);
        if (meshCount === 0) throw new Error("model contains no renderable mesh");

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearAlpha(0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
        texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

        const scene = new THREE.Scene();
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const largestDimension = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(largestDimension) || largestDimension <= 0) {
          throw new Error("model has invalid dimensions");
        }

        model.position.sub(center);
        scene.add(model);
        const camera = new THREE.PerspectiveCamera(32, 1, 0.01, largestDimension * 20);
        const distance = largestDimension / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        camera.position.set(distance * 0.18, distance * 0.05, distance * 1.18);
        camera.lookAt(0, 0, 0);

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        controls = new OrbitControls(camera, canvas);
        controls.enableDamping = !reducedMotion;
        controls.enablePan = false;
        controls.autoRotate = false;
        controls.minDistance = distance * 0.72;
        controls.maxDistance = distance * 1.85;
        controls.target.set(0, 0, 0);
        controls.update();

        const resize = () => {
          if (!renderer) return;
          const width = Math.max(canvas.clientWidth, 1);
          const height = Math.max(canvas.clientHeight, 1);
          const renderedSize = renderer.getSize(new THREE.Vector2());
          if (renderedSize.x === width && renderedSize.y === height) return;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };

        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas.parentElement ?? canvas);
        resize();
        setModelReady(true);

        const clock = new THREE.Clock();
        const render = () => {
          if (cancelled || !renderer || !controls) return;
          const elapsed = clock.getDelta();
          mixer?.update(elapsed);
          controls.update(elapsed);
          renderer.render(scene, camera);
          animationFrame = window.requestAnimationFrame(render);
        };
        render();

        if (animationUrl) {
          void loader.loadAsync(animationUrl).then((animationGltf) => {
            const idleClip = rotationOnlyIdleClip(animationGltf.animations);
            disposeModelResources(animationGltf.scene);
            if (cancelled || !model) return;
            if (!idleClip) {
              setIdleAnimationState("failed");
              reportModelFallback(brawlerId, "idle clip contains no usable bone rotations; keeping static model");
              return;
            }

            mixer = new THREE.AnimationMixer(model);
            mixer.clipAction(idleClip).reset().play();
            setIdleAnimationState("playing");
          }).catch((error: unknown) => {
            if (cancelled) return;
            setIdleAnimationState("failed");
            reportModelFallback(brawlerId, "idle animation failed; keeping static model", error);
          });
        }

      } catch (error: unknown) {
        window.cancelAnimationFrame(animationFrame);
        resizeObserver?.disconnect();
        controls?.dispose();
        mixer?.stopAllAction();
        if (mixer && model) mixer.uncacheRoot(model);
        if (model) {
          disposeModelResources(model);
          model = undefined;
        }
        renderer?.dispose();
        renderer = undefined;
        if (!cancelled) {
          setModelReady(false);
          reportModelFallback(brawlerId, `${loadingStage} failed; keeping PNG fallback`, error);
        }
      }
    };

    void loadModel();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      controls?.dispose();
      mixer?.stopAllAction();
      if (mixer && model) mixer.uncacheRoot(model);
      if (model) disposeModelResources(model);
      renderer?.dispose();
    };
  }, [animationUrl, brawlerId, modelUrl, textureUrl]);

  return (
    <div
      className={className}
      data-idle-state={idleAnimationState}
      data-model-state={modelReady ? "ready" : modelAsset ? "loading" : "unavailable"}
    >
      <ImageWithFallback
        src={artworkSrc}
        fallbackSrc={fallbackSrc}
        alt={alt}
        data-art-kind={artworkKind}
        className={`h-full w-full object-contain drop-shadow-2xl transition-opacity duration-300 ${modelReady ? "opacity-0" : "opacity-100"}`}
      />
      {modelAsset ? (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={`absolute inset-0 h-full w-full touch-none transition-opacity duration-300 ${modelReady ? "cursor-grab opacity-100 active:cursor-grabbing" : "pointer-events-none opacity-0"}`}
        />
      ) : null}
    </div>
  );
}
