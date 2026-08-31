import Head from "@/components/Head";
import Image from "@/components/Image";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import Link from "@/components/Link";
import { useRouter } from "@/lib/router";
import { useMemo, useState } from "react";
import { Layout } from "@/components/portfolio/Layout";
import { ArenaHeroFrame } from "@/components/portfolio/ArenaRouteHero";
import { CardDeepAnalytics } from "@/components/CardDeepAnalytics";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { highestAvailableCardArt, rarityImage } from "@/lib/clash/assets";
import { cardSlug, findCardBySlug, relatedCards } from "@/lib/clash/cards";
import { META_MODES, modeLabel, type MetaMode } from "@/lib/clash/battles";
import { useCardLibrary } from "@/lib/useCardCatalog";
import { useCardMeta, DEFAULT_META_MODE } from "@/lib/useCardMeta";
import type { Card } from "@/lib/clash/domain";
import { errorMessage, isConvexConfigured } from "@/lib/convex";
import { rankLabel, selectCardMetaScope } from "@/lib/cardMetaSelectors";

type CardVariantOption = { label: "Base" | "Evolution" | "Hero"; card: Card };

export default function CardDetailPage() {
  const router = useRouter();
  const slug = typeof router.query.slug === "string" ? router.query.slug : "";

  if (!router.isReady) {
    return (
      <Layout>
        <LoadingState label="card" />
      </Layout>
    );
  }
  if (!isConvexConfigured) {
    return (
      <Layout>
        <SetupState feature="card pages" />
      </Layout>
    );
  }
  return <CardDetail slug={slug} />;
}

function CardDetail({ slug }: { slug: string }) {
  const library = useCardLibrary();

  const all = useMemo(
    () => [...library.cards, ...library.towerTroops],
    [library.cards, library.towerTroops]
  );
  const card = useMemo(() => findCardBySlug(all, slug), [all, slug]);
  const related = useMemo(() => (card ? relatedCards(library.cards, card) : []), [library.cards, card]);

  const [mode, setMode] = useState<MetaMode>(DEFAULT_META_MODE);
  const meta = useCardMeta(mode);

  if (library.isLoading) {
    return (
      <Layout>
        <LoadingState label="card" />
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
  if (!card) {
    return (
      <Layout>
        <ErrorState message={`No card called “${slug}” exists in the live catalog.`} />
      </Layout>
    );
  }

  const isTowerTroop = library.towerTroops.some((item) => item.id === card.id);
  const rarityIcon = rarityImage(card.rarity);

  return (
    <Layout>
      <Head>
        <title>{`${card.name} | StatsConnect · Clash Royale statistics`}</title>
        <meta name="description" content={`${card.name} — ${card.rarity} card costing ${card.elixir} elixir.`} />
      </Head>
      <div className="profile-page">
        <ArenaHeroFrame className="card-detail-hero">
          <GameCardArt card={card} size="deck" portrait="highest" priority />
          <div>
            <Link href="/cards" className="breadcrumb">← All cards</Link>
            <h1>{card.name}</h1>
            <div className="card-detail-meta">
              <span className={`rarity-chip rarity-${card.rarity.toLowerCase()}`}>
                {rarityIcon ? <Image src={rarityIcon} alt="" width={20} height={20} /> : null}
                {card.rarity}
              </span>
              <span className="elixir-chip">
                <Image src="/images/ui-icons/elixir.png" alt="" width={20} height={20} />
                {card.elixir || "?"} elixir
              </span>
              {card.evolutionImage ? <span className="evo-chip">Evolution available</span> : null}
              {card.heroImage ? <span className="hero-chip">Hero available</span> : null}
            </div>
            <CardVariants card={card} />
            <Link href={`/decks?include=${cardSlug(card.name)}`} className="pink-button">
              Build a deck with {card.name}
            </Link>
          </div>
        </ArenaHeroFrame>

        <CardStats
          card={card}
          mode={mode}
          onModeChange={setMode}
          meta={meta}
          isTowerTroop={isTowerTroop}
        />
        {!isTowerTroop ? <CardDeepAnalytics card={card} mode={mode} byId={library.byId} /> : null}

        <section className="profile-section">
          <h2>Similar cards</h2>
          <p className="table-note">Cards of the same rarity and a comparable elixir cost.</p>
          <div className="card-library">
            {related.map((item) => (
              <RelatedTile key={item.id ?? item.name} card={item} />
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}

/**
 * Portraits below the featured highest-tier art make the base and lower-tier
 * appearances available without duplicating the featured portrait.
 */
function CardVariants({ card }: { card: Card }) {
  const featured = highestAvailableCardArt(card);
  const variants: CardVariantOption[] = [{ label: "Base", card: { ...card, variant: undefined } }];
  if (card.evolutionImage) variants.push({ label: "Evolution", card: { ...card, variant: "Evolution" } });
  if (card.heroImage) variants.push({ label: "Hero", card: { ...card, variant: "Hero" } });
  const visibleVariants = variants.filter(
    (variant) => (variant.label === "Base" ? card.image : variant.label === "Evolution" ? card.evolutionImage : card.heroImage) !== featured
  );

  if (!visibleVariants.length) return null;

  return (
    <div className="card-variants">
      {visibleVariants.map((variant) => (
        <figure key={variant.label}>
          <GameCardArt card={variant.card} size="mini" />
          <figcaption>{variant.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * Usage and win rate for one card, from the battle-log aggregates.
 *
 * A card missing from the rankings is reported as "not seen", never as 0% —
 * the crawler covering a slice of the ladder is a sampling limit, not evidence
 * that nobody plays the card.
 */
function CardStats({
  card,
  mode,
  onModeChange,
  meta,
  isTowerTroop
}: {
  card: Card;
  mode: MetaMode;
  onModeChange: (mode: MetaMode) => void;
  meta: ReturnType<typeof useCardMeta>;
  isTowerTroop: boolean;
}) {
  const scope = selectCardMetaScope({
    cardId: typeof card.id === "number" ? card.id : undefined,
    isTowerTroop,
    regular: { byId: meta.byId, decksObserved: meta.decksObserved, ranked: meta.ranked, loading: meta.loading },
    tower: { byId: meta.towerById, decksObserved: meta.towerDecksObserved, loading: meta.towerLoading }
  });
  const stat = scope.record;

  return (
    <section className="profile-section">
      <div className="section-heading">
        <h2>{isTowerTroop ? "Tower Troop usage in real battles" : "Usage in real battles"}</h2>
      </div>
      <div className="beta-tabs" role="group" aria-label="Battle mode">
        {META_MODES.map((item) => (
          <button
            key={item}
            type="button"
            className={item === mode ? "beta-tab beta-tab-on" : "beta-tab"}
            onClick={() => onModeChange(item)}
          >
            {modeLabel(item)}
          </button>
        ))}
      </div>

      {stat ? (
        <div className="beta-grid">
          <StatTile label="Usage" value={`${(stat.usageRate * 100).toFixed(1)}%`} sub="of decks observed" />
          <StatTile label="Win rate" value={`${(stat.winRate * 100).toFixed(1)}%`} sub={`${stat.uses.toLocaleString()} ${scope.countLabel}`} />
          <StatTile label="Most played" value={rankLabel(stat.rank)} sub={stat.rank === null ? "Rank unavailable" : `of ${scope.ranked} ${isTowerTroop ? "Tower Troops" : "cards"} seen`} />
        </div>
      ) : (
        <p className="empty-results">
          {scope.loading
            ? "Loading statistics…"
            : `${card.name} has not appeared in the ${modeLabel(mode)} battles crawled over the last ${
                meta.windowDays
              } days.`}
        </p>
      )}

      <p className="table-note">
        Counted from {Math.round(scope.decksObserved).toLocaleString()} decks in {modeLabel(mode)} over the last{" "}
        {meta.windowDays} days. The official API publishes no card statistics, so these come from crawled battle logs —
        a sample of the ladder, not all of it. <Link href="/meta">See the full meta report</Link>.
      </p>
    </section>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="beta-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function RelatedTile({ card }: { card: Card }) {
  return (
    <Link href={`/cards/${cardSlug(card.name)}`} className="card-tile">
      <GameCardArt card={card} size="mini" portrait="highest" />
      <strong>{card.name}</strong>
      <span>
        {card.rarity} · {card.elixir || "?"}
      </span>
    </Link>
  );
}
