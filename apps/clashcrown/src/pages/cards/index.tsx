import Head from "@/components/Head";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import Link from "@/components/Link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Layout } from "@/components/portfolio/Layout";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { cardSlug } from "@/lib/clash/cards";
import type { Card } from "@/lib/mock-data";
import { errorMessage, isConvexConfigured } from "@/lib/convex";
import { modeLabel } from "@/lib/clash/battles";
import { useCardLibrary } from "@/lib/useCardCatalog";
import { useCardMeta, type CardMeta } from "@/lib/useCardMeta";

const RARITIES = ["All", "Common", "Rare", "Epic", "Legendary", "Champion"] as const;
const SORTS = ["Most played", "Best win rate", "Name", "Elixir"] as const;
type Sort = (typeof SORTS)[number];

export default function CardsPage() {
  if (!isConvexConfigured) {
    return (
      <Layout>
        <SetupState feature="the card library" />
      </Layout>
    );
  }
  return <CardLibrary />;
}

function CardLibrary() {
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState<(typeof RARITIES)[number]>("All");
  const [showTowerTroops, setShowTowerTroops] = useState(false);
  const [sort, setSort] = useState<Sort>("Most played");

  const meta = useCardMeta();
  const library = useCardLibrary();

  const source = showTowerTroops ? library.towerTroops : library.cards;

  const filtered = useMemo(() => {
    const matches = source.filter((card) => {
      const matchesSearch = card.name.toLowerCase().includes(search.trim().toLowerCase());
      return matchesSearch && (rarity === "All" || card.rarity === rarity);
    });

    // Cards the crawler has never seen sort last rather than sorting as zero,
    // so an unplayed card and a card with no data are not shown as the same
    // thing. The catalog's own order is the tiebreaker.
    const stat = (card: Card) => (typeof card.id === "number" ? meta.byId.get(card.id) : undefined);
    const ranked = [...matches];
    if (sort === "Most played") ranked.sort((a, b) => (stat(b)?.uses ?? -1) - (stat(a)?.uses ?? -1));
    if (sort === "Best win rate") ranked.sort((a, b) => (stat(b)?.winRate ?? -1) - (stat(a)?.winRate ?? -1));
    if (sort === "Name") ranked.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "Elixir") ranked.sort((a, b) => (a.elixir || 99) - (b.elixir || 99));
    return ranked;
  }, [source, rarity, search, sort, meta.byId]);

  const evolutions = useMemo(() => library.cards.filter((card) => card.canEvolve).length, [library.cards]);

  if (library.isLoading) {
    return (
      <Layout>
        <LoadingState label="cards" />
      </Layout>
    );
  }
  if (library.error) {
    return (
      <Layout>
        <ErrorState message={errorMessage(library.error)} />
      </Layout>
    );
  }

  return (
    <Layout>
      <Head>
        <title>Cards | Royale Stats</title>
        <meta name="description" content="Every Clash Royale card with elixir cost, rarity and Evolution availability." />
      </Head>
      <div className="decks-page">
        <section className="decks-hero">
          <span className="eyebrow">Card catalog</span>
          <h1>Cards</h1>
          <p>
            {library.cards.length} cards · {evolutions} with Evolutions · {library.towerTroops.length} Tower
            Troops
          </p>
        </section>

        <section className="card-browser profile-section">
          <div className="browser-toolbar">
            <label className="card-search">
              <Search size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search cards"
                aria-label="Search cards"
              />
            </label>
            <label className="rarity-filter">
              <span className="sr-only">Filter rarity</span>
              <select value={rarity} onChange={(event) => setRarity(event.target.value as (typeof RARITIES)[number])}>
                {RARITIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="rarity-filter">
              <span className="sr-only">Sort cards</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
                {SORTS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={showTowerTroops ? "toolbar-toggle toolbar-toggle-on" : "toolbar-toggle"}
              aria-pressed={showTowerTroops}
              onClick={() => setShowTowerTroops((v) => !v)}
            >
              Tower Troops
            </button>
          </div>

          <p className="table-note">
            {meta.loading
              ? "Loading usage statistics…"
              : meta.decksObserved
                ? `Usage is the share of ${Math.round(meta.decksObserved).toLocaleString()} decks observed in ${modeLabel(
                    meta.mode
                  )} over the last ${meta.windowDays} days of crawled battle logs. Tower Troops are not counted — they sit outside the eight-card deck.`
                : "No battle-log statistics have been collected yet, so cards are shown without usage."}
          </p>

          <div className="card-library">
            {filtered.map((card) => (
              <CardTile
                key={card.id ?? card.name}
                card={card}
                meta={typeof card.id === "number" ? meta.byId.get(card.id) : undefined}
              />
            ))}
          </div>
          {!filtered.length ? <p className="empty-results">No cards match those filters.</p> : null}
        </section>
      </div>
    </Layout>
  );
}

function CardTile({ card, meta }: { card: Card; meta?: CardMeta }) {
  return (
    <Link href={`/cards/${cardSlug(card.name)}`} className="card-tile">
      <GameCardArt card={card} size="library" showLevel={false} portrait="highest" />
      <strong>{card.name}</strong>
      <span className="card-tile-detail">
        {card.rarity}
        {card.heroImage ? " · Hero available" : card.canEvolve ? " · Evolution available" : ""}
      </span>
      {meta ? (
        <small className="card-tile-meta">
          {(meta.usageRate * 100).toFixed(1)}% used · {(meta.winRate * 100).toFixed(0)}% win
        </small>
      ) : null}
    </Link>
  );
}
