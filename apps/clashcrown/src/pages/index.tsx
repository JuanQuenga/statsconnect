import Image from "@/components/Image";
import { DeckCardGrid } from "@/components/portfolio/DeckCardGrid";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import Link from "@/components/Link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdSenseUnit } from "@statsconnect/monetization";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { Layout } from "@/components/portfolio/Layout";
import { ProfileSearch } from "@/components/portfolio/ProfileSearch";
import { PersonalDashboard } from "@/components/personalization/PersonalDashboard";
import { usePersonalization } from "@/components/personalization/PersonalizationProvider";
import { modeLabel, type MetaMode } from "@/lib/clash/battles";
import { cardSlug } from "@/lib/clash/cards";
import { averageElixir, copyDeckLink, UNKNOWN_CARD_IMAGE } from "@/lib/clash/assets";
import { useCardLibrary } from "@/lib/useCardCatalog";
import { errorMessage, globalTournamentsAction, isConvexConfigured, topCardsQuery, topDecksQuery } from "@/lib/convex";
import type { Card } from "@/lib/clash/domain";
import type { ApiTournament } from "@/lib/clash/types";
import { Button } from "@/components/ui/button";
import { ArenaHeroFrame } from "@/components/portfolio/ArenaRouteHero";
import styles from "./index.module.css";

function unknownCard(id: number): Card {
  return { id, name: "Unknown Card", elixir: 0, rarity: "Common", image: UNKNOWN_CARD_IMAGE };
}

export default function HomePage() {
  const hasSavedProfiles = usePersonalization().profiles.length > 0;

  return (
    <Layout variant="home">
      <ArenaHeroFrame className={`royale-hero ${styles.hero}`}>
        <div className="royale-hero-inner">
          <div className="royale-hero-copy">
            <h1>Clash Royale<br />stats</h1>
            <p className="royale-hero-sub">
              Live meta decks, card rankings, and every player&apos;s battle history — look up any tag.
            </p>
            <ProfileSearch />
            <PlayerTagGuide />
          </div>
        </div>
        <div className={styles.heroDeck} aria-hidden="true">
          <Image src="/images/cards/mega-knight.png" alt="" width={150} height={180} />
          <Image src="/images/cards/little-prince.png" alt="" width={150} height={180} />
          <Image src="/images/cards/rune-giant.png" alt="" width={150} height={180} />
          <Image src="/images/cards/barbarian-barrel-hero.png" alt="" width={150} height={180} />
        </div>
      </ArenaHeroFrame>

      {/* Returning players see their own profiles first; for everyone else an
          empty "saved profiles" panel is not the thing to lead with. */}
      {hasSavedProfiles ? <PersonalDashboard /> : null}

      {isConvexConfigured ? <MetaTopDeck /> : <UnavailableMetaSection title="Top observed deck" />}

      <div className="cr-home-split">
        {isConvexConfigured ? <MetaPopularCards /> : <UnavailableMetaSection title="Most played card" href="/cards" />}
        {isConvexConfigured ? <LiveEventLab /> : <UnavailableMetaSection title="Live tournaments" href="/tournaments" />}
      </div>

      <ExploreTiles />

      <AdSenseUnit
        clientId={import.meta.env.VITE_ADSENSE_CLIENT_ID}
        slotId={import.meta.env.VITE_ADSENSE_CLASH_HOME_SLOT}
        serveAds={import.meta.env.PROD}
        className="home-ad-unit"
      />

      {hasSavedProfiles ? null : <PersonalDashboard />}
    </Layout>
  );
}

const EXPLORE_TILES = [
  { href: "/cards", title: "Card library", detail: "Every card with stats, levels, and win rates.", art: "/images/art/giant.png" },
  { href: "/decks", title: "Deck builder", detail: "Build a deck or start from a proven one.", art: "/images/art/prince.png" },
  { href: "/leaderboards", title: "Leaderboards", detail: "Top players and clans by region.", art: "/images/art/hog-rider.png" },
  { href: "/clans/search", title: "Clans", detail: "Find a clan and check its war record.", art: "/images/art/the-bowler.png" },
];

function ExploreTiles() {
  return (
    <nav className="cr-explore" aria-label="Explore Clash Royale stats">
      {EXPLORE_TILES.map((tile) => (
        <Link key={tile.href} href={tile.href}>
          <img src={tile.art} alt="" loading="lazy" />
          <strong>{tile.title}</strong>
          <span>{tile.detail}</span>
        </Link>
      ))}
    </nav>
  );
}

function PlayerTagGuide() {
  return (
    <details className={styles.tagGuide}>
      <summary>Where is my player tag?</summary>
      <p>Open your in-game profile and copy the tag beneath your name. It starts with #.</p>
    </details>
  );
}

// --- Live meta sections ---------------------------------------------------

/**
 * The home page statistics read the same aggregates as `/meta`. Components
 * using Convex hooks are mounted only when the app has a configured provider.
 */

/** Modes deep enough in the crawl to headline the home page. */
const HOME_MODES: MetaMode[] = ["pathOfLegends", "ladder", "clanWar"];
const HOME_WINDOW_DAYS = 7;

function MetaTopDeck() {
  const [mode, setMode] = useState<MetaMode>("pathOfLegends");
  const [index, setIndex] = useState(0);
  const library = useCardLibrary();
  const payload = useConvexQuery(topDecksQuery, { mode, windowDays: HOME_WINDOW_DAYS, limit: 10 });

  const decks = payload?.decks ?? [];
  const deck = decks[Math.min(index, Math.max(decks.length - 1, 0))];
  const cards = useMemo(
    () => (deck?.cardIds ?? []).map((id) => library.byId.get(id) ?? unknownCard(id)),
    [deck?.cardIds, library.byId]
  );

  const elixir = averageElixir(cards.map((card) => ({ elixirCost: card.elixir })));
  const link = deck ? copyDeckLink(deck.cardIds) : undefined;

  function step(offset: number) {
    if (!decks.length) return;
    setIndex((current) => (current + offset + decks.length) % decks.length);
  }

  return (
    <section className="deck-day page-band">
      <div className="section-title-row">
        <h2>Top observed deck</h2>
        <Link href="/meta" className="primary-button">Full meta</Link>
      </div>
      <div className="archetype-tabs cr-tabs" aria-label="Battle mode">
        {HOME_MODES.map((item) => (
          <Button
            key={item}
            type="button"
            variant={mode === item ? "default" : "secondary"}
            size="sm"
            className={mode === item ? "active" : ""}
            aria-pressed={mode === item}
            onClick={() => {
              setMode(item);
              setIndex(0);
            }}
          >
            {modeLabel(item)}
          </Button>
        ))}
      </div>

      {payload === undefined || library.isLoading ? (
        <HomeDataMessage loading message="Loading the latest deck statistics and card catalog…" />
      ) : library.error ? (
        <p className="table-note" role="status">{errorMessage(library.error)}</p>
      ) : !deck ? (
        <p className="table-note">
          No {modeLabel(mode)} decks have been observed often enough in the last {HOME_WINDOW_DAYS} days to rank.
        </p>
      ) : (
        <>
          <div className={styles.deckPresentation}>
            <div className={styles.deckTools}>
              <div className={styles.elixir}>
                <Image src="/images/icons/elixir.png" alt="" width={26} height={26} />
                <strong>
                  {elixir ? elixir.toFixed(1) : "—"}<span>Avg. elixir</span>
                </strong>
              </div>
              {link ? (
                <a className="copy-deck" href={link} target="_blank" rel="noopener noreferrer">
                  <Image src="/images/icons/copy.png" alt="" width={26} height={28} />
                  Copy Deck
                </a>
              ) : null}
            </div>
            <DeckCardGrid cards={cards} evolutionIds={deck.evolutionIds} label="Top observed deck" className={styles.deckCards} />
          </div>
          <div className="deck-demo-copy">
            <strong>#{deck.rank} in {modeLabel(mode)}</strong>
            <span>
              Last {HOME_WINDOW_DAYS} days
            </span>
          </div>
          <dl className={styles.deckMetrics}>
            <div><dt>Deck win rate</dt><dd>{(deck.winRate * 100).toFixed(1)}%</dd></div>
            <div><dt>Usage rate</dt><dd>{(deck.usageRate * 100).toFixed(1)}%</dd></div>
            <div><dt>Games observed</dt><dd>{deck.uses.toLocaleString()}</dd></div>
          </dl>
          <Pager onPrevious={() => step(-1)} onNext={() => step(1)} />
        </>
      )}
    </section>
  );
}

function MetaPopularCards() {
  const library = useCardLibrary();
  const payload = useConvexQuery(topCardsQuery, {
    mode: "pathOfLegends",
    windowDays: HOME_WINDOW_DAYS,
    limit: 5
  });

  const top = payload?.cards[0];
  const card = top ? library.byId.get(top.cardId) : undefined;
  const runners = (payload?.cards.slice(1) ?? [])
    .map((entry) => library.byId.get(entry.cardId))
    .filter((entry): entry is Card => entry !== undefined);

  return (
    <section className="popular page-band">
      <div className="section-title-row">
        <h2>Most played card</h2>
        <Link href="/cards" className="primary-button">All cards</Link>
      </div>
      {payload === undefined || library.isLoading ? (
        <HomeDataMessage loading message="Loading Path of Legends card statistics…" />
      ) : library.error ? (
        <HomeDataMessage message={errorMessage(library.error)} />
      ) : !top ? (
        <HomeDataMessage message={`No Path of Legends card observations are available for the last ${HOME_WINDOW_DAYS} days.`} />
      ) : !card ? (
        <HomeDataMessage message="The leading card is not yet available in the live card catalog." />
      ) : (
        <div>
          <div className="cr-top-card">
            <Link href={`/cards/${cardSlug(card.name)}`}>
              <GameCardArt card={card} size="library" portrait="highest" />
              <strong>{card.name}</strong>
            </Link>
            <dl>
              <div><dt>Usage</dt><dd>{(top.usageRate * 100).toFixed(1)}%<small>of decks</small></dd></div>
              <div><dt>Win rate</dt><dd>{(top.winRate * 100).toFixed(1)}%<small>{top.uses.toLocaleString()} games</small></dd></div>
            </dl>
          </div>
          {runners.length ? (
            <div className="popular-runners" aria-label="Next most played cards">
              {runners.map((runner) => (
                <Link key={runner.id} href={`/cards/${cardSlug(runner.name)}`} title={runner.name}>
                  <GameCardArt card={runner} size="mini" portrait="highest" showLevel={false} />
                </Link>
              ))}
            </div>
          ) : null}
          <p className="table-note">
            Path of Legends, last {HOME_WINDOW_DAYS} days · {Math.round(payload.decksObserved).toLocaleString()} decks observed.
          </p>
        </div>
      )}
    </section>
  );
}

function LiveEventLab() {
  const getGlobalTournaments = useAction(globalTournamentsAction);
  const query = useQuery<ApiTournament[]>({
    queryKey: ["global-tournaments"],
    queryFn: async () => (await getGlobalTournaments({})).tournaments.data.items ?? [],
    staleTime: 10 * 60 * 1000,
    retry: false
  });
  const tournaments = query.data?.slice(0, 3) ?? [];

  return (
    <section className="event-lab page-band">
      <div className="section-title-row">
        <h2>Live tournaments</h2>
        <Link href="/tournaments" className="primary-button">Tournaments</Link>
      </div>
      {query.isLoading ? (
        <HomeDataMessage loading message="Loading current Global Tournaments…" />
      ) : query.error ? (
        <HomeDataMessage message={errorMessage(query.error)} />
      ) : !tournaments.length ? (
        <div className="cr-empty">
          <img src="/images/icons/battle-tournament.png" alt="" width={76} height={76} />
          <div>
            <strong>No Global Tournament right now</strong>
            <p>Global Tournaments run during special events. Player-made tournaments are open all the time.</p>
            <Link href="/tournaments" className="primary-button cr-button-blue">Find a tournament</Link>
          </div>
        </div>
      ) : (
        <div className="event-grid">
          {tournaments.map((tournament) => (
            <article key={tournament.tag} className="event-card event-card-live">
              <span>{humanize(tournament.status)}</span>
              <strong>{tournament.name ?? tournament.tag}</strong>
              <small>
                {typeof tournament.capacity === "number" && typeof tournament.maxCapacity === "number"
                  ? `${tournament.capacity.toLocaleString()} of ${tournament.maxCapacity.toLocaleString()} players`
                  : "Player count unavailable"}
              </small>
              <dl>
                <div><dt>Level cap</dt><dd>{tournament.levelCap ?? "—"}</dd></div>
                <div><dt>First prize</dt><dd>{tournament.firstPlaceCardPrize ? `${tournament.firstPlaceCardPrize.toLocaleString()} cards` : "—"}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
      {tournaments.length ? <p className="table-note">Current Global Tournaments published by Clash Royale.</p> : null}
    </section>
  );
}

function humanize(value?: string) {
  if (!value) return "Status unavailable";
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function UnavailableMetaSection({ title, href = "/meta" }: { title: string; href?: string }) {
  return (
    <section className="home-data-state page-band">
      <div>
        <h2>{title}</h2>
        <p>StatsConnect cannot load this live section until its Clash Royale data service is configured.</p>
      </div>
      <Link href={href} className="primary-button">Open details</Link>
    </section>
  );
}

function HomeDataMessage({ message, loading = false, children }: { message: string; loading?: boolean; children?: ReactNode }) {
  return <p className="home-data-message" role="status" data-state={loading ? "loading" : undefined}>{message}{children}</p>;
}

function Pager({ onPrevious, onNext }: { onPrevious?: () => void; onNext?: () => void }) {
  if (!onPrevious && !onNext) return null;
  return (
    <div className="pager">
      <Button variant="secondary" size="icon" type="button" aria-label="Previous" onClick={onPrevious}><ChevronLeft size={18} /></Button>
      <Button variant="secondary" size="icon" type="button" aria-label="Next" onClick={onNext}><ChevronRight size={18} /></Button>
    </div>
  );
}
