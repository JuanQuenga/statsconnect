import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import Link from "@/components/Link";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import { PlayerShareActions } from "@/components/portfolio/PlayerShareActions";
import { cardSlug } from "@/lib/clash/cards";
import { buildCardUpgradePlan, MAX_CARD_LEVEL } from "@/lib/clash/upgradeCosts";
import type { Card, Player } from "@/lib/mock-data";

const RARITIES = ["All", "Common", "Rare", "Epic", "Legendary", "Champion"] as const;
const OWNERSHIP = ["All", "Owned", "Missing"] as const;
const LEVELS = ["All", "Max level", "Level 14+", "Level 11+", "Level 1–10", "Unknown"] as const;
const SORTS = ["Level: high to low", "Level: low to high", "Upgrade ready", "Rarity", "Name"] as const;
const RARITY_ORDER: readonly Card["rarity"][] = ["Champion", "Legendary", "Epic", "Rare", "Common"];

type RarityFilter = (typeof RARITIES)[number];
type OwnershipFilter = (typeof OWNERSHIP)[number];
type LevelFilter = (typeof LEVELS)[number];
type Sort = (typeof SORTS)[number];

type CollectionCard = Card & {
  owned: boolean;
  upgradeReady: boolean;
};

function cardKey(card: Card): string {
  return typeof card.id === "number" ? `id:${card.id}` : `name:${card.name.toLowerCase()}`;
}

function mergeCollection(ownedCards: Card[], catalogCards: Card[]): CollectionCard[] {
  const ownedByKey = new Map(ownedCards.map((card) => [cardKey(card), card]));
  const merged = catalogCards.map((catalogCard) => {
    const ownedCard = ownedByKey.get(cardKey(catalogCard));
    if (ownedCard) ownedByKey.delete(cardKey(catalogCard));
    const card = ownedCard
      ? {
          ...catalogCard,
          ...ownedCard,
          canEvolve: catalogCard.canEvolve || ownedCard.canEvolve,
          evolutionImage: ownedCard.evolutionImage ?? catalogCard.evolutionImage,
          heroImage: ownedCard.heroImage ?? catalogCard.heroImage,
          owned: true
        }
      : { ...catalogCard, owned: false };
    return { ...card, upgradeReady: card.owned && buildCardUpgradePlan(card).ready };
  });

  for (const card of ownedByKey.values()) {
    const owned = { ...card, owned: true };
    merged.push({ ...owned, upgradeReady: buildCardUpgradePlan(owned).ready });
  }
  return merged;
}

function matchesLevel(card: CollectionCard, filter: LevelFilter): boolean {
  if (filter === "All") return true;
  if (filter === "Unknown") return card.level === undefined;
  if (card.level === undefined) return false;
  if (filter === "Max level") return card.level >= MAX_CARD_LEVEL;
  if (filter === "Level 14+") return card.level >= 14;
  if (filter === "Level 11+") return card.level >= 11;
  return card.level <= 10;
}

function sortCards(cards: CollectionCard[], sort: Sort): CollectionCard[] {
  return [...cards].sort((a, b) => {
    if (sort === "Level: high to low") return (b.level ?? -1) - (a.level ?? -1) || a.name.localeCompare(b.name);
    if (sort === "Level: low to high") return (a.level ?? Number.MAX_SAFE_INTEGER) - (b.level ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);
    if (sort === "Upgrade ready") return Number(b.upgradeReady) - Number(a.upgradeReady) || (b.level ?? -1) - (a.level ?? -1) || a.name.localeCompare(b.name);
    if (sort === "Rarity") return RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
}

export function PlayerCardCollection({
  player,
  catalogCards = [],
  catalogLoading = false,
  catalogError = false
}: {
  player: Player;
  catalogCards?: Card[];
  catalogLoading?: boolean;
  catalogError?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState<RarityFilter>("All");
  const [ownership, setOwnership] = useState<OwnershipFilter>("All");
  const [level, setLevel] = useState<LevelFilter>("All");
  const [sort, setSort] = useState<Sort>("Level: high to low");
  const [onlyReady, setOnlyReady] = useState(false);
  const [onlyEvolutions, setOnlyEvolutions] = useState(false);
  const hasCatalog = catalogCards.length > 0;
  const collectionAvailable = player.cardCollectionAvailable ?? player.cards.length > 0;

  const collection = useMemo(
    () => mergeCollection(player.cards, catalogCards),
    [catalogCards, player.cards]
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortCards(collection.filter((card) => {
      if (query && !card.name.toLowerCase().includes(query)) return false;
      if (rarity !== "All" && card.rarity !== rarity) return false;
      if (ownership === "Owned" && !card.owned) return false;
      if (ownership === "Missing" && card.owned) return false;
      if (!matchesLevel(card, level)) return false;
      if (onlyReady && !card.upgradeReady) return false;
      if (onlyEvolutions && !card.canEvolve) return false;
      return true;
    }), sort);
  }, [collection, level, onlyEvolutions, onlyReady, ownership, rarity, search, sort]);

  if (!collectionAvailable) {
    return <section className="profile-section empty-panel"><h2>No cards available</h2><p>The API did not return this player&rsquo;s card collection.</p></section>;
  }

  const ownedCount = collection.filter((card) => card.owned).length;
  const missingCount = hasCatalog ? collection.length - ownedCount : undefined;

  return (
    <section className="profile-section player-card-browser">
      <div className="section-heading collection-heading">
        <span className="filter-button static">{filtered.length} of {collection.length || player.cards.length}</span>
        <h2>Card Collection</h2>
        <PlayerShareActions player={player} compact />
      </div>
      <div className="collection-summary" aria-label="Card collection summary">
        <span><strong>{ownedCount}</strong> owned</span>
        <span><strong>{missingCount === undefined ? "—" : missingCount}</strong> missing</span>
        <span><strong>{collection.filter((card) => card.upgradeReady).length}</strong> ready</span>
        <span><strong>{collection.filter((card) => card.canEvolve).length}</strong> evolutions</span>
      </div>
      <div className="collection-toolbar">
        <label className="card-search collection-search">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search collection" aria-label="Search collection" />
        </label>
        <SelectControl label="Rarity" value={rarity} onChange={(value) => setRarity(value as RarityFilter)} options={RARITIES} />
        <SelectControl
          label="Ownership"
          value={ownership}
          onChange={(value) => setOwnership(value as OwnershipFilter)}
          options={OWNERSHIP}
          disabledOptions={hasCatalog ? [] : ["Missing"]}
        />
        <SelectControl label="Level" value={level} onChange={(value) => setLevel(value as LevelFilter)} options={LEVELS} />
        <SelectControl label="Sort collection" value={sort} onChange={(value) => setSort(value as Sort)} options={SORTS} />
        <button type="button" className={onlyReady ? "toolbar-toggle toolbar-toggle-on" : "toolbar-toggle"} aria-pressed={onlyReady} onClick={() => setOnlyReady((value) => !value)}>Upgrade ready</button>
        <button type="button" className={onlyEvolutions ? "toolbar-toggle toolbar-toggle-on" : "toolbar-toggle"} aria-pressed={onlyEvolutions} onClick={() => setOnlyEvolutions((value) => !value)}>Evolution available</button>
      </div>
      {catalogLoading ? <p className="collection-catalog-note" role="status">Loading the live card catalog to identify missing cards…</p> : null}
      {catalogError ? <p className="collection-catalog-note collection-catalog-error" role="alert">The live catalog could not be loaded. Owned cards are still shown, but missing-card totals and filters are unavailable.</p> : null}
      <div className="collection-grid">
        {filtered.map((card) => <CollectionTile card={card} key={cardKey(card)} />)}
      </div>
      {!filtered.length ? <p className="empty-results">No cards match those collection filters.</p> : null}
      <CollectionStyles />
    </section>
  );
}

function SelectControl({
  label,
  value,
  onChange,
  options,
  disabledOptions = []
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  disabledOptions?: readonly string[];
}) {
  return (
    <label className="rarity-filter collection-select">
      <span className="sr-only">{label}</span>
      <select value={value} aria-label={label} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} disabled={disabledOptions.includes(option)}>{option}</option>)}
      </select>
    </label>
  );
}

function CollectionTile({ card }: { card: CollectionCard }) {
  const progress = card.owned ? buildCardUpgradePlan(card) : undefined;
  return (
    <Link href={`/cards/${cardSlug(card.name)}`} className={card.owned ? "collection-card" : "collection-card collection-card-missing"} aria-label={`${card.name}, ${card.owned ? "owned" : "missing"}`}>
      <GameCardArt card={card} size="collection" />
      <strong>{card.name}</strong>
      <span className="collection-card-meta">{card.rarity}{card.variant ? ` · ${card.variant}` : card.canEvolve ? " · Evolution available" : ""}</span>
      <small className={card.upgradeReady ? "collection-status collection-status-ready" : "collection-status"}>
        {!card.owned ? "Not owned" : card.upgradeReady ? "Ready to upgrade" : progress?.level === MAX_CARD_LEVEL ? "Max level" : card.variant ? `${card.variant} unlocked` : "Owned"}
      </small>
    </Link>
  );
}

function CollectionStyles() {
  return <style>{`
    .collection-heading { grid-template-columns: 150px 1fr minmax(220px, 310px); }
    .collection-heading .player-share-actions { justify-self: end; }
    .collection-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: -12px 0 18px; }
    .collection-summary > span { display: flex; align-items: baseline; justify-content: center; gap: 7px; padding: 10px; border: 1px solid rgba(62, 88, 128, .2); border-radius: 7px; color: #8ea2c4; background: rgba(8, 24, 44, .5); font: 10px var(--font-ui); }
    .collection-summary strong { color: white; font-size: 17px; }
    .collection-toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 22px; padding: 12px; border: 1px solid rgba(62, 88, 128, .2); border-radius: 9px; background: rgba(8, 24, 44, .52); }
    .collection-search { flex: 1 1 210px; min-width: 0; }
    .collection-select { flex: 1 1 145px; min-width: 130px; }
    .collection-toolbar .toolbar-toggle { flex: 0 1 auto; }
    .collection-catalog-note { margin: -8px 0 20px; color: #8ea2c4; font: 11px/1.5 var(--font-ui); text-align: center; }
    .collection-catalog-error { color: #ffb5c5; }
    .collection-card-missing .game-card-art { filter: grayscale(1); opacity: .38; }
    .collection-card-missing:hover .game-card-art { opacity: .58; }
    .collection-card-missing { border-style: dashed; background: rgba(8, 24, 44, .42); }
    .collection-status { min-height: 14px; color: #6f86aa !important; font-weight: 700 !important; letter-spacing: .03em; text-transform: uppercase; }
    .collection-status-ready { color: #55d895 !important; }
    @media (max-width: 980px) {
      .collection-heading { grid-template-columns: 1fr; }
      .collection-heading .player-share-actions { justify-self: center; }
    }
    @media (max-width: 620px) {
      .collection-summary { grid-template-columns: repeat(2, 1fr); }
      .collection-toolbar .toolbar-toggle { flex: 1 1 calc(50% - 10px); padding: 0 10px; }
    }
  `}</style>;
}
