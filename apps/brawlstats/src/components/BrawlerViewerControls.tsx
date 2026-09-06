import type { ViewerFeature } from "@/lib/brawler-viewer-contract";

type BrawlerViewerControlsProps = {
  readonly playing: boolean;
  readonly skinOptions?: readonly { readonly id: string; readonly label: string }[];
  readonly animationOptions?: readonly { readonly key: string; readonly label: string }[];
  readonly selectedSkin?: string;
  readonly selectedAnimation?: string;
  readonly onSelectSkin?: (skinId: string) => void;
  readonly onSelectAnimation?: (animationKey: string) => void;
  readonly face: ViewerFeature;
  readonly outline: ViewerFeature;
  readonly faceEnabled?: boolean;
  readonly outlineEnabled?: boolean;
  readonly onTogglePlaying: () => void;
  readonly onToggleFace?: () => void;
  readonly onToggleOutline?: () => void;
};

export function BrawlerViewerControls({ playing, skinOptions = [], animationOptions = [], selectedSkin, selectedAnimation, onSelectSkin, onSelectAnimation, face, outline, faceEnabled = false, outlineEnabled = false, onTogglePlaying, onToggleFace, onToggleOutline }: BrawlerViewerControlsProps) {
  const availability = (feature: ViewerFeature): string => feature.kind === "available" ? "available" : "unavailable";
  return (
    <div className="pointer-events-auto relative z-20 mx-3 mb-3 mt-2 flex shrink-0 flex-wrap items-center gap-2 rounded-lg bg-background/80 p-2 text-xs backdrop-blur">
      <button type="button" className="rounded-md border border-border px-2 py-1 hover:bg-muted" onClick={onTogglePlaying} aria-label={playing ? "Pause animation" : "Play animation"}>
        {playing ? "Pause" : "Play"}
      </button>
      {skinOptions.length > 1 ? <select className="min-w-0 max-w-full flex-1" aria-label="Skin" value={selectedSkin} onChange={(event) => onSelectSkin?.(event.target.value)}>{skinOptions.map((skin) => <option key={skin.id} value={skin.id}>{skin.label}</option>)}</select> : null}
      {animationOptions.length > 0 ? <select className="min-w-0 max-w-full flex-1" aria-label="Animation" value={selectedAnimation} onChange={(event) => onSelectAnimation?.(event.target.value)}>{animationOptions.map((animation) => <option key={animation.key} value={animation.key}>{animation.label}</option>)}</select> : null}
      {face.kind === "available" ? <button type="button" className="rounded-md border border-border px-2 py-1 hover:bg-muted" onClick={onToggleFace} aria-pressed={faceEnabled}>Face {faceEnabled ? "on" : "off"}</button> : <span className="text-muted-foreground">Face: {availability(face)}</span>}
      {outline.kind === "available" ? <button type="button" className="rounded-md border border-border px-2 py-1 hover:bg-muted" onClick={onToggleOutline} aria-pressed={outlineEnabled}>Outline {outlineEnabled ? "on" : "off"}</button> : <span className="text-muted-foreground">Outline: {availability(outline)}</span>}
    </div>
  );
}
