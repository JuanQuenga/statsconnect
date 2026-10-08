import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { BrawlerViewerControls } from "@/components/BrawlerViewerControls";
import { brawlerAssetCatalogUrl, catalogEntryLabel, catalogEntryToViewerManifest, createBrawlerAssetCatalogRequestCache, loadBrawlerAssetCatalog, selectCatalogViewerEntry, type BrawlerAssetCatalog, type BrawlerAssetCatalogEntry } from "@/lib/brawler-asset-catalog";
import { BrawlerViewerRuntime, centerModelForFraming, fitPerspectiveCameraDistance, selectHomeAnimationSequence, startupFramingBounds, type LoadedModel } from "@/lib/brawler-viewer-runtime";
import { brawlerModel3dAsset, brawlerModel3dUrl } from "@/lib/brawler-models";
import { createOutlineCompositeMaterial, type BrawlerSkinManifest, type ViewerFeature } from "@/lib/brawler-viewer-contract";

type BrawlerModelViewerProps = { brawlerId: number; alt: string; artworkSrc: string; fallbackSrc?: string; artworkMaxWidth?: number; artworkKind: "model"; className?: string };
type ViewerStatus = "idle" | "loading" | "ready" | "failed";
type ViewerUi = { status: ViewerStatus; busy: boolean; playing: boolean; playbackAvailable: boolean; faceEnabled: boolean; outlineEnabled: boolean; animationKey?: string };

const requestCatalog = createBrawlerAssetCatalogRequestCache((brawlerId) => loadBrawlerAssetCatalog(brawlerAssetCatalogUrl(), brawlerId));

// --- Asset loading -----------------------------------------------------------
// Model, animation and face files are immutable (content-addressed), so their
// bytes are cached for the session: switching back to a skin or animation is
// instant, and the remaining animations of the shown skin are prefetched while
// the browser is idle. Each load parses a fresh copy because the runtime
// mutates and disposes what it receives.
THREE.Cache.enabled = true;
const bytesCache = new Map<string, Promise<ArrayBuffer>>();
const gltfLoader = new GLTFLoader();

function fetchBytes(url: string): Promise<ArrayBuffer> {
  let pending = bytesCache.get(url);
  if (!pending) {
    pending = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`asset request failed: ${response.status} ${url}`);
      return response.arrayBuffer();
    });
    pending.catch(() => bytesCache.delete(url));
    bytesCache.set(url, pending);
  }
  return pending;
}

async function loadModel(url: string): Promise<LoadedModel> {
  const bytes = await fetchBytes(url);
  const gltf = await gltfLoader.parseAsync(bytes.slice(0), url.slice(0, url.lastIndexOf("/") + 1));
  return { scene: gltf.scene, animations: gltf.animations };
}

const runtimeLoader = {
  loadModel,
  loadTexture: (url: string) => new THREE.TextureLoader().loadAsync(url),
  loadBinary: async (url: string) => (await fetchBytes(url)).slice(0),
};

function prefetchAnimations(manifest: BrawlerSkinManifest, signal: { cancelled: boolean }): void {
  const urls: string[] = [];
  for (const entry of Object.values(manifest.animations)) {
    for (const asset of [entry[0], entry[2]]) if (asset.kind === "ready") urls.push(asset.url);
  }
  const queue = [...new Set(urls)].filter((url) => !bytesCache.has(url));
  const idle = (callback: () => void): void => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(callback, { timeout: 2000 });
    else globalThis.setTimeout(callback, 200);
  };
  const next = () => {
    const url = queue.shift();
    if (!url || signal.cancelled) return;
    void fetchBytes(url).catch(() => undefined).finally(() => idle(next));
  };
  idle(next);
}

function reportFallback(brawlerId: number, reason: string, error?: unknown): void {
  const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
  console.warn(`[BrawlerModelViewer] ${brawlerId}: ${reason}${detail}`);
}

function entryFeature(entry: BrawlerAssetCatalogEntry | undefined, feature: "face" | "outline"): ViewerFeature {
  if (feature === "outline" && entry?.capabilities?.outline?.enabled) return { kind: "available" };
  if (feature === "face" && entry && Object.values(entry.faces).some((face) => face.ready && face.resolved)) return { kind: "available" };
  return { kind: "unavailable", reason: "not-captured" };
}

function hasFaceAsset(manifest: BrawlerSkinManifest, key: string): boolean {
  const entry = manifest.animations[key];
  return entry?.[1].kind === "ready" && entry?.[2].kind === "ready";
}

function disposeObjectTree(model: THREE.Object3D): void {
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
}

// --- Stage -------------------------------------------------------------------
// One renderer, scene, camera and orbit control live for the lifetime of the
// component. Skins swap a runtime into the stage (the previous one stays on
// screen until the next is ready); animations switch inside the runtime.
type Shown = {
  readonly wrapper: THREE.Object3D;
  readonly runtime?: BrawlerViewerRuntime;
  readonly legacy?: { readonly model: THREE.Object3D; readonly mixer: THREE.AnimationMixer; readonly action: THREE.AnimationAction };
  readonly skinKey: string;
  readonly scaleHint: number;
  home?: { readonly loop: string; transitioned: boolean };
};

type Stage = {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly direction: THREE.Vector3;
  readonly outlineScene: THREE.Scene;
  readonly outlineCamera: THREE.OrthographicCamera;
  readonly outlineMaterial: THREE.ShaderMaterial;
  shown?: Shown;
  framing?: THREE.Box3;
  targetDistance: number;
  refitting: boolean;
  dispose: () => void;
};

function createStage(canvas: HTMLCanvasElement, container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearAlpha(0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(3, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xb8d5ff, 0.35); fill.position.set(-4, 2, 1); scene.add(fill);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x26364a, 0.55));
  const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 1000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.enablePan = false;
  const outlineScene = new THREE.Scene();
  const outlineCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const outlineMaterial = createOutlineCompositeMaterial();
  const outlineQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outlineMaterial);
  outlineScene.add(outlineQuad);
  const stage: Stage = {
    renderer, scene, camera, controls, direction: new THREE.Vector3(0.18, 0.05, 1.18).normalize(),
    outlineScene, outlineCamera, outlineMaterial, targetDistance: 0, refitting: false,
    dispose: () => { controls.dispose(); outlineQuad.geometry.dispose(); outlineMaterial.dispose(); renderer.dispose(); },
  };
  controls.addEventListener("start", () => { stage.refitting = false; });
  const resize = () => {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (stage.framing) fitCamera(stage, stage.framing, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  const dispose = stage.dispose;
  stage.dispose = () => { observer.disconnect(); dispose(); };
  return stage;
}

function fitCamera(stage: Stage, bounds: THREE.Box3, animate: boolean): void {
  stage.framing = bounds;
  const scaleHint = stage.shown?.scaleHint ?? 1;
  const size = bounds.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 1e-3);
  // Near plane scales with the model so layered parts keep depth precision.
  stage.camera.near = largest * 0.05;
  stage.camera.far = largest * 20;
  stage.camera.updateProjectionMatrix();
  stage.targetDistance = fitPerspectiveCameraDistance(stage.camera, bounds, stage.direction) / scaleHint;
  stage.controls.minDistance = stage.targetDistance * 0.72;
  stage.controls.maxDistance = stage.targetDistance * 1.85;
  if (animate) { stage.refitting = true; return; }
  stage.refitting = false;
  stage.camera.position.copy(stage.direction).multiplyScalar(stage.targetDistance);
  stage.camera.lookAt(0, 0, 0);
  stage.controls.target.set(0, 0, 0);
  stage.controls.update();
}

export function BrawlerModelViewer({ brawlerId, alt, artworkSrc, fallbackSrc, artworkMaxWidth, artworkKind, className }: BrawlerModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Stage | undefined>(undefined);
  const [catalog, setCatalog] = useState<BrawlerAssetCatalog>();
  const [catalogPending, setCatalogPending] = useState(true);
  const [selectedSkin, setSelectedSkin] = useState<string>();
  const [selectedAnimation, setSelectedAnimation] = useState<string>();
  const [ui, setUi] = useState<ViewerUi>({ status: "idle", busy: false, playing: false, playbackAvailable: false, faceEnabled: false, outlineEnabled: false });
  const legacyAsset = brawlerModel3dAsset(brawlerId);
  const legacyUrl = brawlerModel3dUrl(brawlerId);
  const selection = useMemo(() => selectCatalogViewerEntry(catalog, brawlerId, selectedSkin, selectedAnimation), [catalog, brawlerId, selectedSkin, selectedAnimation]);
  const { entries, selectedEntry, animationOptions, activeAnimation } = selection;
  const manifest = useMemo(() => selectedEntry ? catalogEntryToViewerManifest(selectedEntry) : undefined, [selectedEntry]);
  const animationRef = useRef<string | undefined>(undefined);
  animationRef.current = selectedAnimation;
  const ensureStageRef = useRef<() => Stage | undefined>(() => undefined);

  useEffect(() => {
    let cancelled = false;
    setCatalog(undefined);
    setCatalogPending(true);
    setSelectedSkin(undefined);
    setSelectedAnimation(undefined);
    void requestCatalog(brawlerId)
      .then((value) => { if (!cancelled) setCatalog(value); })
      .catch(() => { /* Static artwork or a legacy model remains available. */ })
      .finally(() => { if (!cancelled) setCatalogPending(false); });
    return () => { cancelled = true; };
  }, [brawlerId]);
  useEffect(() => { if (selectedEntry) setSelectedSkin(selectedEntry.skinId); }, [selectedEntry]);

  // Stage lifetime + render loop (paused while off-screen or the tab is hidden).
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    let stage: Stage | undefined;
    let frame = 0;
    let visible = true;
    const clock = new THREE.Clock(false);
    const tick = () => {
      frame = 0;
      if (!stage || !visible || document.hidden) { clock.stop(); return; }
      if (!clock.running) clock.start();
      const delta = Math.min(clock.getDelta(), 0.1);
      const shown = stage.shown;
      if (shown) {
        shown.runtime?.update(delta);
        shown.legacy?.mixer.update(delta);
        const runtime = shown.runtime;
        if (runtime && shown.home && !shown.home.transitioned && runtime.getCompletedAnimationCycles() > 0) {
          shown.home.transitioned = true;
          const loop = shown.home.loop;
          void runtime.selectAnimation(loop).then(() => {
            if (stageRef.current?.shown !== shown || animationRef.current !== undefined) return;
            fitCamera(stageRef.current, runtime.getFramingBounds(), true);
            setUi((current) => ({ ...current, animationKey: loop }));
          }).catch((error: unknown) => reportFallback(brawlerId, "idle animation transition failed", error));
        }
        if (stage.refitting) {
          const distance = THREE.MathUtils.damp(stage.camera.position.length(), stage.targetDistance, 8, delta);
          stage.camera.position.setLength(distance);
          if (Math.abs(distance - stage.targetDistance) <= 0.001) stage.refitting = false;
        }
        stage.controls.update(delta);
        const state = runtime?.getState();
        if (state?.faceEnabled) runtime!.renderFace(stage.renderer);
        if (state?.outlineEnabled) {
          stage.outlineMaterial.uniforms.tDiffuse.value = runtime!.renderOutline(stage.renderer, stage.camera, stage.scene);
          stage.renderer.render(stage.outlineScene, stage.outlineCamera);
        } else stage.renderer.render(stage.scene, stage.camera);
      }
      frame = window.requestAnimationFrame(tick);
    };
    const wake = () => { if (!frame && visible && !document.hidden) frame = window.requestAnimationFrame(tick); };
    const intersection = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? true; wake(); }, { rootMargin: "120px" });
    intersection.observe(container);
    document.addEventListener("visibilitychange", wake);
    const ensure = () => {
      if (!stage) {
        try { stage = createStage(canvas, container); } catch (error) { reportFallback(brawlerId, "WebGL unavailable", error); return undefined; }
        stageRef.current = stage;
      }
      wake();
      return stage;
    };
    ensureStageRef.current = ensure;
    return () => {
      window.cancelAnimationFrame(frame);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", wake);
      const shown = stage?.shown;
      shown?.runtime?.dispose();
      if (shown?.legacy) { shown.legacy.mixer.stopAllAction(); disposeObjectTree(shown.legacy.model); }
      stage?.dispose();
      stageRef.current = undefined;
    };
  }, [brawlerId]);

  // Load a skin (catalog runtime or legacy self-contained GLB) and swap it in.
  const skinKey = manifest ? `${manifest.brawlerId}:${manifest.skinId}` : legacyUrl ? `legacy:${legacyUrl}` : undefined;
  useEffect(() => {
    // Wait for the catalog so a legacy model is never loaded only to be replaced.
    if (catalogPending) { setUi((current) => ({ ...current, status: "loading" })); return; }
    if (!skinKey) { setUi((current) => ({ ...current, status: "idle", busy: false })); return; }
    const stage = ensureStageRef.current();
    if (!stage) { setUi((current) => ({ ...current, status: "failed", busy: false })); return; }
    const signal = { cancelled: false };
    setUi((current) => ({ ...current, status: current.status === "ready" ? "ready" : "loading", busy: true }));
    const load = async () => {
      let next: Shown;
      let startupBounds: THREE.Box3;
      let playback: string | undefined;
      if (manifest) {
        const requested = animationRef.current;
        const home = requested === undefined ? selectHomeAnimationSequence(manifest.animations) : undefined;
        playback = home?.start ?? (requested && manifest.animations[requested] ? requested : activeAnimation);
        if (!playback) throw new Error("no playable animation");
        const runtime = new BrawlerViewerRuntime(manifest, runtimeLoader);
        try {
          await runtime.loadBase();
          let idleBounds: THREE.Box3 | undefined;
          if (home && home.loop !== playback) { await runtime.selectAnimation(home.loop); idleBounds = runtime.getFramingBounds(); }
          await runtime.selectAnimation(playback);
          if (signal.cancelled) { runtime.dispose(); return; }
          runtime.setFaceEnabled(hasFaceAsset(manifest, playback));
          runtime.setOutlineEnabled(manifest.outline.kind === "available");
          runtime.root.updateMatrixWorld(true);
          const current = runtime.getFramingBounds();
          const framed = centerModelForFraming(runtime.root, idleBounds ?? current);
          startupBounds = idleBounds ? startupFramingBounds(idleBounds, current).applyMatrix4(framed.wrapper.matrixWorld) : framed.bounds;
          // HomeScreenScale is a source-authored framing hint relative to 290.
          const scaleHint = THREE.MathUtils.clamp((manifest.cameraScale ?? 290) / 290, 0.72, 1.05);
          next = { wrapper: framed.wrapper, runtime, skinKey, scaleHint, home: home && home.loop !== playback ? { loop: home.loop, transitioned: false } : undefined };
        } catch (error) { runtime.dispose(); throw error; }
      } else {
        const model = await loadModel(legacyUrl!);
        const clip = model.animations.find((animation) => animation.duration > 0 && animation.tracks.length > 0);
        if (!clip) throw new Error("self-contained GLB contains no embedded idle animation");
        if (signal.cancelled) { disposeObjectTree(model.scene); return; }
        const mixer = new THREE.AnimationMixer(model.scene);
        const action = mixer.clipAction(clip);
        action.play();
        model.scene.updateMatrixWorld(true);
        const framed = centerModelForFraming(model.scene, new THREE.Box3().setFromObject(model.scene, true));
        startupBounds = framed.bounds;
        next = { wrapper: framed.wrapper, legacy: { model: model.scene, mixer, action }, skinKey, scaleHint: 1 };
      }
      const previous = stage.shown;
      if (previous) {
        stage.scene.remove(previous.wrapper);
        previous.runtime?.dispose();
        if (previous.legacy) { previous.legacy.mixer.stopAllAction(); disposeObjectTree(previous.legacy.model); }
      }
      stage.scene.add(next.wrapper);
      stage.shown = next;
      stage.camera.fov = next.runtime ? 20 : 32;
      fitCamera(stage, startupBounds, false);
      const state = next.runtime?.getState();
      setUi({
        status: "ready", busy: false,
        playing: state?.playing ?? true,
        playbackAvailable: next.runtime?.hasAnimationClip() ?? true,
        faceEnabled: state?.faceEnabled ?? false,
        outlineEnabled: state?.outlineEnabled ?? false,
        animationKey: playback,
      });
      if (manifest) prefetchAnimations(manifest, signal);
    };
    load().catch((error: unknown) => {
      if (signal.cancelled) return;
      reportFallback(brawlerId, "model load failed; keeping artwork", error);
      setUi((current) => ({ ...current, status: stage.shown ? "ready" : "failed", busy: false }));
    });
    return () => { signal.cancelled = true; };
    // activeAnimation is read once per skin; later picks switch in place below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skinKey, catalogPending]);

  // Switch animation in place on the loaded skin.
  useEffect(() => {
    const stage = stageRef.current;
    const shown = stage?.shown;
    const runtime = shown?.runtime;
    if (!stage || !runtime || !manifest || !selectedAnimation || shown.skinKey !== skinKey) return;
    if (runtime.getState().animationKey === selectedAnimation) return;
    let cancelled = false;
    shown.home = undefined;
    setUi((current) => ({ ...current, busy: true }));
    void runtime.selectAnimation(selectedAnimation).then(() => {
      if (cancelled || stageRef.current?.shown !== shown) return;
      runtime.setFaceEnabled(hasFaceAsset(manifest, selectedAnimation));
      fitCamera(stage, runtime.getFramingBounds(), true);
      const state = runtime.getState();
      setUi((current) => ({ ...current, busy: false, playing: state.playing, playbackAvailable: runtime.hasAnimationClip(), faceEnabled: state.faceEnabled, animationKey: selectedAnimation }));
    }).catch((error: unknown) => {
      reportFallback(brawlerId, `animation ${selectedAnimation} failed`, error);
      if (!cancelled) setUi((current) => ({ ...current, busy: false }));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnimation, skinKey]);

  const runtime = () => stageRef.current?.shown?.runtime;
  const togglePlaying = () => {
    const shown = stageRef.current?.shown;
    if (shown?.runtime) { const next = !shown.runtime.getState().playing; shown.runtime.setPlaying(next); setUi((current) => ({ ...current, playing: next })); return; }
    if (shown?.legacy) { shown.legacy.action.paused = !shown.legacy.action.paused; setUi((current) => ({ ...current, playing: !shown.legacy!.action.paused })); }
  };
  const hasCatalogRuntime = Boolean(manifest);
  const modelReady = ui.status === "ready";
  const faceFeature: ViewerFeature = hasCatalogRuntime && manifest && ui.animationKey && hasFaceAsset(manifest, ui.animationKey) ? { kind: "available" } : { kind: "unavailable", reason: "not-captured" };
  const outlineFeature = hasCatalogRuntime ? entryFeature(selectedEntry, "outline") : { kind: "unavailable", reason: "not-captured" } satisfies ViewerFeature;
  const loading = !modelReady && (catalogPending || ui.status === "loading");
  const showControls = modelReady && (hasCatalogRuntime || Boolean(legacyAsset));
  // Merged options ("Win / Hero Screen") keep one key; map the playing clip to its chip.
  const playingLabel = manifest && ui.animationKey ? manifest.animations[ui.animationKey]?.[5] : undefined;
  const selectedOptionKey = animationOptions.find((option) => option.key === ui.animationKey)?.key
    ?? animationOptions.find((option) => playingLabel !== undefined && option.label.split(" / ").includes(playingLabel))?.key
    ?? ui.animationKey;

  return (
    <div className={`brawl-viewer relative isolate flex h-full min-h-[24rem] w-full flex-col ${className ?? ""}`} data-model-state={modelReady ? "ready" : loading ? "loading" : ui.status}>
      <div ref={containerRef} className="relative min-h-0 flex-1">
        {/* Artwork shows instantly and stays as the fallback; the 3D model fades in over it. */}
        <div className={`pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-500 ${modelReady ? "opacity-0" : "opacity-100"}`} aria-hidden={modelReady}>
          <ImageWithFallback src={artworkSrc} fallbackSrc={fallbackSrc} alt={alt} data-art-kind={artworkKind} style={artworkMaxWidth ? { maxWidth: artworkMaxWidth } : undefined} className={`max-h-full w-auto max-w-full object-contain drop-shadow-2xl ${loading ? "motion-safe:animate-pulse" : ""}`} />
        </div>
        <canvas ref={canvasRef} aria-label={modelReady ? `${alt} 3D model. Drag to rotate.` : undefined} role={modelReady ? "img" : undefined} className={`absolute inset-0 h-full w-full touch-none transition-opacity duration-500 ${modelReady ? "cursor-grab opacity-100 active:cursor-grabbing" : "pointer-events-none opacity-0"}`} />
        {loading || ui.busy ? (
          <span className="brawl-viewer-status" role="status">{loading ? "Loading 3D model" : "Loading"}</span>
        ) : null}
      </div>
      {showControls ? (
        <BrawlerViewerControls
          playing={ui.playing}
          playbackAvailable={ui.playbackAvailable}
          skinOptions={entries.map((entry) => ({ id: entry.skinId, label: catalogEntryLabel(entry) }))}
          animationOptions={animationOptions}
          selectedSkin={selectedEntry?.skinId}
          selectedAnimation={selectedOptionKey}
          onSelectSkin={(skinId) => { if (entries.some((entry) => entry.skinId === skinId)) { setSelectedAnimation(undefined); setSelectedSkin(skinId); } }}
          onSelectAnimation={setSelectedAnimation}
          face={faceFeature}
          outline={outlineFeature}
          faceEnabled={ui.faceEnabled}
          outlineEnabled={ui.outlineEnabled}
          onTogglePlaying={togglePlaying}
          onToggleFace={() => { const next = !ui.faceEnabled; runtime()?.setFaceEnabled(next); setUi((current) => ({ ...current, faceEnabled: next })); }}
          onToggleOutline={() => { const next = !ui.outlineEnabled; runtime()?.setOutlineEnabled(next); setUi((current) => ({ ...current, outlineEnabled: next })); }}
        />
      ) : null}
    </div>
  );
}
