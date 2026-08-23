import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { BrawlerViewerControls } from "@/components/BrawlerViewerControls";
import { brawlerAssetCatalogUrl, catalogEntryLabel, catalogEntryToViewerManifest, createBrawlerAssetCatalogRequestCache, loadBrawlerAssetCatalog, selectCatalogViewerEntry, type BrawlerAssetCatalog, type BrawlerAssetCatalogEntry } from "@/lib/brawler-asset-catalog";
import { BrawlerViewerRuntime } from "@/lib/brawler-viewer-runtime";
import { brawlerModel3dAsset, brawlerModel3dUrl } from "@/lib/brawler-models";
import { createOutlineCompositeMaterial, type ViewerFeature } from "@/lib/brawler-viewer-contract";

type BrawlerModelViewerProps = { brawlerId: number; alt: string; artworkSrc: string; fallbackSrc?: string; artworkKind: "model"; className?: string };
type ViewerState = { model: "unavailable" | "loading" | "ready" | "failed"; playing: boolean; faceEnabled: boolean; outlineEnabled: boolean; animationKey?: string };
const requestCatalog = createBrawlerAssetCatalogRequestCache((brawlerId) => loadBrawlerAssetCatalog(brawlerAssetCatalogUrl(), brawlerId));

function materialTextures(material: THREE.Material): readonly (THREE.Texture | null)[] {
  if (material instanceof THREE.MeshStandardMaterial) return [material.map, material.lightMap, material.aoMap, material.emissiveMap, material.bumpMap, material.normalMap, material.displacementMap, material.roughnessMap, material.metalnessMap, material.alphaMap, material.envMap];
  if (material instanceof THREE.MeshBasicMaterial) return [material.map, material.lightMap, material.aoMap, material.alphaMap, material.envMap];
  return [];
}
function disposeLegacyModel(model: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); const textures = new Set<THREE.Texture>();
  model.traverse((object) => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); for (const material of (Array.isArray(object.material) ? object.material : [object.material])) { materials.add(material); materialTextures(material).forEach((texture) => { if (texture) textures.add(texture); }); } });
  geometries.forEach((geometry) => geometry.dispose()); textures.forEach((texture) => texture.dispose()); materials.forEach((material) => material.dispose());
}
function embeddedIdleClip(animations: readonly THREE.AnimationClip[]): THREE.AnimationClip | undefined { return animations.find((animation) => animation.duration > 0 && animation.tracks.length > 0); }
function fitCamera(camera: THREE.PerspectiveCamera, bounds: THREE.Box3, direction: THREE.Vector3): number {
  const corners: THREE.Vector3[] = []; for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
  camera.position.copy(direction); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); const horizontal = vertical * camera.aspect;
  return corners.reduce((required, corner) => { const view = camera.worldToLocal(corner.clone()); return Math.max(required, 1 + view.z + Math.abs(view.y) / vertical, 1 + view.z + Math.abs(view.x) / horizontal); }, 1) * 1.08;
}
function reportFallback(brawlerId: number, reason: string, error?: unknown): void { const detail = error instanceof Error && error.message ? ` (${error.message})` : ""; console.warn(`[BrawlerModelViewer] ${brawlerId}: ${reason}${detail}`); }
function entryFeature(entry: BrawlerAssetCatalogEntry | undefined, feature: "face" | "outline"): ViewerFeature {
  if (feature === "outline" && entry?.capabilities?.outline?.enabled) return { kind: "available" };
  if (feature === "face" && entry && Object.values(entry.faces).some((face) => face.ready && face.resolved)) return { kind: "available" };
  return { kind: "unavailable", reason: "not-captured" };
}

export function BrawlerModelViewer({ brawlerId, alt, artworkSrc, fallbackSrc, artworkKind, className }: BrawlerModelViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const runtimeRef = useRef<BrawlerViewerRuntime | undefined>(undefined); const legacyActionRef = useRef<THREE.AnimationAction | null>(null);
  const [catalog, setCatalog] = useState<BrawlerAssetCatalog>(); const [selectedSkin, setSelectedSkin] = useState<string>(); const [selectedAnimation, setSelectedAnimation] = useState<string>();
  const [state, setState] = useState<ViewerState>({ model: "unavailable", playing: false, faceEnabled: false, outlineEnabled: false });
  const legacyAsset = brawlerModel3dAsset(brawlerId); const legacyUrl = brawlerModel3dUrl(brawlerId);
  const selection = useMemo(() => selectCatalogViewerEntry(catalog, brawlerId, selectedSkin, selectedAnimation), [catalog, brawlerId, selectedSkin, selectedAnimation]);
  const { entries, selectedEntry, animationOptions, activeAnimation } = selection;
  const manifest = useMemo(() => selectedEntry ? catalogEntryToViewerManifest(selectedEntry) : undefined, [selectedEntry]);

  useEffect(() => { let cancelled = false; setCatalog(undefined); void requestCatalog(brawlerId).then((value) => { if (!cancelled) setCatalog(value); }).catch(() => { /* PNG/legacy fallback is intentional when catalog is absent. */ }); return () => { cancelled = true; }; }, [brawlerId]);
  useEffect(() => { if (!selectedEntry) return; setSelectedSkin(selectedEntry.skinId); setSelectedAnimation(Object.keys(selectedEntry.animations).find((key) => selectedEntry.animations[key]?.exported.kind === "ready")); }, [selectedEntry]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; let cancelled = false; let frame = 0; let renderer: THREE.WebGLRenderer | undefined; let controls: OrbitControls | undefined; let resizeObserver: ResizeObserver | undefined; let legacyModel: THREE.Object3D | undefined; let legacyMixer: THREE.AnimationMixer | undefined; let runtime: BrawlerViewerRuntime | undefined;
    const outlineScene = new THREE.Scene(); const outlineCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); const outlineMaterial = createOutlineCompositeMaterial(); const outlineQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outlineMaterial); outlineScene.add(outlineQuad);
    runtimeRef.current = undefined; legacyActionRef.current = null; setState({ model: manifest ? "loading" : legacyUrl ? "loading" : "unavailable", playing: false, faceEnabled: false, outlineEnabled: false, animationKey: activeAnimation });
    const load = async () => {
      try {
        if (manifest && activeAnimation) {
          const gltfLoader = new GLTFLoader(); runtime = new BrawlerViewerRuntime(manifest, { loadModel: async (url) => { const gltf = await gltfLoader.loadAsync(url); return { scene: gltf.scene, animations: gltf.animations }; }, loadTexture: async (url) => new THREE.TextureLoader().loadAsync(url), loadBinary: async (url) => { const response = await fetch(url); if (!response.ok) throw new Error(`face asset request failed: ${response.status}`); return response.arrayBuffer(); } });
          runtimeRef.current = runtime; await runtime.loadBase(); await runtime.selectAnimation(activeAnimation); if (cancelled) return; const animationEntry = manifest.animations[activeAnimation]; const hasFace = animationEntry?.[1].kind === "ready" && animationEntry?.[2].kind === "ready"; runtime.setFaceEnabled(hasFace); runtime.setOutlineEnabled(manifest.outline.kind === "available");
        } else if (legacyUrl) {
          const gltf = await new GLTFLoader().loadAsync(legacyUrl); legacyModel = gltf.scene; const idle = embeddedIdleClip(gltf.animations); if (!idle) throw new Error("self-contained GLB contains no embedded idle animation"); if (!legacyModel.getObjectByProperty("isMesh", true)) throw new Error("model contains no renderable mesh"); legacyMixer = new THREE.AnimationMixer(legacyModel); legacyActionRef.current = legacyMixer.clipAction(idle); legacyActionRef.current.play();
        } else return;
        if (cancelled) return;
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas }); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearAlpha(0); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
        const root = runtime?.root ?? legacyModel!; root.updateMatrixWorld(true); const bounds = runtime?.getFramingBounds() ?? new THREE.Box3().setFromObject(root, true); const center = bounds.getCenter(new THREE.Vector3()); const size = bounds.getSize(new THREE.Vector3()); const largest = Math.max(size.x, size.y, size.z); if (!Number.isFinite(largest) || largest <= 0) throw new Error("model has invalid dimensions");
        const wrapper = new THREE.Group(); wrapper.add(root); wrapper.position.copy(center).multiplyScalar(-1); wrapper.updateMatrixWorld(true); const centered = new THREE.Box3().setFromObject(wrapper); const scene = new THREE.Scene(); scene.add(wrapper); const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(3, 5, 4); scene.add(key); const fill = new THREE.DirectionalLight(0xb8d5ff, 0.35); fill.position.set(-4, 2, 1); scene.add(fill); scene.add(new THREE.HemisphereLight(0xffffff, 0x26364a, 0.55));
        const camera = new THREE.PerspectiveCamera(runtime ? 20 : 32, 1, 0.01, largest * 20); const direction = new THREE.Vector3(0.18, 0.05, 1.18).normalize();
        // HomeScreenScale is a source-authored framing hint. Apply it relative to
        // the reference 290 value, but cap the zoom so tall/wide skins never clip.
        const scaleHint = runtime ? THREE.MathUtils.clamp((manifest?.cameraScale ?? 290) / 290, 0.72, 1.05) : 1;
        const fit = () => { const distance = fitCamera(camera, centered, direction) / scaleHint; camera.position.copy(direction).multiplyScalar(distance); camera.lookAt(0, 0, 0); controls?.target.set(0, 0, 0); controls?.update(); }; controls = new OrbitControls(camera, canvas); controls.enableDamping = !window.matchMedia("(prefers-reduced-motion: reduce)").matches; controls.enablePan = false; fit(); controls.minDistance = camera.position.length() * 0.72; controls.maxDistance = camera.position.length() * 1.85;
        const resize = () => { if (!renderer) return; const width = Math.max(canvas.clientWidth, 1); const height = Math.max(canvas.clientHeight, 1); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); fit(); }; resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas.parentElement ?? canvas); resize();
        const clock = new THREE.Clock(); const render = () => { if (cancelled || !renderer || !controls) return; const delta = clock.getDelta(); runtime?.update(delta); legacyMixer?.update(delta); controls.update(delta); if (runtime?.getState().faceEnabled) runtime.renderFace(renderer); if (runtime?.getState().outlineEnabled) { outlineMaterial.uniforms.tDiffuse.value = runtime.renderOutline(renderer, camera, wrapper); renderer.render(outlineScene, outlineCamera); } else renderer.render(scene, camera); const nextPlaying = runtime?.getState().playing ?? !legacyActionRef.current?.paused; const nextFace = runtime?.getState().faceEnabled ?? false; const nextOutline = runtime?.getState().outlineEnabled ?? false; setState((current) => current.model === "ready" && current.playing === nextPlaying && current.faceEnabled === nextFace && current.outlineEnabled === nextOutline ? current : { ...current, model: "ready", playing: nextPlaying, faceEnabled: nextFace, outlineEnabled: nextOutline }); frame = window.requestAnimationFrame(render); }; render();
      } catch (error: unknown) { if (!cancelled) { setState((current) => ({ ...current, model: "failed", playing: false })); reportFallback(brawlerId, "catalog or GLB load failed; keeping PNG fallback", error); } }
    }; void load();
    return () => { cancelled = true; window.cancelAnimationFrame(frame); resizeObserver?.disconnect(); controls?.dispose(); runtime?.dispose(); runtimeRef.current = undefined; legacyMixer?.stopAllAction(); if (legacyMixer && legacyModel) legacyMixer.uncacheRoot(legacyModel); if (legacyModel) disposeLegacyModel(legacyModel); renderer?.dispose(); outlineQuad.geometry.dispose(); outlineMaterial.dispose(); };
  }, [activeAnimation, brawlerId, legacyUrl, manifest]);

  const togglePlaying = () => { if (runtimeRef.current) { const next = !runtimeRef.current.getState().playing; runtimeRef.current.setPlaying(next); setState((current) => ({ ...current, playing: next })); return; } const action = legacyActionRef.current; if (!action) return; action.paused = !action.paused; setState((current) => ({ ...current, playing: !action.paused })); };
  const hasCatalogRuntime = Boolean(manifest && activeAnimation); const modelReady = state.model === "ready"; const selectedFaceReady = Boolean(manifest && activeAnimation && manifest.animations[activeAnimation]?.[1].kind === "ready" && manifest.animations[activeAnimation]?.[2].kind === "ready"); const featureFace = hasCatalogRuntime && selectedFaceReady ? { kind: "available" } satisfies ViewerFeature : { kind: "unavailable", reason: hasCatalogRuntime ? "not-captured" : "transform-unverified" } satisfies ViewerFeature; const featureOutline = hasCatalogRuntime ? entryFeature(selectedEntry, "outline") : { kind: "unavailable", reason: "not-captured" } satisfies ViewerFeature;
  const modelDataState = state.model === "failed" ? "failed" : state.model === "ready" ? "ready" : state.model === "loading" ? "loading" : "unavailable";
  return <div className={`relative isolate h-full min-h-[24rem] w-full overflow-visible ${className ?? ""}`} data-idle-state={state.model} data-model-state={modelDataState}>
    <ImageWithFallback src={artworkSrc} fallbackSrc={fallbackSrc} alt={alt} data-art-kind={artworkKind} className={`absolute inset-0 h-full w-full object-contain drop-shadow-2xl transition-opacity duration-300 ${modelReady ? "opacity-0" : "opacity-100"}`} />
    {hasCatalogRuntime || legacyAsset ? <canvas ref={canvasRef} aria-hidden="true" className={`absolute inset-x-0 -inset-y-8 h-[calc(100%+4rem)] w-full touch-none transition-opacity duration-300 ${modelReady ? "cursor-grab opacity-100 active:cursor-grabbing" : "pointer-events-none opacity-0"}`} /> : null}
    {hasCatalogRuntime || legacyAsset ? <BrawlerViewerControls playing={state.playing} skinOptions={entries.map((entry) => ({ id: entry.skinId, label: catalogEntryLabel(entry) }))} animationOptions={animationOptions} selectedSkin={selectedEntry?.skinId} selectedAnimation={activeAnimation} onSelectSkin={(skinId) => { if (entries.some((entry) => entry.skinId === skinId)) setSelectedSkin(skinId); }} onSelectAnimation={setSelectedAnimation} face={featureFace} outline={featureOutline} faceEnabled={state.faceEnabled} outlineEnabled={state.outlineEnabled} onTogglePlaying={togglePlaying} onToggleFace={() => { const next = !state.faceEnabled; runtimeRef.current?.setFaceEnabled(next); setState((current) => ({ ...current, faceEnabled: next })); }} onToggleOutline={() => { const next = !state.outlineEnabled; runtimeRef.current?.setOutlineEnabled(next); setState((current) => ({ ...current, outlineEnabled: next })); }} /> : null}
  </div>;
}
