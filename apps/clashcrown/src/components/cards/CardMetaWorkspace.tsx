import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "@/components/Link";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import type { Card } from "@/lib/clash/domain";
import { META_MODES, modeLabel, type MetaMode } from "@/lib/clash/battles";
import { cardSlug } from "@/lib/clash/cards";
import {
  CARD_META_TABS,
  cardMetaTabLabel,
  filterCardCatalog,
  movementLabel,
  rankCardMetaRows,
  tierLabel,
  type CardFilterElixir,
  type CardFilters,
  type CardFilterRarity,
  type CardFilterVariant,
  normalizeFiltersForSegment,
  type CardMetaRecord,
  type CardMetaTab,
  type CardCatalogSegment
} from "@/lib/cardMetaSelectors";
import { useCardMeta } from "@/lib/useCardMeta";
import type { useCardLibrary } from "@/lib/useCardCatalog";
import styles from "./CardMetaWorkspace.module.css";

type CardLibrary = ReturnType<typeof useCardLibrary>;
type WindowDays = 1 | 7;
const CATALOG_SEGMENTS: readonly CardCatalogSegment[] = ["cards", "towerTroops"];

const MODE_SET: ReadonlySet<string> = new Set(META_MODES);
const TAB_SET: ReadonlySet<string> = new Set(CARD_META_TABS);
const RARITY_VALUES: readonly CardFilterRarity[] = ["All", "Common", "Rare", "Epic", "Legendary", "Champion"];
const ELIXIR_VALUES: readonly CardFilterElixir[] = ["All", "1", "2", "3", "4", "5", "6+"];
const VARIANT_VALUES: readonly CardFilterVariant[] = ["All", "Evolutions", "Heroes", "Base"];

function isMetaMode(value: string): value is MetaMode {
  return MODE_SET.has(value);
}

function isMetaTab(value: string): value is CardMetaTab {
  return TAB_SET.has(value);
}

function isRarity(value: string): value is CardFilterRarity {
  return RARITY_VALUES.some((item) => item === value);
}

function isElixir(value: string): value is CardFilterElixir {
  return ELIXIR_VALUES.some((item) => item === value);
}

function isVariant(value: string): value is CardFilterVariant {
  return VARIANT_VALUES.some((item) => item === value);
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function number(value: number) {
  return Math.round(value).toLocaleString();
}

function rateClass(value: number) {
  if (value >= 0.5) return styles.good;
  return styles.bad;
}

function movementClass(row: CardMetaRecord) {
  const delta = row.movement?.usageDelta;
  if (delta === undefined || delta === 0) return styles.movementNone;
  return delta > 0 ? styles.movementUp : styles.movementDown;
}

export function CardMetaWorkspace({ library }: { library: CardLibrary }) {
  const [mode, setMode] = useState<MetaMode>("pathOfLegends");
  const [windowDays, setWindowDays] = useState<WindowDays>(7);
  const [tab, setTab] = useState<CardMetaTab>("popularity");
  const [segment, setSegment] = useState<CardCatalogSegment>("cards");
  const [filters, setFilters] = useState<CardFilters>({
    query: "",
    rarity: "All",
    elixir: "All",
    variant: "All"
  });
  const meta = useCardMeta(mode, windowDays);

  const catalog = segment === "cards" ? library.cards : library.towerTroops;
  const visibleCards = useMemo(() => filterCardCatalog(catalog, filters), [catalog, filters]);
  const rankedRows = useMemo(
    () => rankCardMetaRows([...meta.byId.values()], tab).slice(0, 12),
    [meta.byId, tab]
  );
  const towerRows = useMemo(
    () => [...meta.towerById.values()].sort((left, right) => right.uses - left.uses || left.cardId - right.cardId),
    [meta.towerById]
  );
  const selectedMeta = segment === "cards" ? meta.byId : meta.towerById;
  const report = meta.report;
  const rankingTitle = segment === "cards" ? "Card rankings" : "Regular card rankings";

  const updateFilter = <K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className={styles.page}>
      <section className={styles.controls} aria-label="Meta workspace controls">
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Mode</span>
          {META_MODES.map((item) => (
            <button
              className={item === mode ? `${styles.pill} ${styles.active}` : styles.pill}
              key={item}
              type="button"
              aria-pressed={item === mode}
              onClick={() => setMode(item)}
            >
              {modeLabel(item)}
            </button>
          ))}
        </div>
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Window</span>
          {[1, 7].map((days) => (
            <button
              className={days === windowDays ? `${styles.pill} ${styles.active}` : styles.pill}
              key={days}
              type="button"
              aria-pressed={days === windowDays}
              onClick={() => setWindowDays(days === 1 ? 1 : 7)}
            >
              {days === 1 ? "24 hours" : "7 days"}
            </button>
          ))}
        </div>
        <div className={styles.controlRow}>
              <span className={styles.controlLabel}>Browse</span>
          {CATALOG_SEGMENTS.map((item) => (
            <button
              className={item === segment ? `${styles.pill} ${styles.active}` : styles.pill}
              key={item}
              type="button"
              aria-pressed={item === segment}
              onClick={() => {
                setSegment(item);
                setFilters((current) => normalizeFiltersForSegment(item, current));
              }}
            >
              {item === "cards" ? "Cards" : "Tower Troops"}
            </button>
          ))}
        </div>
      </section>

      <div className={styles.layout}>
        <section className={styles.panel} aria-labelledby="ranking-title">
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle} id="ranking-title">{rankingTitle}</h2>
              <p className={styles.panelNote}>
                {segment === "towerTroops" ? "Tower Troop browsing is selected below; this ranking remains regular cards because Tower Troops have a separate signal." : null}
                {segment === "towerTroops" ? " " : null}
                {modeLabel(mode)} · {windowDays === 1 ? "last 24 hours" : "last 7 days"}. Performance uses the report&apos;s confidence-adjusted score when enough games exist.
              </p>
            </div>
            <Link className={styles.detailLink} href="/meta">Open full meta report →</Link>
          </div>

          <div className={styles.tabs} role="tablist" aria-label="Card ranking type">
            {CARD_META_TABS.map((item) => (
              <button
                className={item === tab ? `${styles.tab} ${styles.active}` : styles.tab}
                key={item}
                type="button"
                role="tab"
                aria-selected={item === tab}
                onClick={() => setTab(item)}
              >
                {cardMetaTabLabel(item)}
              </button>
            ))}
          </div>

          <Coverage report={report} decksObserved={meta.decksObserved} />

          {meta.loading ? (
            <p className={styles.empty} role="status">Loading observed card statistics…</p>
          ) : rankedRows.length ? (
            <div className={styles.rankings}>
              {rankedRows.map((row, index) => (
                <RankingRow key={row.cardId} row={row} card={library.byId.get(row.cardId)} rank={index + 1} />
              ))}
            </div>
          ) : (
            <p className={styles.empty}>
              {tab === "rising" || tab === "declining"
                ? `No ${tab} cards clear the sample floor in this window.`
                : "There is not enough observed data to publish this ranking yet."}
            </p>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="catalog-title">
          <div className={styles.catalogHeader}>
            <div>
              <h2 id="catalog-title">{segment === "cards" ? "Card catalog" : "Tower troop catalog"}</h2>
              <span className={styles.catalogCount}>{visibleCards.length} of {catalog.length} shown</span>
              {segment === "towerTroops" ? <p className={styles.catalogNote}>Tower Troop observations are reported separately from regular card rankings.</p> : null}
            </div>
          </div>

          <div className={styles.controlRow}>
            <label className={styles.search}>
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">{segment === "towerTroops" ? "Search tower troops" : "Search cards"}</span>
              <input
                value={filters.query}
                onChange={(event) => updateFilter("query", event.currentTarget.value)}
                placeholder={segment === "towerTroops" ? "Search tower troops" : "Search cards"}
                aria-label={segment === "towerTroops" ? "Search tower troops" : "Search cards"}
              />
            </label>
            <label>
              <span className="sr-only">Filter by rarity</span>
              <select
                className={styles.select}
                value={filters.rarity}
                onChange={(event) => {
                  if (isRarity(event.currentTarget.value)) updateFilter("rarity", event.currentTarget.value);
                }}
              >
                {RARITY_VALUES.map((item) => <option key={item} value={item}>{item} rarity</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by elixir</span>
              <select
                className={styles.select}
                value={filters.elixir}
                onChange={(event) => {
                  if (isElixir(event.currentTarget.value)) updateFilter("elixir", event.currentTarget.value);
                }}
              >
                {ELIXIR_VALUES.map((item) => <option key={item} value={item}>{item === "All" ? "All elixir" : `${item} elixir`}</option>)}
              </select>
            </label>
            {segment === "cards" ? (
              <label>
                <span className="sr-only">Filter by variant</span>
                <select
                  className={styles.select}
                  value={filters.variant}
                  onChange={(event) => {
                    if (isVariant(event.currentTarget.value)) updateFilter("variant", event.currentTarget.value);
                  }}
                >
                  {VARIANT_VALUES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            ) : null}
          </div>

          <div className={styles.cardGrid}>
            {visibleCards.map((card) => (
                <CardTile
                  key={card.id ?? card.name}
                  card={card}
                  meta={selectedMeta.get(card.id ?? -1)}
                  loading={segment === "cards" ? meta.loading : meta.towerLoading}
                  countLabel={segment === "cards" ? "games" : "decks"}
                />
            ))}
          </div>
          {!visibleCards.length ? <p className={styles.empty}>No cards match those filters.</p> : null}
        </section>

        {segment === "cards" ? (
          <TowerTroopPanel cards={library.towerTroops} rows={towerRows} loading={meta.towerLoading} decksObserved={meta.towerDecksObserved} />
        ) : null}

        <details className={`${styles.panel} ${styles.methodology}`}>
          <summary>How to read this workspace</summary>
          <p>
            Usage is the share of observed decks containing a card. Win rate is wins divided by observed games for that card. Cards below the report sample floor remain visible in the catalog but are labeled insufficient and do not receive a tier. Rising and declining compare equal adjacent windows; no movement label means that comparison was not available. This is a crawled sample, not the full Clash Royale player base.
          </p>
          {report?.methodology ? <p>{report.methodology}</p> : null}
          {report?.truncated ? <p>Some daily aggregates reached the read cap, so coverage may be incomplete for this window.</p> : null}
        </details>
      </div>
    </div>
  );
}

function Coverage({ report, decksObserved }: { report: ReturnType<typeof useCardMeta>["report"]; decksObserved: number }) {
  return (
    <div className={styles.coverage} aria-label="Observed sample summary">
      <div className={styles.coverageCard}><span>Decks observed</span><strong>{number(decksObserved)}</strong></div>
      <div className={styles.coverageCard}><span>Recent report</span><strong>{report ? number(report.recentDecks) : "—"}</strong></div>
      <div className={styles.coverageCard}><span>Tier floor</span><strong>{report ? `${number(report.minTierUses)} uses` : "—"}</strong></div>
    </div>
  );
}

function RankingRow({ row, card, rank, countLabel = "Games" }: { row: CardMetaRecord; card: Card | undefined; rank: number; countLabel?: "Games" | "Decks" }) {
  if (!card) {
    return (
      <div className={styles.rankingRow}>
        <span className={styles.rank}>{rank}</span>
        <span className={styles.entityText}><strong className={styles.entityName}>Card {row.cardId}</strong><small className={styles.entitySub}>Not in live catalog</small></span>
        <span className={styles.metric}><span className={styles.metricLabel}>{countLabel}</span><strong className={styles.metricValue}>{number(row.uses)}</strong></span>
      </div>
    );
  }
  return (
    <div className={styles.rankingRow}>
      <span className={styles.rank}>{rank}</span>
      <Link className={styles.entity} href={`/cards/${cardSlug(card.name)}`}>
        <span className={styles.thumb}><GameCardArt card={card} size="library" showLevel={false} portrait="highest" /></span>
        <span className={styles.entityText}><strong className={styles.entityName}>{card.name}</strong><small className={styles.entitySub}>{card.rarity} · {card.elixir} elixir · {tierLabel(row)}</small></span>
      </Link>
      <span className={styles.metric}><span className={styles.metricLabel}>Usage</span><strong className={styles.metricValue}>{percent(row.usageRate)}</strong></span>
      <span className={styles.metric}><span className={styles.metricLabel}>Win rate</span><strong className={`${styles.metricValue} ${rateClass(row.winRate)}`}>{percent(row.winRate)}</strong></span>
      <span className={styles.metric}><span className={styles.metricLabel}>{countLabel}</span><strong className={styles.metricValue}>{number(row.uses)}</strong></span>
      <span className={styles.metric}><span className={styles.metricLabel}>Score</span><strong className={styles.metricValue}>{row.score === null ? "—" : row.score.toFixed(3)}</strong></span>
      <span className={`${styles.movement} ${movementClass(row)}`} title={row.movement ? `Win rate change ${percent(Math.abs(row.movement.winRateDelta))}` : undefined}>{movementLabel(row)}</span>
      <Link className={styles.detailLink} href={`/cards/${cardSlug(card.name)}`}>Details</Link>
    </div>
  );
}

function CardTile({ card, meta, loading, countLabel = "games" }: { card: Card; meta: CardMetaRecord | undefined; loading: boolean; countLabel?: "games" | "decks" }) {
  return (
    <Link className={styles.cardTile} href={`/cards/${cardSlug(card.name)}`}>
      <span className={styles.cardTileArt}><GameCardArt card={card} size="library" showLevel={false} portrait="highest" /></span>
      <strong className={styles.cardTileName}>{card.name}</strong>
      <span className={styles.entitySub}>{card.rarity} · {card.elixir} elixir</span>
      {meta ? <CardTileStats meta={meta} countLabel={countLabel} /> : <span className={`${styles.cardTileMeta} ${styles.status}`}>{loading ? "Loading observed stats…" : "Not observed in this sample"}</span>}
    </Link>
  );
}

function CardTileStats({ meta, countLabel }: { meta: CardMetaRecord; countLabel: "games" | "decks" }) {
  if (meta.status.kind === "insufficient") {
    return <span className={`${styles.cardTileMeta} ${styles.status}`}>Insufficient sample · {number(meta.uses)} / {number(meta.status.minimumUses)} uses</span>;
  }
  return (
    <span className={styles.cardTileMeta}>
      <span><strong>{percent(meta.usageRate)}</strong> usage · <strong className={rateClass(meta.winRate)}>{percent(meta.winRate)}</strong> win</span>
      <span>{number(meta.uses)} {countLabel} · {meta.tier ? `${meta.tier} tier` : "Tier pending"} · {movementLabel(meta)}</span>
    </span>
  );
}

function TowerTroopPanel({ cards, rows, loading, decksObserved }: { cards: Card[]; rows: CardMetaRecord[]; loading: boolean; decksObserved: number }) {
  return (
    <section className={`${styles.panel} ${styles.towerPanel}`} aria-labelledby="tower-troop-title">
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle} id="tower-troop-title">Tower troop signal</h2>
          <p className={styles.panelNote}>Tracked separately because each deck brings one Tower Troop, not eight regular cards. {loading ? "Loading the denominator…" : `${number(decksObserved)} decks observed in this window.`}</p>
        </div>
      </div>
      {loading ? <p className={styles.empty}>Loading Tower Troop observations…</p> : rows.length ? (
        <div className={styles.rankings}>
          {rows.slice(0, 6).map((row, index) => <RankingRow key={row.cardId} row={row} card={cards.find((item) => item.id === row.cardId)} rank={index + 1} countLabel="Decks" />)}
        </div>
      ) : <p className={styles.empty}>Tower Troop tracking has no publishable observations in this window yet.</p>}
    </section>
  );
}
