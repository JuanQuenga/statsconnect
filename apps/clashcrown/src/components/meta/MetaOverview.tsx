import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { ChevronRight, Crown, Flame, Shield, Sparkles, TrendingUp } from "lucide-react";
import { DeckCardGrid } from "@/components/portfolio/DeckCardGrid";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import { deckReportQuery, type CardReport } from "@/lib/analytics";
import type { DiscoveryPayload } from "@/lib/deckDiscovery";
import { buildMetaSummary, selectMetaPulse, type MetaState } from "@/lib/metaReport";
import { ArchetypeCard, CorePair } from "./MetaArchetypesView";
import { DeckTile } from "./DeckTile";
import { useMetaCopy } from "./metaCopy";
import {
  archetypeName,
  BlockSkeleton,
  cardFor,
  cardsFor,
  cx,
  DataNote,
  EmptyBlock,
  MoverColumns,
  Sheet,
  TierRows,
  type CardIndex
} from "./shared";
import styles from "./meta.module.css";

type Change = (patch: Partial<MetaState>, options?: { toContent?: boolean }) => void;

/**
 * One highlight in the pulse strip. Deck art contains block elements, so the
 * click target is a full-tile overlay button rather than a wrapping button.
 */
function PulseTile({
  label,
  icon,
  art,
  headline,
  sub,
  onSelect,
  loading
}: {
  label: string;
  icon: ReactNode;
  art?: ReactNode;
  headline?: string;
  sub?: string;
  onSelect?: () => void;
  loading: boolean;
}) {
  const { copy } = useMetaCopy();
  const interactive = Boolean(onSelect && !loading && headline);
  return (
    <div className={cx(styles.pulseTile, interactive && styles.pulseTileLive)}>
      <div className={styles.pulseStage} aria-hidden="true">{loading ? <span className={styles.pulseGhost} /> : art}</div>
      <span className={styles.pulseLabel}>{icon}{label}</span>
      <strong className={styles.pulseHeadline}>{loading ? "…" : headline ?? copy.pulseNoData}</strong>
      {sub && !loading ? <span className={styles.pulseSub}>{sub}</span> : null}
      {interactive ? (
        <button type="button" className={styles.pulseHit} onClick={onSelect} aria-label={[label, headline, sub].filter(Boolean).join(". ")} />
      ) : null}
    </div>
  );
}

export function MetaOverview({
  state,
  onChange,
  byId,
  board,
  cardReport,
  decksObserved
}: {
  state: MetaState;
  onChange: Change;
  byId: CardIndex;
  board: DiscoveryPayload | undefined;
  cardReport: CardReport | undefined;
  decksObserved: number | undefined;
}) {
  const { copy, locale, pct, pts, count, modeName } = useMetaCopy();
  const deckReport = useQuery(deckReportQuery, { mode: state.mode, windowDays: state.windowDays });
  const pulse = selectMetaPulse({
    decks: board?.decks ?? [],
    tiers: cardReport?.tiers ?? [],
    risers: cardReport?.risers ?? [],
    archetypes: deckReport?.archetypes ?? []
  });
  const nameCard = (id: number) => cardFor(id, byId).name;
  const summaryReady = board && cardReport && deckReport && decksObserved !== undefined;
  const summary = summaryReady
    ? buildMetaSummary({
        modeName: modeName(state.mode),
        windowDays: state.windowDays,
        decksObserved,
        leadArchetype: pulse.leadArchetype && {
          name: archetypeName(pulse.leadArchetype.coreCardIds, byId),
          usageRate: pulse.leadArchetype.usageRate,
          winRate: pulse.leadArchetype.winRate
        },
        mostPlayed: pulse.mostPlayed,
        bestRated: pulse.bestRated,
        strongestCard: pulse.strongestCard && { name: nameCard(pulse.strongestCard.cardId), winRate: pulse.strongestCard.winRate, uses: pulse.strongestCard.uses },
        riser: pulse.risingCard && { name: nameCard(pulse.risingCard.cardId), usageDelta: pulse.risingCard.usageDelta },
        decliner: cardReport.decliners[0] ? { name: nameCard(cardReport.decliners[0].cardId), usageDelta: cardReport.decliners[0].usageDelta } : null,
        hottestArchetype: pulse.hottestArchetype && { name: archetypeName(pulse.hottestArchetype.coreCardIds, byId), usageDelta: pulse.hottestArchetype.usageDelta }
      }, locale)
    : null;
  const truncated = cardReport?.truncated || deckReport?.truncated;
  const topDecks = board?.decks.slice(0, 6) ?? [];

  return (
    <div className={styles.stack}>
      <section className={styles.pulse} aria-labelledby="meta-pulse-title">
        <h2 id="meta-pulse-title" className={styles.srOnly}>{copy.pulseTitle}</h2>
        <PulseTile
          label={copy.pulseMostPlayed}
          icon={<Crown size={14} aria-hidden="true" />}
          loading={!board}
          art={pulse.mostPlayed ? <DeckCardGrid cards={cardsFor(pulse.mostPlayed.cardIds, byId)} evolutionIds={pulse.mostPlayed.evolutionIds} label={copy.pulseMostPlayed} size="compact" linkCards={false} className={styles.pulseDeck} /> : undefined}
          headline={pulse.mostPlayed ? copy.ofGames(pct(pulse.mostPlayed.usageRate, 2)) : undefined}
          sub={pulse.mostPlayed ? copy.winsOver(pct(pulse.mostPlayed.winRate), count(pulse.mostPlayed.uses)) : undefined}
          onSelect={() => onChange({ view: "decks", sort: "popularity" }, { toContent: true })}
        />
        <PulseTile
          label={copy.pulseBestRated}
          icon={<Shield size={14} aria-hidden="true" />}
          loading={!board}
          art={pulse.bestRated ? <DeckCardGrid cards={cardsFor(pulse.bestRated.cardIds, byId)} evolutionIds={pulse.bestRated.evolutionIds} label={copy.pulseBestRated} size="compact" linkCards={false} className={styles.pulseDeck} /> : undefined}
          headline={pulse.bestRated ? copy.ratingValue(String(Math.round(pulse.bestRated.rating * 100))) : undefined}
          sub={pulse.bestRated ? copy.winsOver(pct(pulse.bestRated.winRate), count(pulse.bestRated.uses)) : undefined}
          onSelect={() => onChange({ view: "decks", sort: "rating" }, { toContent: true })}
        />
        <PulseTile
          label={copy.pulseStrongest}
          icon={<Sparkles size={14} aria-hidden="true" />}
          loading={!cardReport}
          art={pulse.strongestCard ? <span className={styles.pulseCard}><GameCardArt card={cardFor(pulse.strongestCard.cardId, byId)} size="collection" /></span> : undefined}
          headline={pulse.strongestCard ? nameCard(pulse.strongestCard.cardId) : undefined}
          sub={pulse.strongestCard ? copy.tierWins(pulse.strongestCard.tier, pct(pulse.strongestCard.winRate)) : undefined}
          onSelect={() => onChange({ view: "cards" }, { toContent: true })}
        />
        <PulseTile
          label={copy.pulseRising}
          icon={<TrendingUp size={14} aria-hidden="true" />}
          loading={!cardReport}
          art={pulse.risingCard ? <span className={styles.pulseCard}><GameCardArt card={cardFor(pulse.risingCard.cardId, byId)} size="collection" /></span> : undefined}
          headline={pulse.risingCard ? nameCard(pulse.risingCard.cardId) : undefined}
          sub={pulse.risingCard ? copy.usagePoints(pts(pulse.risingCard.usageDelta)) : undefined}
          onSelect={() => onChange({ view: "cards" }, { toContent: true })}
        />
        <PulseTile
          label={copy.pulseHottest}
          icon={<Flame size={14} aria-hidden="true" />}
          loading={!deckReport}
          art={pulse.hottestArchetype ? <CorePair ids={pulse.hottestArchetype.coreCardIds} byId={byId} size="large" /> : undefined}
          headline={pulse.hottestArchetype ? archetypeName(pulse.hottestArchetype.coreCardIds, byId) : undefined}
          sub={pulse.hottestArchetype ? copy.vsPrevious(pts(pulse.hottestArchetype.usageDelta), state.windowDays) : undefined}
          onSelect={pulse.hottestArchetype ? () => onChange({ view: "archetypes", archetype: pulse.hottestArchetype?.id }, { toContent: true }) : undefined}
        />
      </section>

      <section className={cx(styles.sheet, styles.summary)} aria-labelledby="meta-summary-title">
        <h2 id="meta-summary-title" className={styles.summaryTitle}>{copy.summaryTitle(modeName(state.mode), state.windowDays)}</h2>
        {summary ? (
          <div className={styles.summaryProse}>{summary.map((sentence) => <p key={sentence}>{sentence}</p>)}</div>
        ) : <BlockSkeleton count={3} height={18} className={styles.skeletonLines} />}
        <DataNote warning={truncated ? copy.truncated : undefined}>
          <p>{copy.sourceNote}</p>
          {board ? <p>{copy.deckNote(board.totalRanked)}</p> : null}
        </DataNote>
      </section>

      <Sheet
        labelId="meta-top-decks"
        title={copy.topDecksTitle}
        aside={
          <button type="button" className={styles.textLink} onClick={() => onChange({ view: "decks", sort: "rating" }, { toContent: true })}>
            {copy.seeAllDecks}<ChevronRight size={15} aria-hidden="true" />
          </button>
        }
        note={<p className={styles.mutedLine}>{copy.topDecksNote}</p>}
      >
        {!board ? <BlockSkeleton count={6} height={300} className={styles.skeletonDecks} /> : topDecks.length ? (
          <div className={cx(styles.deckGridList, styles.deckGridCompact)}>
            {topDecks.map((deck, index) => <DeckTile key={deck.deckHash} deck={deck} rank={index + 1} byId={byId} variant="compact" />)}
          </div>
        ) : <EmptyBlock title={copy.emptyDecks} hint={copy.emptyHint} />}
      </Sheet>

      <div className={styles.twoUp}>
        <Sheet
          labelId="meta-tier-strip"
          title={copy.tierStripTitle}
          aside={
            <button type="button" className={styles.textLink} onClick={() => onChange({ view: "cards" }, { toContent: true })}>
              {copy.fullTierList}<ChevronRight size={15} aria-hidden="true" />
            </button>
          }
          note={cardReport ? <DataNote><p>{copy.tierNote(count(cardReport.minTierUses))}</p></DataNote> : undefined}
        >
          {!cardReport ? <BlockSkeleton count={2} height={72} /> : cardReport.tiers.length ? (
            <TierRows tiers={cardReport.tiers} byId={byId} only={["S", "A"]} limitPerTier={9} />
          ) : <EmptyBlock title={copy.emptyCards} hint={copy.emptyHint} />}
        </Sheet>

        <Sheet
          labelId="meta-movers"
          title={copy.moversTitle}
          note={cardReport ? <DataNote><p>{copy.moverNote(count(cardReport.minMoverUses), state.windowDays)}</p></DataNote> : undefined}
        >
          {!cardReport ? <BlockSkeleton count={2} height={150} className={styles.skeletonTwo} /> : (
            <MoverColumns risers={cardReport.risers} decliners={cardReport.decliners} byId={byId} limit={3} />
          )}
        </Sheet>
      </div>

      <Sheet
        labelId="meta-top-archetypes"
        title={copy.archetypesTitle}
        aside={
          <button type="button" className={styles.textLink} onClick={() => onChange({ view: "archetypes" }, { toContent: true })}>
            {copy.allArchetypes}<ChevronRight size={15} aria-hidden="true" />
          </button>
        }
      >
        {!deckReport ? <BlockSkeleton count={4} height={180} className={styles.skeletonCards} /> : deckReport.archetypes.length ? (
          <div className={cx(styles.archetypeGrid, styles.archetypeGridFour)}>
            {deckReport.archetypes.slice(0, 4).map((archetype) => (
              <ArchetypeCard
                key={archetype.id}
                archetype={archetype}
                byId={byId}
                windowDays={state.windowDays}
                showTrend={false}
                onOpen={() => onChange({ view: "archetypes", archetype: archetype.id }, { toContent: true })}
              />
            ))}
          </div>
        ) : <EmptyBlock title={copy.archetypesEmpty} hint={copy.emptyHint} />}
      </Sheet>
    </div>
  );
}
