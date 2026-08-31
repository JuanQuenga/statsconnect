import Link from "@/components/Link";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import { cardSlug } from "@/lib/clash/cards";
import type { Card } from "@/lib/clash/domain";

type DeckCardGridSize = "compact" | "standard" | "large";

export function DeckCardGrid({
  cards,
  label,
  size = "standard",
  evolutionIds = [],
  linkCards = true,
  className = "",
  priorityCount = 0
}: {
  cards: Card[];
  label: string;
  size?: DeckCardGridSize;
  evolutionIds?: readonly number[];
  linkCards?: boolean;
  className?: string;
  priorityCount?: number;
}) {
  const evolvedIds = new Set(evolutionIds);
  return (
    <div
      className={`profile-deck-grid profile-deck-grid-${size}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={label}
    >
      {cards.map((card, index) => {
        const evolve = typeof card.id === "number" && evolvedIds.has(card.id);
        const cardLabel = evolve ? `${card.name} (Evolution)` : card.variant ? `${card.name} (${card.variant})` : card.name;
        const art = <GameCardArt card={card} size={size === "compact" ? "library" : "deck"} evolve={evolve} priority={index < priorityCount} />;
        return linkCards ? (
          <Link
            href={`/cards/${cardSlug(card.name)}`}
            className="profile-deck-grid-slot"
            title={cardLabel}
            aria-label={cardLabel}
            key={`${card.id ?? card.name}-${card.variant ?? "base"}-${index}`}
          >
            {art}
          </Link>
        ) : (
          <span className="profile-deck-grid-slot" title={cardLabel} key={`${card.id ?? card.name}-${card.variant ?? "base"}-${index}`}>
            {art}
          </span>
        );
      })}
    </div>
  );
}
