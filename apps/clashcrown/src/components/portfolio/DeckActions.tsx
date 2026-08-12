import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { copyDeckLink } from "@/lib/clash/assets";
import type { Card } from "@/lib/mock-data";
import styles from "./DeckActions.module.css";

export function deckLinkForCards(cards: Card[]): string | undefined {
  if (cards.length !== 8) return undefined;
  const ids: number[] = [];
  for (const card of cards) {
    if (typeof card.id !== "number" || card.id <= 0) return undefined;
    ids.push(card.id);
  }
  return copyDeckLink(ids);
}

async function writeToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Clipboard copy was not available.");
}

export function DeckActions({ cards, label, compact = false }: { cards: Card[]; label: string; compact?: boolean }) {
  const link = deckLinkForCards(cards);
  const [notice, setNotice] = useState<"idle" | "copied" | "error">("idle");

  async function copyLink() {
    if (!link) return;
    try {
      await writeToClipboard(link);
      setNotice("copied");
    } catch {
      setNotice("error");
    }
  }

  const className = `${styles.actions} ${compact ? styles.compact : ""}`;

  return (
    <div className={className} aria-label={`Actions for ${label}`}>
      <button type="button" onClick={copyLink} disabled={!link} aria-label={`Copy ${label} link`} title={link ? `Copy ${label} link` : "A complete eight-card deck is required"}>
        {notice === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        <span>{notice === "copied" ? "Copied" : "Copy link"}</span>
      </button>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label} in Clash Royale`} title={`Open ${label} in Clash Royale`}>
          <ExternalLink size={14} aria-hidden="true" />
          <span>Open in CR</span>
        </a>
      ) : (
        <button type="button" disabled aria-label={`Open ${label} in Clash Royale`} title="A complete eight-card deck is required">
          <ExternalLink size={14} aria-hidden="true" />
          <span>Open in CR</span>
        </button>
      )}
      <span className={styles.notice} role="status" aria-live="polite">
        {notice === "error" ? "Could not copy the link" : ""}
      </span>
    </div>
  );
}
