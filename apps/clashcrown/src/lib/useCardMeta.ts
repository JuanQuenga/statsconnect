import { useMemo } from "react";
import { useQuery } from "convex/react";
import { cardReportQuery } from "@/lib/analytics";
import { topCardsQuery, topTowerTroopsQuery } from "@/lib/convex";
import type { MetaMode } from "@/lib/clash/battles";
import { buildCardMetaRecords, type CardMetaRecord } from "@/lib/cardMetaSelectors";

export type CardMeta = CardMetaRecord;

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
  const report = useQuery(cardReportQuery, { mode, windowDays });
  const towerPayload = useQuery(topTowerTroopsQuery, { mode, windowDays, limit: 200 });

  return useMemo(() => {
    const byId = buildCardMetaRecords({ cards: payload?.cards ?? [], report });
    const towerById = new Map<number, CardMeta>();
    for (const [index, row] of (towerPayload?.towerTroops ?? []).entries()) {
      towerById.set(row.towerCardId, {
        cardId: row.towerCardId,
        rank: index + 1,
        uses: row.uses,
        wins: row.wins,
        winRate: row.winRate,
        usageRate: row.usageRate,
        tier: null,
        score: null,
        movement: null,
        status: { kind: "observed" }
      });
    }
    return {
      byId,
      towerById,
      decksObserved: payload?.decksObserved ?? 0,
      towerDecksObserved: towerPayload?.decksObserved ?? 0,
      ranked: payload?.cards.length ?? 0,
      report,
      towerPayload,
      loading: payload === undefined || report === undefined,
      towerLoading: towerPayload === undefined,
      mode,
      windowDays
    } satisfies {
      byId: Map<number, CardMeta>;
      towerById: Map<number, CardMeta>;
      decksObserved: number;
      towerDecksObserved: number;
      ranked: number;
      report: typeof report;
      towerPayload: typeof towerPayload;
      loading: boolean;
      towerLoading: boolean;
      mode: MetaMode;
      windowDays: number;
    };
  }, [payload, report, towerPayload, mode, windowDays]);
}
