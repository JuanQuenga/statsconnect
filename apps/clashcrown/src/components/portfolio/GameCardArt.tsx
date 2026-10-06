import { CardArt } from "@/components/portfolio/CardArt";
import {
  UNKNOWN_CARD_IMAGE,
  highestAvailableCardArt,
  selectCardArt,
  slugify,
  vendoredCardImage
} from "@/lib/clash/assets";
import type { Card } from "@/lib/clash/domain";

type GameCardArtSize = "mini" | "micro" | "library" | "collection" | "deck";
type GameCardArtPortrait = "active" | "highest";

export function GameCardArt({
  card,
  size = "collection",
  priority = false,
  showLevel = true,
  portrait = "active",
  evolve = false
}: {
  card: Pick<Card, "name" | "image" | "evolutionImage" | "heroImage" | "variant" | "rarity" | "elixir" | "level">;
  size?: GameCardArtSize;
  priority?: boolean;
  showLevel?: boolean;
  portrait?: GameCardArtPortrait;
  evolve?: boolean;
}) {
  const activeArt = selectCardArt(card);
  const art: { src: string; variant: "Evolution" | "Hero" | undefined } = evolve
    ? { src: card.evolutionImage ?? card.image, variant: "Evolution" }
    : portrait === "highest"
    ? {
        src: highestAvailableCardArt(card),
        variant: card.heroImage ? "Hero" : card.evolutionImage ? "Evolution" : undefined
      }
    : activeArt;
  const rarity = card.rarity.toLowerCase();
  // Vendored portraits first: their bright rarity frames are the same art the
  // share image draws, so decks read identically everywhere. The API-hosted
  // icon stays in the chain for cards released after the vendored snapshot.
  const artSources = [
    vendoredCardImage(card.name, art.variant),
    vendoredCardImage(card.name),
    art.src,
    UNKNOWN_CARD_IMAGE
  ].filter((candidate, index, candidates) => candidates.indexOf(candidate) === index);

  return (
    <span
      className={`game-card-art game-card-art-${size}`}
      data-card={slugify(card.name)}
      data-rarity={rarity}
      data-variant={art.variant?.toLowerCase() ?? "base"}
    >
      <CardArt
        src={artSources[0]}
        alt={art.variant ? `${card.name} (${art.variant})` : card.name}
        width={150}
        height={180}
        priority={priority}
        fallback={artSources.slice(1)}
      />
      {card.elixir > 0 ? <span className="game-card-elixir" aria-hidden="true">{card.elixir}</span> : null}
      {showLevel && card.level !== undefined ? (
        <span className="game-card-level" aria-hidden="true">Level {card.level}</span>
      ) : null}
    </span>
  );
}
