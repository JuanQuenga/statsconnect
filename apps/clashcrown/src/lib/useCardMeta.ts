import { useMemo } from "react";
import { useQuery } from "convex/react";
import { topCardsQuery } from "@/lib/convex";
import type { MetaMode } from "@/lib/clash/battles";

export type CardMeta = {
  rank: number;
  uses: number;
  winRate: number;
  usageRate: number;
};

/** The mode the card library reports on: the deepest sample the crawler has. */
export const DEFAULT_META_MODE: MetaMode = "pathOfLegends";
export const DEFAULT_META_WINDOW = 7;

/**
 * Per-card usage and win rate, keyed by card id.
 *
 * Deliberately one query for the whole board rather than one per card: Convex
 * caches by argument, so the card library, a card page and the home page all
 * share a single subscription as long as they ask for the same mode and window.
 * Requires the Convex provider.
 */
export function useCardMeta(mode: MetaMode = DEFAULT_META_MODE, windowDays = DEFAULT_META_WINDOW) {
  const payload = useQuery(topCardsQuery, { mode, windowDays, limit: 200 });

  return useMemo(() => {
    const byId = new Map<number, CardMeta>();
    for (const [index, row] of (payload?.cards ?? []).entries()) {
      byId.set(row.cardId, { rank: index + 1, uses: row.uses, winRate: row.winRate, usageRate: row.usageRate });
    }
    return {
      byId,
      decksObserved: payload?.decksObserved ?? 0,
      ranked: payload?.cards.length ?? 0,
      loading: payload === undefined,
      mode,
      windowDays
    };
  }, [payload, mode, windowDays]);
}
