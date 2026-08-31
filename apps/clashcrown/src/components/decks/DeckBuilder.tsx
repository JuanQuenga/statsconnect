import { Check, Copy, RefreshCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import Link from "@/components/Link";
import { averageElixir, copyDeckLink, fourCardCycle } from "@/lib/clash/assets";
import { deckHash, META_MODES, modeLabel, type MetaMode } from "@/lib/clash/battles";
import { cardSlug } from "@/lib/clash/cards";
import { deckMetaQuery, isConvexConfigured } from "@/lib/convex";
import { useRouter } from "@/lib/router";
import { DEFAULT_META_MODE, DEFAULT_META_WINDOW } from "@/lib/useCardMeta";
import type { Card } from "@/lib/clash/domain";

type DeckBuilderProps = {
  cards: Card[];
  source: string;
  initialCards?: Card[];
  initialKey?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

export function DeckBuilder({
  cards,
  source,
  initialCards = [],
  initialKey = "",
  onRefresh,
  isRefreshing = false
}: DeckBuilderProps) {
  const router = useRouter();
  const include = typeof router.query.include === "string" ? router.query.include : undefined;
  const [selected, setSelected] = useState<Card[]>(initialCards.slice(0, 8));
  const [seededSlug, setSeededSlug] = useState("");
  const [appliedKey, setAppliedKey] = useState(initialKey);
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState("All");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!initialKey || initialKey === appliedKey) return;
    setSelected(initialCards.slice(0, 8));
    setAppliedKey(initialKey);
    setNotice("Observed deck loaded into the builder.");
  }, [appliedKey, initialCards, initialKey]);

  useEffect(() => {
    if (!include || include === seededSlug) return;
    const card = cards.find((item) => cardSlug(item.name) === include);
    if (!card) return;
    setSeededSlug(include);
    setSelected((current) => current.some((item) => item.id === card.id) ? current : [card, ...current].slice(0, 8));
  }, [cards, include, seededSlug]);

  const filteredCards = useMemo(() => cards.filter((card) => {
    const matchesSearch = card.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (rarity === "All" || card.rarity === rarity);
  }), [cards, rarity, search]);
  const costs = useMemo(() => selected.map((card) => ({ elixirCost: card.elixir })), [selected]);
  const average = averageElixir(costs);
  const cycle = fourCardCycle(costs);

  function toggleCard(card: Card) {
    const exists = selected.some((item) => item.id === card.id || item.name === card.name);
    if (exists) {
      setSelected((items) => items.filter((item) => item.id !== card.id && item.name !== card.name));
      setNotice("");
      return;
    }
    if (selected.length >= 8) {
      setNotice("A Clash Royale deck can only contain eight cards. Remove one first.");
      return;
    }
    setSelected((items) => [...items, card]);
    setNotice("");
  }

  async function copyDeck() {
    if (selected.length !== 8) {
      setNotice("Select exactly eight cards before copying your deck.");
      return;
    }
    const ids = selected.map((card) => card.id).filter((id): id is number => typeof id === "number");
    const link = copyDeckLink(ids);
    const value = link ?? selected.map((card) => card.name).join(", ");
    try {
      await navigator.clipboard.writeText(value);
      setNotice(link ? "Official Clash Royale deck link copied." : "Deck list copied.");
    } catch {
      setNotice("Copying was blocked by your browser. Try again from a secure page.");
    }
  }

  return (
    <div className="deck-builder-stack">
      <section className="builder-workspace profile-section" aria-labelledby="builder-heading">
        <div className="section-heading discovery-heading">
          <h2 id="builder-heading">Manual builder</h2>
          <p>{source}. Choose any eight cards or load an observed deck from Discovery.</p>
        </div>
        <div className="builder-summary">
          <div><span>Cards</span><strong>{selected.length}/8</strong></div>
          <div><span>Average elixir</span><strong>{selected.length ? average.toFixed(1) : "—"}</strong></div>
          <div><span>4-card cycle</span><strong>{selected.length >= 4 ? cycle : "—"}</strong></div>
          <button type="button" onClick={() => { setSelected([]); setNotice(""); }}><Trash2 size={17} />Clear</button>
          <button type="button" className="pink-button" onClick={copyDeck}><Copy size={17} />Copy deck</button>
        </div>
        <div className="selected-deck" aria-label="Selected deck">
          {Array.from({ length: 8 }).map((_, index) => {
            const card = selected[index];
            return card ? (
              <button type="button" key={`${card.id ?? card.name}-${index}`} onClick={() => toggleCard(card)} aria-label={`Remove ${card.name}`}>
                <GameCardArt card={card} size="deck" />
              </button>
            ) : <div key={index} className="empty-card"><span>{index + 1}</span></div>;
          })}
        </div>
        {notice ? <p className="builder-notice" role="status">{notice}</p> : null}
      </section>

      {isConvexConfigured ? <DeckPerformance cards={selected} /> : null}

      <section className="card-browser profile-section" aria-labelledby="catalog-heading">
        <div className="section-heading discovery-heading">
          <h2 id="catalog-heading">Pick cards</h2>
        </div>
        <div className="browser-toolbar">
          <label className="card-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cards" aria-label="Search cards" /></label>
          <label className="rarity-filter"><span className="sr-only">Filter rarity</span><select value={rarity} onChange={(event) => setRarity(event.target.value)}><option>All</option><option>Common</option><option>Rare</option><option>Epic</option><option>Legendary</option><option>Champion</option></select></label>
          {onRefresh ? <button type="button" className="refresh-catalog" onClick={onRefresh} disabled={isRefreshing}><RefreshCcw className={isRefreshing ? "spin" : ""} size={17} />Refresh catalog</button> : null}
        </div>
        <div className="card-library">
          {filteredCards.map((card) => {
            const active = selected.some((item) => item.id === card.id || item.name === card.name);
            return (
              <button type="button" key={card.id ?? card.name} className={active ? "selected" : ""} onClick={() => toggleCard(card)} aria-pressed={active}>
                {active ? <Check className="selected-check" size={17} /> : null}
                <GameCardArt card={card} size="mini" />
                <strong>{card.name}</strong><span>{card.rarity} · {card.elixir || "?"}</span>
              </button>
            );
          })}
        </div>
        {!filteredCards.length ? <p className="empty-results">No cards match those filters.</p> : null}
      </section>
    </div>
  );
}

function DeckPerformance({ cards }: { cards: Card[] }) {
  const [mode, setMode] = useState<MetaMode>(DEFAULT_META_MODE);
  const ids = cards.map((card) => card.id).filter((id): id is number => typeof id === "number");
  const complete = ids.length === 8;
  const hash = complete ? deckHash(ids, []) : "";
  const stats = useConvexQuery(deckMetaQuery, complete ? { deckHash: hash, mode, windowDays: DEFAULT_META_WINDOW } : "skip");

  return (
    <section className="profile-section">
      <div className="section-heading discovery-heading"><h2>Exact-deck performance</h2></div>
      <div className="beta-tabs" role="group" aria-label="Battle mode">
        {META_MODES.map((item) => <button key={item} type="button" className={item === mode ? "beta-tab beta-tab-on" : "beta-tab"} onClick={() => setMode(item)}>{modeLabel(item)}</button>)}
      </div>
      {!complete ? <p className="empty-results">Pick all eight cards to look this deck up in the battle-log statistics.</p>
        : stats === undefined ? <p className="empty-results">Looking up this deck…</p>
          : stats.uses === 0 ? <p className="empty-results">This exact list has not appeared in the {modeLabel(mode)} sample from the last {DEFAULT_META_WINDOW} days. Rare does not mean bad; there is simply no observed result to report.</p>
            : <div className="beta-grid"><div className="beta-tile"><span>Games observed</span><strong>{stats.uses.toLocaleString()}</strong><small>last {stats.windowDays} days</small></div><div className="beta-tile"><span>Win rate</span><strong>{(stats.winRate * 100).toFixed(1)}%</strong><small>{stats.wins.toLocaleString()} wins</small></div><div className="beta-tile"><span>Crowns per game</span><strong>{stats.crownsPerGame.toFixed(2)}</strong><small>towers taken</small></div></div>}
      <p className="table-note">Matched on the exact eight cards. Numbers are from crawled battle logs, not the official API. <Link href="/meta">Open the meta report</Link>.</p>
    </section>
  );
}
