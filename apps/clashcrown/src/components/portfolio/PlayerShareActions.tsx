import { useState } from "react";
import { Download, LoaderCircle, Share2 } from "lucide-react";
import { createPlayerShareImage, playerShareFileName } from "@/lib/sharePlayerImage";
import type { Player } from "@/lib/clash/domain";

type ShareAction = "share" | "download";

function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }
  const file = new File([new Blob(["test"], { type: "image/png" })], "snapshot.png", { type: "image/png" });
  return navigator.canShare({ files: [file] });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The image could not be created.";
}

export function PlayerShareActions({ player, compact = false }: { player: Player; compact?: boolean }) {
  const [busy, setBusy] = useState<ShareAction | null>(null);
  const [message, setMessage] = useState("");
  const nativeShare = canShareFiles();

  async function run(action: ShareAction) {
    setBusy(action);
    setMessage("");
    try {
      const blob = await createPlayerShareImage(player);
      const filename = playerShareFileName(player);
      if (action === "share" && nativeShare) {
        const file = new File([blob], filename, { type: "image/png" });
        await navigator.share({
          title: `${player.name} · Royale Stats`,
          text: `${player.name}'s Clash Royale profile and card collection`,
          files: [file]
        });
        setMessage("Share sheet opened.");
      } else {
        downloadBlob(blob, filename);
        setMessage("Image downloaded.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className={compact ? "player-share-actions player-share-actions-compact" : "player-share-actions"}>
        {nativeShare ? (
          <button type="button" onClick={() => void run("share")} disabled={busy !== null}>
            {busy === "share" ? <LoaderCircle className="spin" size={16} /> : <Share2 size={16} />}
            {busy === "share" ? "Creating…" : "Share image"}
          </button>
        ) : null}
        <button type="button" onClick={() => void run("download")} disabled={busy !== null}>
          {busy === "download" ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
          {busy === "download" ? "Creating…" : "Download image"}
        </button>
        {message ? <span className="player-share-message" role="status" aria-live="polite">{message}</span> : null}
      </div>
      <style>{`
        .player-share-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 9px; margin-top: 17px; }
        .player-share-actions button { min-height: 39px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 15px; border: 1px solid rgba(238, 102, 239, .42); border-radius: 7px; color: white; background: rgba(61, 29, 89, .78); font: 700 11px var(--font-ui); }
        .player-share-actions button:hover { border-color: rgba(238, 102, 239, .82); background: rgba(117, 34, 139, .72); }
        .player-share-actions-compact { margin: 0; }
        .player-share-actions-compact button { min-height: 36px; padding: 0 12px; background: rgba(20, 61, 112, .9); }
        .player-share-message { flex-basis: 100%; color: #9aacca; font: 10px/1.4 var(--font-ui); text-align: center; }
        @media (max-width: 520px) { .player-share-actions button { flex: 1 1 145px; } }
      `}</style>
    </>
  );
}
