import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { mapCardList, mapSupportCardList } from "@/lib/clash/mappers";
import { cardsAction } from "@/lib/convex";
import type { Card } from "@/lib/mock-data";

/**
 * The card catalog, fetched once per session and shared by every surface.
 *
 * There is exactly one `card-library` query key and therefore exactly one
 * cached shape. That matters more than it looks: React Query caches by key, so
 * two callers that share the key but return different shapes hand each other
 * the wrong data on the next route change — the card grid reads `.cards` off an
 * array and renders nothing, the meta tables get an empty id map and fall back
 * to placeholder art, and anything iterating the result throws. Add callers
 * through this hook rather than re-declaring the query.
 *
 * Requires the Convex provider, so only call it from a subtree gated on
 * `isConvexConfigured`.
 */
export function useCardLibrary() {
  const getCards = useAction(cardsAction);
  const query = useQuery({
    queryKey: ["card-library"],
    queryFn: async () => {
      const payload = await getCards({});
      return {
        cards: mapCardList(payload.cards.data),
        towerTroops: mapSupportCardList(payload.cards.data)
      };
    },
    staleTime: 60 * 60 * 1000,
    retry: false
  });

  return useMemo(() => {
    const cards = query.data?.cards ?? [];
    const towerTroops = query.data?.towerTroops ?? [];
    // Tower Troops are indexed too so a battle log that names one still
    // resolves to art instead of the unknown-card placeholder.
    const byId = new Map<number, Card>();
    for (const card of [...cards, ...towerTroops]) {
      if (typeof card.id === "number") byId.set(card.id, card);
    }
    return { cards, towerTroops, byId, isLoading: query.isLoading, error: query.error };
  }, [query.data, query.isLoading, query.error]);
}

/** Card id -> card, for turning the numeric ids in deck statistics into art. */
export function useCardCatalog() {
  return useCardLibrary().byId;
}
