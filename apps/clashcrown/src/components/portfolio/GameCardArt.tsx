import { CardArt } from "@/components/portfolio/CardArt";
import { cardArtFallbacks, highestAvailableCardArt, selectCardArt, slugify } from "@/lib/clash/assets";
import type { Card } from "@/lib/clash/domain";

type GameCardArtSize = "library" | "collection" | "deck";
type GameCardArtPortrait = "active" | "highest";

export function GameCardArt({
  card,
  size = "collection",
  priority = false,
  showLevel = true,
  portrait = "active"
}: {
  card: Pick<Card, "name" | "image" | "evolutionImage" | "heroImage" | "variant" | "rarity" | "elixir" | "level">;
  size?: GameCardArtSize;
  priority?: boolean;
  showLevel?: boolean;
  portrait?: GameCardArtPortrait;
}) {
  const activeArt = selectCardArt(card);
  const art: { src: string; variant: "Evolution" | "Hero" | undefined } = portrait === "highest"
    ? {
        src: highestAvailableCardArt(card),
        variant: card.heroImage ? "Hero" : card.evolutionImage ? "Evolution" : undefined
      }
    : activeArt;
  const rarity = card.rarity.toLowerCase();

  return (
    <span
      className={`game-card-art game-card-art-${size}`}
      data-card={slugify(card.name)}
      data-rarity={rarity}
      data-variant={art.variant?.toLowerCase() ?? "base"}
    >
      <CardArt
        src={art.src}
        alt={card.name}
        width={150}
        height={180}
        priority={priority}
        fallback={cardArtFallbacks({ name: card.name, variant: art.variant })}
      />
      {card.elixir > 0 ? <span className="game-card-elixir" aria-hidden="true">{card.elixir}</span> : null}
      {showLevel && card.level !== undefined ? (
        <span className="game-card-level" aria-hidden="true">Level {card.level}</span>
      ) : null}
    </span>
  );
}
