import Head from "@/components/Head";
import { CardArt } from "@/components/portfolio/CardArt";
import Link from "@/components/Link";
import { Check, Copy, LoaderCircle, RefreshCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { Layout } from "@/components/portfolio/Layout";
import { cards as localCards, type Card } from "@/lib/mock-data";
import { mapCardsPayload } from "@/lib/clash/mappers";
import { averageElixir, copyDeckLink, fourCardCycle } from "@/lib/clash/assets";
import { cardSlug } from "@/lib/clash/cards";
import { deckHash, META_MODES, modeLabel, type MetaMode } from "@/lib/clash/battles";
import { DEFAULT_META_MODE, DEFAULT_META_WINDOW } from "@/lib/useCardMeta";
import { cardsAction, deckMetaQuery, errorMessage, isConvexConfigured } from "@/lib/convex";

/** `/decks?include=<card-slug>` seeds the builder with that card, linked from card detail pages. */
function useIncludedSlug() {
  const router = useRouter();
  return typeof router.query.include === "string" ? router.query.include : undefined;
}

export default function DecksPage() {
  return isConvexConfigured ? <LiveDeckBuilder /> : <DeckBuilder cards={localCards} source="Local catalog" />;
}

function LiveDeckBuilder() {
  const getCards = useAction(cardsAction);
  const [refreshKey, setRefreshKey] = useState(0);
  const query = useQuery({
    queryKey: ["cards", refreshKey],
    queryFn: async () => mapCardsPayload(await getCards({ force: refreshKey > 0 })),
    placeholderData: (previous) => previous,
    retry: false
  });

  if (query.isLoading) {
    return <Layout><div className="data-state"><LoaderCircle className="state-spinner" size={38} /><h1>Loading the card library</h1><p>Syncing cards from the Clash Royale API.</p></div></Layout>;
  }

  if (query.error || !query.data) {
    return <DeckBuilder cards={localCards} source={`Local fallback · ${errorMessage(query.error)}`} />;
  }

  return <DeckBuilder cards={query.data} source="Live Clash Royale card catalog" onRefresh={() => setRefreshKey((value) => value + 1)} isRefreshing={query.isFetching} />;
}

/**
 * How the deck on the workbench has actually performed.
 *
 * Looked up by deck hash, so it prices any eight cards rather than only the
 * decks that made the top-100 board. Evolutions are a different hash upstream;
 * this asks for the un-evolved variant, which is what the builder describes.
 */
function DeckPerformance({ cards }: { cards: Card[] }) {
  const [mode, setMode] = useState<MetaMode>(DEFAULT_META_MODE);

  const ids = cards.map((card) => card.id).filter((id): id is number => typeof id === "number");
  const complete = ids.length === 8;
  const hash = complete ? deckHash(ids, []) : "";

  const stats = useConvexQuery(
    deckMetaQuery,
    complete ? { deckHash: hash, mode, windowDays: DEFAULT_META_WINDOW } : "skip"
  );

  return (
    <section className="profile-section">
      <div className="section-heading">
        <h2>How this deck performs</h2>
      </div>
      <div className="beta-tabs" role="group" aria-label="Battle mode">
        {META_MODES.map((item) => (
          <button
            key={item}
            type="button"
            className={item === mode ? "beta-tab beta-tab-on" : "beta-tab"}
            onClick={() => setMode(item)}
          >
            {modeLabel(item)}
          </button>
        ))}
      </div>

      {!complete ? (
        <p className="empty-results">Pick all eight cards to look this deck up in the battle-log statistics.</p>
      ) : stats === undefined ? (
        <p className="empty-results">Looking up this deck…</p>
      ) : stats.uses === 0 ? (
        <p className="empty-results">
          This exact eight-card list has not appeared in the {modeLabel(mode)} battles crawled over the last{" "}
          {DEFAULT_META_WINDOW} days. That makes it rare in the sample, not bad — swap a card to compare against a
          deck that has been seen.
        </p>
      ) : (
        <div className="beta-grid">
          <div className="beta-tile">
            <span>Games observed</span>
            <strong>{stats.uses.toLocaleString()}</strong>
            <small>last {stats.windowDays} days</small>
          </div>
          <div className="beta-tile">
            <span>Win rate</span>
            <strong>{(stats.winRate * 100).toFixed(1)}%</strong>
            <small>{stats.wins.toLocaleString()} wins</small>
          </div>
          <div className="beta-tile">
            <span>Crowns per game</span>
            <strong>{stats.crownsPerGame.toFixed(2)}</strong>
            <small>towers taken</small>
          </div>
        </div>
      )}

      <p className="table-note">
        Matched on the exact eight cards, ignoring Evolutions and Tower Troops. Numbers come from crawled battle logs,
        not from the official API. <Link href="/meta">See the decks that top the meta</Link>.
      </p>
    </section>
  );
}

function DeckBuilder({ cards, source, onRefresh, isRefreshing = false }: { cards: Card[]; source: string; onRefresh?: () => void; isRefreshing?: boolean }) {
  const include = useIncludedSlug();
  // Empty, not the first eight cards of the catalog: that seeded a deck nobody
  // chose and the panel below then reported it as never seen in the meta — the
  // first thing a visitor read about a deck they had not built.
  const [selected, setSelected] = useState<Card[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState("All");
  const [notice, setNotice] = useState("");

  // The query string only resolves after hydration, so seed once the slug is known.
  useEffect(() => {
    if (seeded || !include) return;
    const card = cards.find((item) => cardSlug(item.name) === include);
    if (!card) return;
    setSeeded(true);
    setSelected([card]);
  }, [cards, include, seeded]);

  const filteredCards = useMemo(() => cards.filter((card) => {
    const matchesSearch = card.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (rarity === "All" || card.rarity === rarity);
  }), [cards, rarity, search]);
  const costs = useMemo(() => selected.map((card) => ({ elixirCost: card.elixir })), [selected]);
  const average = averageElixir(costs);
  const cycle = fourCardCycle(costs);

  function toggleCard(card: Card) {
    const exists = selected.some((item) => item.name === card.name);
    if (exists) {
      setSelected((items) => items.filter((item) => item.name !== card.name));
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
    <Layout>
      <Head><title>Deck Builder | Clash Crown</title><meta name="description" content="Build an eight-card Clash Royale deck from the live card catalog." /></Head>
      <div className="decks-page builder-page">
        <section className="decks-hero">
          <span className="eyebrow">{source}</span>
          <h1>Deck Builder</h1>
          <p>Choose eight cards, balance your elixir cost, and copy the finished deck into Clash Royale.</p>
        </section>

        <section className="builder-workspace profile-section">
          <div className="builder-summary">
            <div><span>Cards</span><strong>{selected.length}/8</strong></div>
            <div><span>Average elixir</span><strong>{average.toFixed(1)}</strong></div>
            <div><span>4-card cycle</span><strong>{cycle}</strong></div>
            <button type="button" onClick={() => setSelected([])}><Trash2 size={17} />Clear</button>
            <button type="button" className="pink-button" onClick={copyDeck}><Copy size={17} />Copy deck</button>
          </div>
          <div className="selected-deck" aria-label="Selected deck">
            {Array.from({ length: 8 }).map((_, index) => {
              const card = selected[index];
              return card ? (
                <button type="button" key={card.name} onClick={() => toggleCard(card)} aria-label={`Remove ${card.name}`}>
                  <CardArt src={card.image} alt={card.name} width={82} height={100} /><span>{card.elixir}</span>
                </button>
              ) : <div key={index} className="empty-card"><span>{index + 1}</span></div>;
            })}
          </div>
          {notice ? <p className="builder-notice" role="status">{notice}</p> : null}
        </section>

        {isConvexConfigured ? <DeckPerformance cards={selected} /> : null}

        <section className="card-browser profile-section">
          <div className="browser-toolbar">
            <label className="card-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cards" aria-label="Search cards" /></label>
            <label className="rarity-filter"><span className="sr-only">Filter rarity</span><select value={rarity} onChange={(event) => setRarity(event.target.value)}><option>All</option><option>Common</option><option>Rare</option><option>Epic</option><option>Legendary</option><option>Champion</option></select></label>
            {onRefresh ? <button type="button" className="refresh-catalog" onClick={onRefresh} disabled={isRefreshing}><RefreshCcw className={isRefreshing ? "spin" : ""} size={17} />Refresh catalog</button> : null}
          </div>
          <div className="card-library">
            {filteredCards.map((card) => {
              const active = selected.some((item) => item.name === card.name);
              return (
                <button type="button" key={card.name} className={active ? "selected" : ""} onClick={() => toggleCard(card)} aria-pressed={active}>
                  {active ? <Check className="selected-check" size={17} /> : null}
                  <CardArt src={card.image} alt={card.name} width={76} height={94} />
                  <strong>{card.name}</strong><span>{card.rarity} · {card.elixir || "?"}</span>
                </button>
              );
            })}
          </div>
          {!filteredCards.length ? <p className="empty-results">No cards match those filters.</p> : null}
        </section>
      </div>
    </Layout>
  );
}
