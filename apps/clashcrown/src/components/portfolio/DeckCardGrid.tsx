import Link from "@/components/Link";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import { cardSlug } from "@/lib/clash/cards";
import type { Card } from "@/lib/clash/domain";

type DeckCardGridSize = "compact" | "standard" | "large";

export function DeckCardGrid({
  cards,
  label,
  size = "standard",
  className = ""
}: {
  cards: Card[];
  label: string;
  size?: DeckCardGridSize;
  className?: string;
}) {
  return (
    <div
      className={`profile-deck-grid profile-deck-grid-${size}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={label}
    >
      {cards.map((card, index) => {
        const cardLabel = card.variant ? `${card.name} (${card.variant})` : card.name;
        return (
          <Link
            href={`/cards/${cardSlug(card.name)}`}
            className="profile-deck-grid-slot"
            title={cardLabel}
            aria-label={cardLabel}
            key={`${card.id ?? card.name}-${card.variant ?? "base"}-${index}`}
          >
            <GameCardArt card={card} size={size === "compact" ? "library" : "deck"} />
          </Link>
        );
      })}
    </div>
  );
}
