import Head from "next/head";
import Image from "next/image";
import { CardArt } from "@/components/portfolio/CardArt";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { Layout } from "@/components/portfolio/Layout";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { rarityImage } from "@/lib/clash/assets";
import { cardSlug, findCardBySlug, relatedCards } from "@/lib/clash/cards";
import { META_MODES, modeLabel, type MetaMode } from "@/lib/clash/battles";
import { useCardLibrary } from "@/lib/useCardCatalog";
import { useCardMeta, DEFAULT_META_MODE } from "@/lib/useCardMeta";
import type { Card } from "@/lib/mock-data";
import { errorMessage, isConvexConfigured } from "@/lib/convex";

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

  const rarityIcon = rarityImage(card.rarity);

  return (
    <Layout>
      <Head>
        <title>{`${card.name} | Clash Crown`}</title>
        <meta name="description" content={`${card.name} — ${card.rarity} card costing ${card.elixir} elixir.`} />
      </Head>
      <div className="profile-page">
        <section className="card-detail-hero">
          <CardArt src={card.image} alt={card.name} width={180} height={220} priority />
          <div>
            <span className="eyebrow">
              <Link href="/cards">← All cards</Link>
            </span>
            <h1>{card.name}</h1>
            <div className="card-detail-meta">
              <span className={`rarity-chip rarity-${card.rarity.toLowerCase()}`}>
                {rarityIcon ? <Image src={rarityIcon} alt="" width={20} height={20} /> : null}
                {card.rarity}
              </span>
              <span className="elixir-chip">
                <Image src="/images/icons/elixir.png" alt="" width={20} height={20} />
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
        </section>

        <CardStats card={card} mode={mode} onModeChange={setMode} meta={meta} />

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
 * The card's other artwork. Evolutions and Heroes are drawn from scratch rather
 * than reskinned, so the variants are worth showing rather than describing —
 * and a Hero can only be shown here, because the API reports which cards have
 * one but never which battle slot was played as one.
 */
function CardVariants({ card }: { card: Card }) {
  const variants = [
    card.evolutionImage ? { label: "Evolution", src: card.evolutionImage } : null,
    card.heroImage ? { label: "Hero", src: card.heroImage } : null
  ].filter((variant) => variant !== null);

  if (!variants.length) return null;

  return (
    <div className="card-variants">
      {variants.map((variant) => (
        <figure key={variant.label}>
          <CardArt src={variant.src} alt={`${card.name} (${variant.label})`} width={64} height={78} />
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
  meta
}: {
  card: Card;
  mode: MetaMode;
  onModeChange: (mode: MetaMode) => void;
  meta: ReturnType<typeof useCardMeta>;
}) {
  const stat = typeof card.id === "number" ? meta.byId.get(card.id) : undefined;

  return (
    <section className="profile-section">
      <div className="section-heading">
        <h2>Usage in real battles</h2>
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
          <StatTile label="Win rate" value={`${(stat.winRate * 100).toFixed(1)}%`} sub={`${stat.uses.toLocaleString()} games`} />
          <StatTile label="Most played" value={`#${stat.rank}`} sub={`of ${meta.ranked} cards seen`} />
        </div>
      ) : (
        <p className="empty-results">
          {meta.loading
            ? "Loading statistics…"
            : `${card.name} has not appeared in the ${modeLabel(mode)} battles crawled over the last ${
                meta.windowDays
              } days.`}
        </p>
      )}

      <p className="table-note">
        Counted from {Math.round(meta.decksObserved).toLocaleString()} decks in {modeLabel(mode)} over the last{" "}
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
      <CardArt src={card.image} alt={card.name} width={76} height={94} />
      <strong>{card.name}</strong>
      <span>
        {card.rarity} · {card.elixir || "?"}
      </span>
    </Link>
  );
}
