import { slugify } from "./assets";
import type { Card } from "@/lib/mock-data";

/** URL slug for a card detail page. Stable across renames of the asset files. */
export function cardSlug(name: string) {
  return slugify(name);
}

export function findCardBySlug(cards: Card[], slug: string) {
  return cards.find((card) => cardSlug(card.name) === slug);
}

/** Cards grouped by what they do, used for related-card suggestions. */
export function relatedCards(cards: Card[], card: Card, limit = 8) {
  return cards
    .filter((item) => item.name !== card.name)
    .map((item) => ({
      card: item,
      score: (item.rarity === card.rarity ? 2 : 0) + (Math.abs(item.elixir - card.elixir) <= 1 ? 2 : 0)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name))
    .slice(0, limit)
    .map((item) => item.card);
}
