import { useState } from "react";
import { useQuery } from "convex/react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import { TrendChart } from "@/components/TrendChart";
import { deckReportQuery, type Archetype, type DeckReport } from "@/lib/analytics";
import type { MetaState } from "@/lib/metaReport";
import { DeckTile } from "./DeckTile";
import { useMetaCopy } from "./metaCopy";
import { archetypeName, BlockSkeleton, cardFor, cx, DataNote, EmptyBlock, rateTone, Sheet, type CardIndex } from "./shared";
import styles from "./meta.module.css";

type Change = (patch: Partial<MetaState>, options?: { toContent?: boolean }) => void;

export function CorePair({ ids, byId, size = "small" }: { ids: readonly number[]; byId: CardIndex; size?: "small" | "large" }) {
  return (
    <span className={cx(styles.corePair, size === "large" && styles.corePairLarge)} aria-hidden="true">
      {ids.map((id) => <GameCardArt key={id} card={cardFor(id, byId)} size="library" />)}
    </span>
  );
}

/** Archetype summary card: core pair art, share, wins, change, sparkline. */
export function ArchetypeCard({ archetype, byId, windowDays, onOpen, showTrend = true }: { archetype: Archetype; byId: CardIndex; windowDays: MetaState["windowDays"]; onOpen: () => void; showTrend?: boolean }) {
  const { copy, pct, pts } = useMetaCopy();
  const name = archetypeName(archetype.coreCardIds, byId);
  return (
    <article className={styles.archetypeCard}>
      <div className={styles.archetypeMain}>
        <CorePair ids={archetype.coreCardIds} byId={byId} />
        <h3 className={styles.archetypeName}>{name}</h3>
        <p className={styles.archetypeStats}>
          <span><strong>{pct(archetype.usageRate)}</strong> {copy.archetypeUsage}</span>
          <span><strong className={rateTone(archetype.winRate)}>{pct(archetype.winRate)}</strong> {copy.archetypeWins}</span>
        </p>
        <span className={cx(styles.archetypeDelta, archetype.usageDelta >= 0 ? styles.up : styles.down)}>
          {copy.vsPrevious(pts(archetype.usageDelta), windowDays)}
        </span>
        <ChevronRight size={16} aria-hidden="true" className={styles.archetypeChevron} />
        <button type="button" className={styles.archetypeHit} onClick={onOpen} aria-label={`${copy.archetypeOpen}: ${name}`} />
      </div>
      {showTrend ? (
        <div className={styles.sparkline}>
          <TrendChart points={archetype.points} metric="usageRate" label={name} />
        </div>
      ) : null}
    </article>
  );
}

export function MetaArchetypesView({ state, onChange, byId }: { state: MetaState; onChange: Change; byId: CardIndex }) {
  const { copy, count } = useMetaCopy();
  const report = useQuery(deckReportQuery, { mode: state.mode, windowDays: state.windowDays });

  if (!report) return <Sheet labelId="meta-archetypes" title={copy.views.archetypes}><BlockSkeleton count={6} height={210} className={styles.skeletonCards} /></Sheet>;

  const active = state.archetype ? report.archetypes.find((item) => item.id === state.archetype) : undefined;
  if (active) return <ArchetypeDetail archetype={active} report={report} byId={byId} state={state} onChange={onChange} />;

  const note = (
    <DataNote warning={report.truncated ? copy.truncated : undefined}>
      <p>{copy.archetypeNote(count(report.minArchetypeUses))}</p>
    </DataNote>
  );

  return (
    <Sheet labelId="meta-archetypes" title={copy.views.archetypes} note={note}>
      {state.archetype ? <p className={styles.inlineWarning}>{copy.archetypeMissing}</p> : null}
      {report.archetypes.length ? (
        <div className={styles.archetypeGrid}>
          {report.archetypes.map((archetype) => (
            <ArchetypeCard
              key={archetype.id}
              archetype={archetype}
              byId={byId}
              windowDays={state.windowDays}
              onOpen={() => onChange({ view: "archetypes", archetype: archetype.id }, { toContent: true })}
            />
          ))}
        </div>
      ) : <EmptyBlock title={copy.archetypesEmpty} hint={copy.emptyHint} />}
    </Sheet>
  );
}

function ArchetypeDetail({ archetype, report, byId, state, onChange }: { archetype: Archetype; report: DeckReport; byId: CardIndex; state: MetaState; onChange: Change }) {
  const { copy, pct, pts, count } = useMetaCopy();
  const [metric, setMetric] = useState<"usageRate" | "winRate">("usageRate");
  const name = archetypeName(archetype.coreCardIds, byId);

  return (
    <div className={styles.stack}>
      <section className={cx(styles.sheet, styles.archetypeDetail)} aria-labelledby="meta-archetype-title">
        <button type="button" className={styles.backLink} onClick={() => onChange({ archetype: undefined }, { toContent: true })}>
          <ArrowLeft size={15} aria-hidden="true" />{copy.archetypeBack}
        </button>
        <div className={styles.archetypeDetailHead}>
          <CorePair ids={archetype.coreCardIds} byId={byId} size="large" />
          <div>
            <h2 id="meta-archetype-title" className={styles.archetypeDetailTitle}>{name}</h2>
            <p className={styles.sheetDek}>{copy.archetypeDetailDek(name, count(archetype.uses))}</p>
            <dl className={styles.bigStats}>
              <div><dt>{copy.usage}</dt><dd>{pct(archetype.usageRate)}</dd></div>
              <div><dt>{copy.winRate}</dt><dd className={rateTone(archetype.winRate)}>{pct(archetype.winRate)}</dd></div>
              <div>
                <dt>{copy.changeLabel(state.windowDays)}</dt>
                <dd className={archetype.usageDelta >= 0 ? styles.up : styles.down}>{copy.pointsValue(pts(archetype.usageDelta))}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className={styles.trendPanel}>
          <div className={styles.segment} role="group" aria-label={copy.trendMetric}>
            {(["usageRate", "winRate"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={metric === item} className={cx(styles.segmentButton, metric === item && styles.segmentOn)} onClick={() => setMetric(item)}>
                {item === "usageRate" ? copy.trendUsage : copy.trendWinRate}
              </button>
            ))}
          </div>
          <TrendChart points={archetype.points} metric={metric} label={name} />
        </div>
      </section>

      <Sheet
        labelId="meta-archetype-decks"
        title={copy.archetypeDecks}
        note={<DataNote warning={report.truncated ? copy.truncated : undefined}><p>{copy.archetypeNote(count(report.minArchetypeUses))}</p></DataNote>}
      >
        <div className={styles.deckGridList}>
          {archetype.representativeDecks.map((deck, index) => (
            <DeckTile key={deck.deckHash} deck={deck} rank={index + 1} byId={byId} />
          ))}
        </div>
      </Sheet>
    </div>
  );
}
