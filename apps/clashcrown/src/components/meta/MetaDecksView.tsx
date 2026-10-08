import { useState } from "react";
import { useQuery } from "convex/react";
import { ChevronRight, X } from "lucide-react";
import Link from "@/components/Link";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import type { CardReport } from "@/lib/analytics";
import type { Card } from "@/lib/clash/domain";
import { discoverDecksQuery } from "@/lib/deckDiscovery";
import { DECK_SORTS, MAX_FILTER_CARDS, toggleCardFilter, topUsedCardIds, type MetaState } from "@/lib/metaReport";
import { CardPicker } from "./CardPicker";
import { DeckTile } from "./DeckTile";
import { useMetaCopy } from "./metaCopy";
import { BlockSkeleton, cardFor, cx, DataNote, EmptyBlock, type CardIndex } from "./shared";
import styles from "./meta.module.css";

type Change = (patch: Partial<MetaState>, options?: { toContent?: boolean }) => void;

const PAGE_SIZE = 24;

export function MetaDecksView({
  state,
  onChange,
  byId,
  cards,
  cardReport
}: {
  state: MetaState;
  onChange: Change;
  byId: CardIndex;
  cards: readonly Card[];
  cardReport: CardReport | undefined;
}) {
  const { copy, count } = useMetaCopy();
  const result = useQuery(discoverDecksQuery, {
    mode: state.mode,
    windowDays: state.windowDays,
    sort: state.sort,
    includeCardIds: state.include,
    excludeCardIds: state.exclude,
    limit: 100
  });
  const filterKey = `${state.mode}:${state.windowDays}:${state.sort}:${state.include.join(",")}:${state.exclude.join(",")}`;
  const [paging, setPaging] = useState({ key: filterKey, visible: PAGE_SIZE });
  const visible = paging.key === filterKey ? paging.visible : PAGE_SIZE;
  const quickIds = topUsedCardIds(cardReport?.tiers ?? [], 12);
  const hasFilters = state.include.length + state.exclude.length > 0;
  const atLimit = state.include.length >= MAX_FILTER_CARDS;

  function toggle(cardId: number, list: "include" | "exclude") {
    onChange(toggleCardFilter(state, cardId, list));
  }

  const activeFilters = [
    ...state.include.map((id) => ({ id, list: "include" as const, label: copy.withCard(cardFor(id, byId).name) })),
    ...state.exclude.map((id) => ({ id, list: "exclude" as const, label: copy.withoutCard(cardFor(id, byId).name) }))
  ];

  return (
    <section className={styles.sheet} aria-labelledby="meta-decks-title">
      <header className={styles.sheetHeader}>
        <h2 id="meta-decks-title" className={styles.sheetTitle}>{copy.views.decks}</h2>
        <div className={styles.segment} role="group" aria-label={copy.sortGroup}>
          {DECK_SORTS.map((sort) => (
            <button key={sort} type="button" aria-pressed={state.sort === sort} className={cx(styles.segmentButton, state.sort === sort && styles.segmentOn)} onClick={() => onChange({ sort })}>
              {copy.sorts[sort]}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.toolbox}>
        {quickIds.length ? (
          <div className={styles.quickChips} role="group" aria-label={copy.popularCards}>
            {quickIds.map((id) => {
              const card = cardFor(id, byId);
              const on = state.include.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  title={copy.requireCard(card.name)}
                  disabled={!on && atLimit}
                  className={cx(styles.quickChip, on && styles.quickChipOn)}
                  onClick={() => toggle(id, "include")}
                >
                  <GameCardArt card={card} size="micro" showLevel={false} />
                  <span>{card.name}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <CardPicker cards={cards} include={state.include} exclude={state.exclude} onPick={toggle} />

        <div className={styles.filterSummary}>
          <p className={styles.resultCount} role="status" aria-live="polite">
            {result ? copy.resultCount(count(result.matched), count(result.totalRanked)) : copy.heroSampleLoading}
          </p>
          {activeFilters.length ? (
            <ul className={styles.activeFilters}>
              {activeFilters.map((filter) => (
                <li key={`${filter.list}-${filter.id}`}>
                  <button type="button" className={cx(styles.activeChip, filter.list === "exclude" && styles.activeChipExclude)} onClick={() => toggle(filter.id, filter.list)} aria-label={copy.removeFilter(filter.label)}>
                    {filter.label}<X size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
              <li><button type="button" className={styles.textLink} onClick={() => onChange({ include: [], exclude: [] })}>{copy.clearFilters}</button></li>
            </ul>
          ) : null}
          {atLimit ? <p className={styles.mutedLine}>{copy.filterLimit}</p> : null}
          <Link href="/decks" className={cx(styles.textLink, styles.pushRight)}>{copy.advancedSearch}<ChevronRight size={15} aria-hidden="true" /></Link>
        </div>
      </div>

      {!result ? <BlockSkeleton count={6} height={340} className={styles.skeletonDecks} /> : result.decks.length ? (
        <>
          <div className={styles.deckGridList}>
            {result.decks.slice(0, visible).map((deck, index) => (
              <DeckTile key={deck.deckHash} deck={deck} rank={index + 1} byId={byId} />
            ))}
          </div>
          {result.decks.length > visible ? (
            <button type="button" className={styles.moreButton} onClick={() => setPaging({ key: filterKey, visible: visible + PAGE_SIZE })}>
              {copy.showMore}
            </button>
          ) : null}
        </>
      ) : hasFilters ? (
        <EmptyBlock
          title={copy.noDecksMatch}
          hint={copy.noDecksMatchHint}
          action={<button type="button" className={styles.ghostButton} onClick={() => onChange({ include: [], exclude: [] })}>{copy.clearFilters}</button>}
        />
      ) : <EmptyBlock title={copy.emptyDecks} hint={copy.emptyHint} />}

      <div className={styles.sheetFoot}>
        <DataNote>
          <p>{copy.ratingTitle}</p>
          {result ? <p>{copy.deckNote(result.totalRanked)}</p> : null}
          <p>{copy.sourceNote}</p>
        </DataNote>
      </div>
    </section>
  );
}
