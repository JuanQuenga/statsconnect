import { ArrowDown, ArrowUp, LayoutGrid, Rows3, Search } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Image from "@/components/Image";
import Link from "@/components/Link";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import type { Card } from "@/lib/clash/domain";
import { META_MODES, modeLabel, type MetaMode } from "@/lib/clash/battles";
import { cardSlug } from "@/lib/clash/cards";
import {
  filterCardCatalog,
  normalizeFiltersForSegment,
  type CardCatalogSegment,
  type CardFilterElixir,
  type CardFilterRarity,
  type CardFilters,
  type CardFilterVariant,
  type CardMetaRecord,
  type CardMetaTier
} from "@/lib/cardMetaSelectors";
import { useCardMeta } from "@/lib/useCardMeta";
import type { useCardLibrary } from "@/lib/useCardCatalog";
import styles from "./CardMetaWorkspace.module.css";

type CardLibrary = ReturnType<typeof useCardLibrary>;
type WindowDays = 1 | 7;
type View = "grid" | "tiers";
type SortKey = "usage" | "winRate" | "score" | "rising" | "elixir" | "name";

const RARITIES: readonly CardFilterRarity[] = ["All", "Common", "Rare", "Epic", "Legendary", "Champion"];
const ELIXIRS: readonly CardFilterElixir[] = ["All", "1", "2", "3", "4", "5", "6+"];
const VARIANTS: readonly CardFilterVariant[] = ["All", "Evolutions", "Heroes", "Base"];
const TIERS: readonly CardMetaTier[] = ["S", "A", "B", "C"];
const SORTS: readonly { key: SortKey; label: string }[] = [
  { key: "usage", label: "Most played" },
  { key: "winRate", label: "Highest win rate" },
  { key: "score", label: "Meta score" },
  { key: "rising", label: "Trending up" },
  { key: "elixir", label: "Elixir cost" },
  { key: "name", label: "Name A–Z" }
];

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const count = (value: number) => Math.round(value).toLocaleString();

/** Cards without a publishable stat for the chosen sort always sink to the end. */
function sortValue(card: Card, meta: CardMetaRecord | undefined, sort: SortKey): number {
  const observed = meta && meta.status.kind === "observed";
  switch (sort) {
    case "usage": return meta ? meta.usageRate : -1;
    case "winRate": return observed ? meta.winRate : -1;
    case "score": return meta?.score ?? -1;
    case "rising": return meta?.movement?.usageDelta ?? -Infinity;
    case "elixir": return -card.elixir;
    case "name": return 0;
  }
}

function sortCards(cards: readonly Card[], metaById: ReadonlyMap<number, CardMetaRecord>, sort: SortKey) {
  return [...cards].sort((left, right) => {
    const difference = sortValue(right, metaById.get(right.id ?? -1), sort) - sortValue(left, metaById.get(left.id ?? -1), sort);
    return difference || left.name.localeCompare(right.name);
  });
}

export function CardMetaWorkspace({ library }: { library: CardLibrary }) {
  const [mode, setMode] = useState<MetaMode>("pathOfLegends");
  const [windowDays, setWindowDays] = useState<WindowDays>(7);
  const [segment, setSegment] = useState<CardCatalogSegment>("cards");
  const [view, setView] = useState<View>("grid");
  const [sort, setSort] = useState<SortKey>("usage");
  const [filters, setFilters] = useState<CardFilters>({ query: "", rarity: "All", elixir: "All", variant: "All" });
  const meta = useCardMeta(mode, windowDays);

  const isTowers = segment === "towerTroops";
  const catalog = isTowers ? library.towerTroops : library.cards;
  const metaById = isTowers ? meta.towerById : meta.byId;
  const loading = isTowers ? meta.towerLoading : meta.loading;
  const decksObserved = isTowers ? meta.towerDecksObserved : meta.decksObserved;
  // Tower Troops have no tiers, so the tier list only exists for regular cards.
  const activeView: View = isTowers ? "grid" : view;

  const visible = useMemo(
    () => sortCards(filterCardCatalog(catalog, filters), metaById, sort),
    [catalog, filters, metaById, sort]
  );
  const filtered = filters.query !== "" || filters.rarity !== "All" || filters.elixir !== "All" || filters.variant !== "All";

  const update = <K extends keyof CardFilters>(key: K, value: CardFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className={styles.page}>
      <section className={styles.toolbar} aria-label="Card filters">
        <div className={styles.toolbarRow}>
          <div className="cr-tabs" role="tablist" aria-label="Card type">
            {(["cards", "towerTroops"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={segment === item}
                onClick={() => {
                  setSegment(item);
                  setFilters((current) => normalizeFiltersForSegment(item, item === "towerTroops" ? { ...current, elixir: "All" } : current));
                }}
              >
                {item === "cards" ? `Cards · ${library.cards.length}` : `Tower Troops · ${library.towerTroops.length}`}
              </button>
            ))}
          </div>
          <div className={styles.scope}>
            <label className={styles.selectLabel}>
              <span>Mode</span>
              <select value={mode} onChange={(event) => setMode(event.currentTarget.value as MetaMode)}>
                {META_MODES.map((item) => <option key={item} value={item}>{modeLabel(item)}</option>)}
              </select>
            </label>
            <div className="cr-tabs" role="group" aria-label="Time window">
              {([1, 7] as const).map((days) => (
                <button key={days} type="button" aria-pressed={windowDays === days} onClick={() => setWindowDays(days)}>
                  {days === 1 ? "24h" : "7 days"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.toolbarRow}>
          <label className={styles.search}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => update("query", event.currentTarget.value)}
              placeholder={isTowers ? "Search Tower Troops" : "Search cards"}
              aria-label={isTowers ? "Search Tower Troops" : "Search cards"}
            />
          </label>
          <label className={styles.selectLabel}>
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.currentTarget.value as SortKey)} disabled={activeView === "tiers"}>
              {SORTS.filter((item) => !isTowers || (item.key !== "score" && item.key !== "rising")).map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </label>
          {!isTowers ? (
            <div className="cr-tabs" role="group" aria-label="View">
              <button type="button" aria-pressed={view === "grid"} aria-label="Grid" onClick={() => setView("grid")}><LayoutGrid size={16} aria-hidden="true" /><span className={styles.viewLabel}>Grid</span></button>
              <button type="button" aria-pressed={view === "tiers"} aria-label="Tier list" onClick={() => setView("tiers")}><Rows3 size={16} aria-hidden="true" /><span className={styles.viewLabel}>Tier list</span></button>
            </div>
          ) : null}
        </div>

        <div className={styles.chipRows}>
          <ChipGroup label="Rarity" values={RARITIES} value={filters.rarity} onChange={(value) => update("rarity", value)} render={(item) => (
            item === "All" ? "All" : <><i className={styles.rarityDot} data-rarity={item} aria-hidden="true" />{item}</>
          )} />
          {!isTowers ? (
            <>
              <ChipGroup label="Elixir" values={ELIXIRS} value={filters.elixir} onChange={(value) => update("elixir", value)} render={(item) => (
                item === "All" ? "All" : <><Image src="/images/icons/elixir.png" alt="" width={14} height={14} />{item}</>
              )} />
              <ChipGroup label="Type" values={VARIANTS} value={filters.variant} onChange={(value) => update("variant", value)} render={(item) => item} />
            </>
          ) : null}
        </div>
      </section>

      <section className={`profile-section ${styles.results}`} aria-labelledby="card-results-title">
        <div className="section-heading">
          <h2 id="card-results-title">{modeLabel(mode)} · {windowDays === 1 ? "last 24 hours" : "last 7 days"}</h2>
          <span>
            {loading ? "Loading stats…" : `${count(decksObserved)} decks observed`}
            {filtered ? ` · ${visible.length} of ${catalog.length} shown` : ""}
          </span>
        </div>

        {visible.length === 0 ? (
          <div className={styles.empty}>
            <strong>No cards match</strong>
            <p>Try a different name or clear a filter.</p>
            <button type="button" className="primary-button cr-button-blue" onClick={() => setFilters({ query: "", rarity: "All", elixir: "All", variant: "All" })}>
              Clear filters
            </button>
          </div>
        ) : activeView === "tiers" ? (
          <TierList cards={visible} metaById={metaById} loading={loading} />
        ) : (
          <ul className={styles.grid}>
            {visible.map((card) => (
              <li key={card.id ?? card.name}>
                <CardTile card={card} meta={metaById.get(card.id ?? -1)} loading={loading} countLabel={isTowers ? "decks" : "games"} />
              </li>
            ))}
          </ul>
        )}

        <p className={styles.footnote}>
          Usage is the share of observed decks that include a card; win rate is its wins over its games. Cards under{" "}
          {meta.report ? `${count(meta.report.minTierUses)} uses` : "the sample floor"} are marked low sample and get no tier. Stats come from
          crawled battle logs, not every Clash Royale match. <Link href="/meta">Full meta report</Link>
        </p>
      </section>
    </div>
  );
}

function ChipGroup<T extends string>({ label, values, value, onChange, render }: {
  label: string;
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
  render: (value: T) => ReactNode;
}) {
  return (
    <div className={styles.chipGroup} role="group" aria-label={label}>
      <span className={styles.chipLabel}>{label}</span>
      <div className={styles.chips}>
        {values.map((item) => (
          <button key={item} type="button" className={styles.chip} aria-pressed={value === item} onClick={() => onChange(item)}>
            {render(item)}
          </button>
        ))}
      </div>
    </div>
  );
}

function CardTile({ card, meta, loading, countLabel }: { card: Card; meta: CardMetaRecord | undefined; loading: boolean; countLabel: "games" | "decks" }) {
  const delta = meta?.movement?.usageDelta;
  return (
    <Link className={styles.tile} href={`/cards/${cardSlug(card.name)}`} data-rarity={card.rarity}>
      {meta?.tier ? <span className={styles.tierBadge} data-tier={meta.tier} aria-label={`${meta.tier} tier`}>{meta.tier}</span> : null}
      <span className={styles.tileArt}><GameCardArt card={card} size="library" portrait="highest" showLevel={false} /></span>
      <strong className={styles.tileName}>{card.name}</strong>
      {meta ? (
        meta.status.kind === "insufficient" ? (
          <span className={styles.lowSample}>Low sample · {count(meta.uses)} {countLabel}</span>
        ) : (
          <span className={styles.stats}>
            <span className={styles.usage}>
              <span className={styles.bar} aria-hidden="true"><i style={{ "--fill": `${Math.min(100, meta.usageRate * 300)}%` } as CSSProperties} /></span>
              <span><b>{percent(meta.usageRate)}</b> used</span>
            </span>
            <span className={styles.win}>
              <b data-good={meta.winRate >= 0.5}>{percent(meta.winRate)}</b> win
              {delta ? (
                <em data-up={delta > 0} title={`Usage ${delta > 0 ? "up" : "down"} ${Math.abs(delta * 100).toFixed(1)} points`}>
                  {delta > 0 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
                  {Math.abs(delta * 100).toFixed(1)}
                </em>
              ) : null}
            </span>
          </span>
        )
      ) : (
        <span className={styles.lowSample}>{loading ? "Loading…" : "Not seen yet"}</span>
      )}
    </Link>
  );
}

function TierList({ cards, metaById, loading }: { cards: readonly Card[]; metaById: ReadonlyMap<number, CardMetaRecord>; loading: boolean }) {
  if (loading) return <div className={styles.empty}><p>Loading tiers…</p></div>;
  const rows = [...TIERS.map((tier) => ({ tier: tier as CardMetaTier | null, label: tier })), { tier: null, label: "—" }];
  const byTier = (tier: CardMetaTier | null) => sortCards(cards, metaById, "score")
    .filter((card) => (metaById.get(card.id ?? -1)?.tier ?? null) === tier);

  return (
    <div className={styles.tierList}>
      {rows.map(({ tier, label }) => {
        const members = byTier(tier);
        if (!members.length) return null;
        return (
          <div key={label} className={styles.tierRow}>
            <span className={styles.tierLetter} data-tier={tier ?? "none"}>
              {label}
              {tier === null ? <small>Low sample</small> : null}
            </span>
            <ul className={styles.tierCards}>
              {members.map((card) => {
                const meta = metaById.get(card.id ?? -1);
                return (
                  <li key={card.id ?? card.name}>
                    <Link href={`/cards/${cardSlug(card.name)}`} title={meta ? `${card.name} · ${percent(meta.usageRate)} used · ${percent(meta.winRate)} win` : card.name}>
                      <GameCardArt card={card} size="mini" portrait="highest" showLevel={false} />
                      <span>{card.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
