import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { Card, Player } from "@/lib/clash/domain";
import { clashBackend } from "@/lib/platformBackend";

export const discoverDecksQuery = clashBackend.meta.discoverDecks;
export type DiscoveryArgs = FunctionArgs<typeof discoverDecksQuery>;
export type DiscoveryPayload = FunctionReturnType<typeof discoverDecksQuery>;
export type DiscoveryDeck = DiscoveryPayload["decks"][number];
export type DiscoverySort = NonNullable<DiscoveryArgs["sort"]>;

export type DeckCost = { average: number; cycle: number };

export function deckCost(cardIds: number[], catalog: Map<number, Card>): DeckCost | null {
  const cards = cardIds.map((cardId) => catalog.get(cardId));
  if (cards.some((card) => !card || card.elixir <= 0)) return null;
  const costs = cards.map((card) => card?.elixir ?? 0);
  const cheapest = [...costs].sort((left, right) => left - right).slice(0, 4);
  return {
    average: costs.reduce((total, cost) => total + cost, 0) / costs.length,
    cycle: cheapest.reduce((total, cost) => total + cost, 0)
  };
}

function cardReadiness(card?: Card) {
  if (!card || card.level === undefined) return 0;
  if (!card.maxLevel || card.maxLevel <= 0) return 1;
  return Math.max(0, Math.min(1, card.level / card.maxLevel));
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export type PersonalizedDeck = DiscoveryDeck & {
  personalScore: number;
  ownershipScore: number;
  readinessScore: number;
  missingCardIds: number[];
  underleveledCardIds: number[];
};

/** 50% observed rating, 30% ownership, 20% relative collection readiness. */
export function personalizeDecks(decks: DiscoveryDeck[], player: Player): PersonalizedDeck[] {
  const collection = new Map(
    player.cards
      .filter((card): card is Card & { id: number } => typeof card.id === "number")
      .map((card) => [card.id, card])
  );
  const collectionReadiness = [...collection.values()].map(cardReadiness).filter((value) => value > 0);
  const underleveledBelow = Math.max(0.55, median(collectionReadiness) - 0.18);

  return decks
    .map((deck) => {
      const missingCardIds = deck.cardIds.filter((cardId) => !collection.has(cardId));
      const readinessValues = deck.cardIds.map((cardId) => cardReadiness(collection.get(cardId)));
      const readinessScore = readinessValues.reduce((total, value) => total + value, 0) / 8;
      const ownershipScore = (8 - missingCardIds.length) / 8;
      const underleveledCardIds = deck.cardIds.filter((cardId) => {
        const value = cardReadiness(collection.get(cardId));
        return value > 0 && value < underleveledBelow;
      });
      return {
        ...deck,
        personalScore: deck.rating * 50 + ownershipScore * 30 + readinessScore * 20,
        ownershipScore,
        readinessScore,
        missingCardIds,
        underleveledCardIds
      };
    })
    .sort((left, right) => right.personalScore - left.personalScore || right.uses - left.uses);
}

export type ReplacementOption = {
  cardId: number;
  sharedCards: number;
  observedUses: number;
  rating: number;
};

export type ReplacementSuggestion = {
  cardId: number;
  options: ReplacementOption[];
};

/**
 * Suggests only swaps that occur in nearby observed decks. The overlap count
 * is kept in the result so the UI can say exactly why an option was offered.
 */
export function findReplacements(
  target: PersonalizedDeck,
  observed: DiscoveryDeck[],
  player: Player
): ReplacementSuggestion[] {
  const owned = new Set(
    player.cards.map((card) => card.id).filter((cardId): cardId is number => typeof cardId === "number")
  );
  const weak = [...new Set([...target.missingCardIds, ...target.underleveledCardIds])];
  const original = new Set(target.cardIds);

  return weak.map((cardId) => {
    const remaining = new Set(target.cardIds.filter((id) => id !== cardId));
    const options = new Map<number, ReplacementOption>();
    for (const deck of observed) {
      if (deck.deckHash === target.deckHash || deck.cardIds.includes(cardId)) continue;
      const sharedCards = deck.cardIds.filter((id) => remaining.has(id)).length;
      if (sharedCards < 5) continue;
      for (const candidateId of deck.cardIds) {
        if (original.has(candidateId) || !owned.has(candidateId)) continue;
        const current = options.get(candidateId);
        if (!current || sharedCards > current.sharedCards || (sharedCards === current.sharedCards && deck.uses > current.observedUses)) {
          options.set(candidateId, {
            cardId: candidateId,
            sharedCards,
            observedUses: deck.uses,
            rating: deck.rating
          });
        }
      }
    }
    return {
      cardId,
      options: [...options.values()]
        .sort((left, right) => right.sharedCards - left.sharedCards || right.rating - left.rating || right.observedUses - left.observedUses)
        .slice(0, 2)
    };
  });
}

export type WarDeckResult = {
  decks: PersonalizedDeck[];
  eligibleDecks: number;
  complete: boolean;
};

/** Exact bounded search across the strongest 40 fully-owned observed decks. */
export function selectWarDecks(decks: PersonalizedDeck[]): WarDeckResult {
  const eligible = decks.filter((deck) => deck.missingCardIds.length === 0).slice(0, 40);
  let best: PersonalizedDeck[] = [];
  let bestScore = -1;

  function visit(index: number, selected: PersonalizedDeck[], used: Set<number>, score: number) {
    if (selected.length > best.length || (selected.length === best.length && score > bestScore)) {
      best = [...selected];
      bestScore = score;
    }
    if (selected.length === 4) return;
    for (let next = index; next < eligible.length; next += 1) {
      const candidate = eligible[next];
      if (candidate.cardIds.some((cardId) => used.has(cardId))) continue;
      const nextUsed = new Set(used);
      for (const cardId of candidate.cardIds) nextUsed.add(cardId);
      visit(next + 1, [...selected, candidate], nextUsed, score + candidate.personalScore);
    }
  }

  visit(0, [], new Set<number>(), 0);
  return { decks: best, eligibleDecks: eligible.length, complete: best.length === 4 };
}
