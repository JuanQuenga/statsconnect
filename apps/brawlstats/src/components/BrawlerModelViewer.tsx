import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { BrawlerViewerControls } from "@/components/BrawlerViewerControls";
import { brawlerAssetCatalogUrl, catalogEntryLabel, catalogEntryToViewerManifest, createBrawlerAssetCatalogRequestCache, loadBrawlerAssetCatalog, selectCatalogViewerEntry, type BrawlerAssetCatalog, type BrawlerAssetCatalogEntry } from "@/lib/brawler-asset-catalog";
import { BrawlerViewerRuntime, centerModelForFraming, fitPerspectiveCameraDistance, selectHomeAnimationSequence, startupFramingBounds } from "@/lib/brawler-viewer-runtime";
import { brawlerModel3dAsset, brawlerModel3dUrl } from "@/lib/brawler-models";
import { createOutlineCompositeMaterial, type ViewerFeature } from "@/lib/brawler-viewer-contract";

type BrawlerModelViewerProps = { brawlerId: number; alt: string; artworkSrc: string; fallbackSrc?: string; artworkMaxWidth?: number; artworkKind: "model"; className?: string };
type ViewerState = { model: "unavailable" | "loading" | "ready" | "failed"; playing: boolean; playbackAvailable: boolean; faceEnabled: boolean; outlineEnabled: boolean; animationKey?: string };
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
function reportFallback(brawlerId: number, reason: string, error?: unknown): void { const detail = error instanceof Error && error.message ? ` (${error.message})` : ""; console.warn(`[BrawlerModelViewer] ${brawlerId}: ${reason}${detail}`); }
function entryFeature(entry: BrawlerAssetCatalogEntry | undefined, feature: "face" | "outline"): ViewerFeature {
  if (feature === "outline" && entry?.capabilities?.outline?.enabled) return { kind: "available" };
  if (feature === "face" && entry && Object.values(entry.faces).some((face) => face.ready && face.resolved)) return { kind: "available" };
  return { kind: "unavailable", reason: "not-captured" };
}

export function BrawlerModelViewer({ brawlerId, alt, artworkSrc, fallbackSrc, artworkMaxWidth, artworkKind, className }: BrawlerModelViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const runtimeRef = useRef<BrawlerViewerRuntime | undefined>(undefined); const legacyActionRef = useRef<THREE.AnimationAction | null>(null);
  const lastReadySelection = useRef<{ readonly brawlerId: number; readonly skinId: string | undefined } | undefined>(undefined);
  const [catalog, setCatalog] = useState<BrawlerAssetCatalog>(); const [selectedSkin, setSelectedSkin] = useState<string>(); const [selectedAnimation, setSelectedAnimation] = useState<string>();
  const [catalogPending, setCatalogPending] = useState(true);
  const [state, setState] = useState<ViewerState>({ model: "unavailable", playing: false, playbackAvailable: false, faceEnabled: false, outlineEnabled: false });
  const legacyAsset = brawlerModel3dAsset(brawlerId); const legacyUrl = brawlerModel3dUrl(brawlerId);
  const selection = useMemo(() => selectCatalogViewerEntry(catalog, brawlerId, selectedSkin, selectedAnimation), [catalog, brawlerId, selectedSkin, selectedAnimation]);
  const { entries, selectedEntry, animationOptions, activeAnimation } = selection;
  const manifest = useMemo(() => selectedEntry ? catalogEntryToViewerManifest(selectedEntry) : undefined, [selectedEntry]);
  const homeSequence = manifest && selectedAnimation === undefined ? selectHomeAnimationSequence(manifest.animations) : undefined;
  const playbackAnimation = homeSequence?.start ?? activeAnimation;

  useEffect(() => {
    let cancelled = false;
    setCatalog(undefined);
    setCatalogPending(true);
    void requestCatalog(brawlerId)
      .then((value) => { if (!cancelled) setCatalog(value); })
      .catch(() => { /* Static artwork or a legacy model remains available. */ })
      .finally(() => { if (!cancelled) setCatalogPending(false); });
    return () => { cancelled = true; };
  }, [brawlerId]);
  useEffect(() => { if (selectedEntry) setSelectedSkin(selectedEntry.skinId); }, [selectedEntry]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; let cancelled = false; let frame = 0; let renderer: THREE.WebGLRenderer | undefined; let controls: OrbitControls | undefined; let resizeObserver: ResizeObserver | undefined; let legacyModel: THREE.Object3D | undefined; let legacyMixer: THREE.AnimationMixer | undefined; let runtime: BrawlerViewerRuntime | undefined; let introTransitionStarted = false;
    const outlineScene = new THREE.Scene(); const outlineCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); const outlineMaterial = createOutlineCompositeMaterial(); const outlineQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outlineMaterial); outlineScene.add(outlineQuad);
    runtimeRef.current = undefined; legacyActionRef.current = null; setState({ model: manifest && playbackAnimation ? "loading" : legacyUrl ? "loading" : "unavailable", playing: false, playbackAvailable: false, faceEnabled: false, outlineEnabled: false, animationKey: playbackAnimation });
    const automaticIntro = homeSequence !== undefined;
    const load = async () => {
      try {
        let idleFramingBounds: THREE.Box3 | undefined;
        if (manifest && playbackAnimation) {
          const gltfLoader = new GLTFLoader(); runtime = new BrawlerViewerRuntime(manifest, { loadModel: async (url) => { const gltf = await gltfLoader.loadAsync(url); return { scene: gltf.scene, animations: gltf.animations }; }, loadTexture: async (url) => new THREE.TextureLoader().loadAsync(url), loadBinary: async (url) => { const response = await fetch(url); if (!response.ok) throw new Error(`face asset request failed: ${response.status}`); return response.arrayBuffer(); } });
          runtimeRef.current = runtime; await runtime.loadBase();
          if (homeSequence) { await runtime.selectAnimation(homeSequence.loop); idleFramingBounds = runtime.getFramingBounds(); }
          await runtime.selectAnimation(playbackAnimation); if (cancelled) return; const animationEntry = manifest.animations[playbackAnimation]; const hasFace = animationEntry?.[1].kind === "ready" && animationEntry?.[2].kind === "ready"; runtime.setFaceEnabled(hasFace); runtime.setOutlineEnabled(manifest.outline.kind === "available");
        } else if (legacyUrl) {
          const gltf = await new GLTFLoader().loadAsync(legacyUrl); legacyModel = gltf.scene; const idle = embeddedIdleClip(gltf.animations); if (!idle) throw new Error("self-contained GLB contains no embedded idle animation"); if (!legacyModel.getObjectByProperty("isMesh", true)) throw new Error("model contains no renderable mesh"); legacyMixer = new THREE.AnimationMixer(legacyModel); legacyActionRef.current = legacyMixer.clipAction(idle); legacyActionRef.current.play();
        } else return;
        if (cancelled) return;
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas }); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearAlpha(0); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
        const root = runtime?.root ?? legacyModel!; root.updateMatrixWorld(true); const currentBounds = runtime?.getFramingBounds() ?? new THREE.Box3().setFromObject(root, true); const { wrapper, bounds: centered, largestDimension: largest } = centerModelForFraming(root, idleFramingBounds ?? currentBounds); const startupBounds = idleFramingBounds ? startupFramingBounds(idleFramingBounds, currentBounds).applyMatrix4(wrapper.matrixWorld) : centered;
        const scene = new THREE.Scene(); scene.add(wrapper); const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(3, 5, 4); scene.add(key); const fill = new THREE.DirectionalLight(0xb8d5ff, 0.35); fill.position.set(-4, 2, 1); scene.add(fill); scene.add(new THREE.HemisphereLight(0xffffff, 0x26364a, 0.55));
        const camera = new THREE.PerspectiveCamera(runtime ? 20 : 32, 1, 0.01, largest * 20); const direction = new THREE.Vector3(0.18, 0.05, 1.18).normalize();
        // HomeScreenScale is a source-authored framing hint. Apply it relative to
        // the reference 290 value, but cap the zoom so tall/wide skins never clip.
        const scaleHint = runtime ? THREE.MathUtils.clamp((manifest?.cameraScale ?? 290) / 290, 0.72, 1.05) : 1;
        let framingBounds = startupBounds; let targetDistance = 0; let cameraRefitting = false;
        const fit = () => { targetDistance = fitPerspectiveCameraDistance(camera, framingBounds, direction) / scaleHint; camera.position.copy(direction).multiplyScalar(targetDistance); camera.lookAt(0, 0, 0); controls?.target.set(0, 0, 0); controls?.update(); }; controls = new OrbitControls(camera, canvas); controls.enableDamping = !window.matchMedia("(prefers-reduced-motion: reduce)").matches; controls.enablePan = false; controls.addEventListener("start", () => { cameraRefitting = false; }); fit(); controls.minDistance = camera.position.length() * 0.72; controls.maxDistance = camera.position.length() * 1.85;
        const resize = () => { if (!renderer) return; const width = Math.max(canvas.clientWidth, 1); const height = Math.max(canvas.clientHeight, 1); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); fit(); }; resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas.parentElement ?? canvas); resize();
        const clock = new THREE.Clock(); const render = () => { if (cancelled || !renderer || !controls) return; const delta = clock.getDelta(); runtime?.update(delta); legacyMixer?.update(delta);
          if (automaticIntro && homeSequence && runtime && !introTransitionStarted && runtime.getCompletedAnimationCycles() > 0) {
            introTransitionStarted = true;
            void runtime.selectAnimation(homeSequence.loop).then(() => {
              if (cancelled || !runtime) return;
              wrapper.updateMatrixWorld(true);
              framingBounds = runtime.getFramingBounds();
              targetDistance = fitPerspectiveCameraDistance(camera, framingBounds, direction) / scaleHint;
              controls!.minDistance = targetDistance * 0.72;
              controls!.maxDistance = targetDistance * 1.85;
              cameraRefitting = true;
            }).catch((error: unknown) => reportFallback(brawlerId, "idle animation transition failed", error));
          }
          if (cameraRefitting) {
            const distance = THREE.MathUtils.damp(camera.position.length(), targetDistance, 8, delta);
            camera.position.setLength(distance);
            if (Math.abs(distance - targetDistance) <= 0.001) cameraRefitting = false;
          }
          controls.update(delta); if (runtime?.getState().faceEnabled) runtime.renderFace(renderer); if (runtime?.getState().outlineEnabled) { outlineMaterial.uniforms.tDiffuse.value = runtime.renderOutline(renderer, camera, wrapper); renderer.render(outlineScene, outlineCamera); } else renderer.render(scene, camera); const nextPlaying = runtime?.getState().playing ?? !legacyActionRef.current?.paused; const nextPlaybackAvailable = runtime?.hasAnimationClip() ?? Boolean(legacyActionRef.current); const nextFace = runtime?.getState().faceEnabled ?? false; const nextOutline = runtime?.getState().outlineEnabled ?? false; const nextAnimation = runtime?.getState().animationKey ?? playbackAnimation; lastReadySelection.current = { brawlerId, skinId: selectedEntry?.skinId }; setState((current) => current.model === "ready" && current.playing === nextPlaying && current.playbackAvailable === nextPlaybackAvailable && current.faceEnabled === nextFace && current.outlineEnabled === nextOutline && current.animationKey === nextAnimation ? current : { ...current, model: "ready", playing: nextPlaying, playbackAvailable: nextPlaybackAvailable, faceEnabled: nextFace, outlineEnabled: nextOutline, animationKey: nextAnimation }); frame = window.requestAnimationFrame(render); }; render();
      } catch (error: unknown) { if (!cancelled) { setState((current) => ({ ...current, model: "failed", playing: false })); reportFallback(brawlerId, "catalog or GLB load failed; keeping PNG fallback", error); } }
    }; void load();
    return () => { cancelled = true; window.cancelAnimationFrame(frame); resizeObserver?.disconnect(); controls?.dispose(); runtime?.dispose(); runtimeRef.current = undefined; legacyMixer?.stopAllAction(); if (legacyMixer && legacyModel) legacyMixer.uncacheRoot(legacyModel); if (legacyModel) disposeLegacyModel(legacyModel); renderer?.dispose(); outlineQuad.geometry.dispose(); outlineMaterial.dispose(); };
  }, [brawlerId, legacyUrl, manifest, playbackAnimation, homeSequence?.start, homeSequence?.loop, selectedEntry?.skinId]);

  const togglePlaying = () => { if (runtimeRef.current) { const next = !runtimeRef.current.getState().playing; runtimeRef.current.setPlaying(next); setState((current) => ({ ...current, playing: next })); return; } const action = legacyActionRef.current; if (!action) return; action.paused = !action.paused; setState((current) => ({ ...current, playing: !action.paused })); };
  const hasCatalogRuntime = Boolean(manifest && playbackAnimation); const modelReady = state.model === "ready"; const showModelFrame = modelReady || (state.model === "loading" && lastReadySelection.current?.brawlerId === brawlerId && lastReadySelection.current.skinId === selectedEntry?.skinId); const selectedFaceReady = Boolean(manifest && state.animationKey && manifest.animations[state.animationKey]?.[1].kind === "ready" && manifest.animations[state.animationKey]?.[2].kind === "ready"); const featureFace = hasCatalogRuntime && selectedFaceReady ? { kind: "available" } satisfies ViewerFeature : { kind: "unavailable", reason: hasCatalogRuntime ? "not-captured" : "transform-unverified" } satisfies ViewerFeature; const featureOutline = hasCatalogRuntime ? entryFeature(selectedEntry, "outline") : { kind: "unavailable", reason: "not-captured" } satisfies ViewerFeature;
  const showLoading = !showModelFrame && (catalogPending || state.model === "loading" || (state.model === "unavailable" && (hasCatalogRuntime || Boolean(legacyUrl))));
  const modelDataState = showLoading ? "loading" : state.model;
  return <div className={`relative isolate flex h-full min-h-[24rem] w-full flex-col overflow-visible ${className ?? ""}`} data-idle-state={state.model} data-model-state={modelDataState}>
    <div className="relative min-h-0 flex-1">
    {showLoading ? <div className="absolute inset-0 grid place-items-center rounded-xl bg-[radial-gradient(circle_at_center,rgba(245,200,91,0.14),transparent_60%)]" role="status" aria-label={`Loading ${alt} 3D model`}>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="grid size-16 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary shadow-[0_0_50px_rgba(245,200,91,0.14)]"><LoaderCircle className="size-8 motion-safe:animate-spin" aria-hidden="true" /></span>
        <span className="font-display text-2xl text-foreground">{alt}</span>
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Loading 3D model</span>
      </div>
    </div> : null}
    {!showLoading && !showModelFrame ? <div className="absolute inset-0 grid place-items-center overflow-hidden rounded-xl bg-[radial-gradient(circle_at_center,rgba(245,200,91,0.12),transparent_65%)]">
      {artworkMaxWidth ? <div className="pointer-events-none absolute size-72 rounded-full border border-primary/20 shadow-[0_0_90px_rgba(245,200,91,0.12)]" aria-hidden="true" /> : null}
      <ImageWithFallback src={artworkSrc} fallbackSrc={fallbackSrc} alt={alt} data-art-kind={artworkKind} style={artworkMaxWidth ? { maxWidth: artworkMaxWidth } : undefined} className="relative z-10 max-h-full w-full object-contain drop-shadow-2xl" />
    </div> : null}
    {hasCatalogRuntime || legacyAsset ? <canvas ref={canvasRef} aria-hidden="true" className={`absolute inset-0 h-full w-full touch-none transition-opacity duration-300 ${showModelFrame ? "cursor-grab opacity-100 active:cursor-grabbing" : "pointer-events-none opacity-0"}`} /> : null}
    </div>
    {(hasCatalogRuntime || legacyAsset) && showModelFrame ? <BrawlerViewerControls playing={state.playing} playbackAvailable={state.playbackAvailable} skinOptions={entries.map((entry) => ({ id: entry.skinId, label: catalogEntryLabel(entry) }))} animationOptions={animationOptions} selectedSkin={selectedEntry?.skinId} selectedAnimation={state.animationKey ?? playbackAnimation} onSelectSkin={(skinId) => { if (entries.some((entry) => entry.skinId === skinId)) { setSelectedAnimation(undefined); setSelectedSkin(skinId); } }} onSelectAnimation={setSelectedAnimation} face={featureFace} outline={featureOutline} faceEnabled={state.faceEnabled} outlineEnabled={state.outlineEnabled} onTogglePlaying={togglePlaying} onToggleFace={() => { const next = !state.faceEnabled; runtimeRef.current?.setFaceEnabled(next); setState((current) => ({ ...current, faceEnabled: next })); }} onToggleOutline={() => { const next = !state.outlineEnabled; runtimeRef.current?.setOutlineEnabled(next); setState((current) => ({ ...current, outlineEnabled: next })); }} /> : null}
  </div>;
}
