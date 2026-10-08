import { Pause, Play, ScanFace, Spline } from "lucide-react";
import type { ViewerFeature } from "@/lib/brawler-viewer-contract";

type BrawlerViewerControlsProps = {
  readonly playing: boolean;
  readonly playbackAvailable?: boolean;
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

/** Catalog labels read "Win Anim / Hero Screen Anim"; the chips drop the "Anim" suffix. */
function chipLabel(label: string): string {
  return label.split(" / ").map((part) => part.replace(/\s*Anim(ation)?$/i, "").trim()).join(" / ");
}

export function BrawlerViewerControls({ playing, playbackAvailable = true, skinOptions = [], animationOptions = [], selectedSkin, selectedAnimation, onSelectSkin, onSelectAnimation, face, outline, faceEnabled = false, outlineEnabled = false, onTogglePlaying, onToggleFace, onToggleOutline }: BrawlerViewerControlsProps) {
  const skinIndex = skinOptions.findIndex((skin) => skin.id === selectedSkin);
  return (
    <div className="brawl-viewer-controls">
      <div className="flex items-center gap-2">
        <button type="button" className="brawl-viewer-icon" onClick={onTogglePlaying} disabled={!playbackAvailable} aria-label={playbackAvailable ? (playing ? "Pause animation" : "Play animation") : "Static pose"}>
          {playing && playbackAvailable ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        </button>
        {skinOptions.length > 1 ? (
          <label className="brawl-viewer-skin">
            <span className="sr-only">Skin</span>
            <select value={selectedSkin} onChange={(event) => onSelectSkin?.(event.target.value)}>
              {skinOptions.map((skin) => <option key={skin.id} value={skin.id}>{skin.label}</option>)}
            </select>
            <small aria-hidden>{skinIndex + 1}/{skinOptions.length}</small>
          </label>
        ) : skinOptions[0] ? <span className="brawl-viewer-skin-name">{skinOptions[0].label}</span> : null}
        <div className="ml-auto flex items-center gap-1.5">
          {face.kind === "available" ? (
            <button type="button" className="brawl-viewer-icon" onClick={onToggleFace} aria-pressed={faceEnabled} aria-label="Animated face" title="Animated face">
              <ScanFace className="size-4" aria-hidden />
            </button>
          ) : null}
          {outline.kind === "available" ? (
            <button type="button" className="brawl-viewer-icon" onClick={onToggleOutline} aria-pressed={outlineEnabled} aria-label="Outline" title="Outline">
              <Spline className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      {animationOptions.length > 1 ? (
        <div className="brawl-viewer-chips" role="group" aria-label="Animation">
          {animationOptions.map((animation) => (
            <button key={animation.key} type="button" aria-pressed={animation.key === selectedAnimation} onClick={() => onSelectAnimation?.(animation.key)} title={animation.label}>
              {chipLabel(animation.label)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
