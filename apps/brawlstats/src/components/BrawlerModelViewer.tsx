import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import {
  brawlerModel3dAsset,
  brawlerModel3dUrl,
} from "@/lib/brawler-models";

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

function embeddedIdleClip(animations: readonly THREE.AnimationClip[]): THREE.AnimationClip | undefined {
  return animations.find((animation) => animation.duration > 0 && animation.tracks.length > 0);
}

function sampleAnimatedBounds(model: THREE.Object3D, clip: THREE.AnimationClip): THREE.Box3 {
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.play();
  const bounds = new THREE.Box3();
  const sampleTimes = [0, clip.duration * 0.25, clip.duration * 0.5, clip.duration * 0.75, clip.duration];
  for (const time of sampleTimes) {
    mixer.setTime(time);
    model.updateMatrixWorld(true);
    bounds.union(new THREE.Box3().setFromObject(model));
  }
  action.stop();
  mixer.uncacheRoot(model);
  return bounds;
}

function reportModelFallback(brawlerId: number, reason: string, error?: unknown): void {
  const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
  console.warn(`[BrawlerModelViewer] ${brawlerId}: ${reason}${detail}`);
}

function fitCameraToBounds(camera: THREE.PerspectiveCamera, bounds: THREE.Box3, direction: THREE.Vector3): number {
  const corners: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  camera.position.copy(direction);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanHorizontal = tanVertical * camera.aspect;
  const requiredDistance = corners.reduce((required, corner) => {
    const view = camera.worldToLocal(corner.clone());
    return Math.max(required, 1 + view.z + Math.abs(view.y) / tanVertical, 1 + view.z + Math.abs(view.x) / tanHorizontal);
  }, 1);
  return requiredDistance * 1.07;
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

  useEffect(() => {
    setModelReady(false);
    setIdleAnimationState(modelUrl ? "loading" : "unavailable");
    const canvas = canvasRef.current;
    if (!canvas || !modelUrl) return;

    let cancelled = false;
    let animationFrame = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let mixer: THREE.AnimationMixer | undefined;
    let model: THREE.Object3D | undefined;

    const loadModel = async () => {
      let loadingStage = "self-contained GLB";
      try {
        const loader = new GLTFLoader();
        const modelGltf = await loader.loadAsync(modelUrl);
        model = modelGltf.scene;
        if (cancelled) {
          disposeModelResources(model);
          model = undefined;
          return;
        }

        const idle = embeddedIdleClip(modelGltf.animations);
        if (!idle) throw new Error("self-contained GLB contains no embedded idle animation");
        const meshCount = model.getObjectByProperty("isMesh", true) ? 1 : 0;
        if (meshCount === 0) throw new Error("model contains no renderable mesh");
        model.rotation.y = modelAsset?.yaw ?? 0;

        loadingStage = "animated bounds";
        const bounds = sampleAnimatedBounds(model, idle);
        model.updateMatrixWorld(true);
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(idle).play();
        setIdleAnimationState("playing");

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearAlpha(0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            materialTextures(material).forEach((texture) => {
              if (texture) texture.anisotropy = Math.min(renderer?.capabilities.getMaxAnisotropy() ?? 1, 8);
            });
          });
        });

        const scene = new THREE.Scene();
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
        keyLight.position.set(3, 5, 4);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xb8d5ff, 0.35);
        fillLight.position.set(-4, 2, 1);
        scene.add(fillLight);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x26364a, 0.55));
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const largestDimension = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(largestDimension) || largestDimension <= 0) {
          throw new Error("model has invalid dimensions");
        }

        const wrapper = new THREE.Group();
        wrapper.add(model);
        wrapper.position.sub(center);
        scene.add(wrapper);
        const camera = new THREE.PerspectiveCamera(32, 1, 0.01, largestDimension * 20);
        const cameraDirection = new THREE.Vector3(0.18, 0.05, 1.18).normalize();
        const centeredBounds = bounds.clone().translate(center.clone().multiplyScalar(-1));
        const distance = fitCameraToBounds(camera, centeredBounds, cameraDirection);
        camera.position.copy(cameraDirection).multiplyScalar(distance);
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
          const fittedDistance = fitCameraToBounds(camera, centeredBounds, cameraDirection);
          camera.position.copy(cameraDirection).multiplyScalar(fittedDistance);
          camera.lookAt(0, 0, 0);
          if (controls) {
            controls.minDistance = fittedDistance * 0.72;
            controls.maxDistance = fittedDistance * 1.85;
            controls.update();
          }
        };

        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas.parentElement ?? canvas);
        resize();
        const clock = new THREE.Clock();
        let renderedOnce = false;
        const render = () => {
          if (cancelled || !renderer || !controls) return;
          const elapsed = clock.getDelta();
          mixer?.update(elapsed);
          controls.update(elapsed);
          renderer.render(scene, camera);
          if (!renderedOnce) {
            renderedOnce = true;
            setModelReady(true);
          }
          animationFrame = window.requestAnimationFrame(render);
        };
        render();

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
          setIdleAnimationState("failed");
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
  }, [brawlerId, modelUrl]);

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
