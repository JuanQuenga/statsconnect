import { useQuery } from "convex/react";
import { ChevronRight } from "lucide-react";
import Link from "@/components/Link";
import type { CardReport } from "@/lib/analytics";
import { topTowerTroopsQuery } from "@/lib/convex";
import type { MetaState } from "@/lib/metaReport";
import { MetaMap } from "./MetaMap";
import { useMetaCopy } from "./metaCopy";
import { BlockSkeleton, CardRow, DataNote, EmptyBlock, MoverColumns, rateTone, Sheet, TierRows, type CardIndex } from "./shared";
import styles from "./meta.module.css";

export function MetaCardsView({ state, byId, cardReport }: { state: MetaState; byId: CardIndex; cardReport: CardReport | undefined }) {
  const { copy, count, pct } = useMetaCopy();
  const towers = useQuery(topTowerTroopsQuery, { mode: state.mode, windowDays: state.windowDays, limit: 12 });
  const tierNote = cardReport ? (
    <DataNote warning={cardReport.truncated ? copy.truncated : undefined}>
      <p>{copy.tierNote(count(cardReport.minTierUses))}</p>
    </DataNote>
  ) : undefined;

  return (
    <div className={styles.stack}>
      <Sheet
        labelId="meta-map-title"
        title={copy.mapTitle}
        aside={<Link href="/cards" className={styles.textLink}>{copy.cardLibrary}<ChevronRight size={15} aria-hidden="true" /></Link>}
        note={tierNote}
      >
        {!cardReport ? <BlockSkeleton count={1} height={420} /> : cardReport.tiers.length >= 4 ? (
          <MetaMap tiers={cardReport.tiers} byId={byId} />
        ) : <EmptyBlock title={copy.emptyCards} hint={copy.emptyHint} />}
      </Sheet>

      <div className={styles.twoUp}>
        <Sheet labelId="meta-tier-list" title={copy.tierListTitle}>
          {!cardReport ? <BlockSkeleton count={4} height={64} /> : cardReport.tiers.length ? (
            <TierRows tiers={cardReport.tiers} byId={byId} />
          ) : <EmptyBlock title={copy.emptyCards} hint={copy.emptyHint} />}
        </Sheet>

        <div className={styles.stack}>
          <Sheet
            labelId="meta-card-movers"
            title={copy.moversTitle}
            note={cardReport ? <DataNote><p>{copy.moverNote(count(cardReport.minMoverUses), state.windowDays)}</p></DataNote> : undefined}
          >
            {!cardReport ? <BlockSkeleton count={2} height={200} className={styles.skeletonTwo} /> : (
              <MoverColumns risers={cardReport.risers} decliners={cardReport.decliners} byId={byId} />
            )}
          </Sheet>

          <Sheet
            labelId="meta-towers"
            title={copy.towerTitle}
            className={styles.towerSheet}
            note={towers && towers.towerTroops.length ? <p className={styles.mutedLine}>{copy.towerNote(count(towers.decksObserved))}</p> : undefined}
          >
            {!towers ? <BlockSkeleton count={3} height={52} /> : towers.towerTroops.length ? (
              <ol className={styles.towerList}>
                {towers.towerTroops.map((row) => (
                  <li key={row.towerCardId}>
                    <CardRow
                      id={row.towerCardId}
                      byId={byId}
                      sub={`${pct(row.usageRate)} ${copy.usage.toLowerCase()}, ${copy.cardTooltipGames(count(row.uses))}`}
                      value={pct(row.winRate)}
                      valueTone={rateTone(row.winRate)}
                    />
                    <span className={styles.usageTrack} aria-hidden="true"><i style={{ width: `${Math.min(100, row.usageRate * 100)}%` }} /></span>
                  </li>
                ))}
              </ol>
            ) : <p className={styles.mutedLine}>{copy.towerStarting}</p>}
          </Sheet>
        </div>
      </div>
    </div>
  );
}
