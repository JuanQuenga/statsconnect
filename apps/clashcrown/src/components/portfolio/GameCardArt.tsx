import { CardArt } from "@/components/portfolio/CardArt";
import { selectCardArt } from "@/lib/clash/assets";
import type { Card } from "@/lib/mock-data";

type GameCardArtSize = "library" | "collection" | "deck";

export function GameCardArt({
  card,
  size = "collection",
  priority = false,
  showLevel = true
}: {
  card: Pick<Card, "name" | "image" | "evolutionImage" | "heroImage" | "variant" | "rarity" | "elixir" | "level">;
  size?: GameCardArtSize;
  priority?: boolean;
  showLevel?: boolean;
}) {
  const art = selectCardArt(card);
  const rarity = card.rarity.toLowerCase();

  return (
    <span
      className={`game-card-art game-card-art-${size}`}
      data-rarity={rarity}
      data-variant={art.variant?.toLowerCase() ?? "base"}
    >
      <CardArt src={art.src} alt={card.name} width={150} height={180} priority={priority} />
      {card.elixir > 0 ? <span className="game-card-elixir" aria-hidden="true">{card.elixir}</span> : null}
      {showLevel && card.level !== undefined ? (
        <span className="game-card-level" aria-hidden="true">Level {card.level}</span>
      ) : null}
    </span>
  );
}
