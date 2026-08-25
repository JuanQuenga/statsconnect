import Image from "@/components/Image";
import { CardArt } from "@/components/portfolio/CardArt";
import Link from "@/components/Link";
import { ArrowRight, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { Layout } from "@/components/portfolio/Layout";
import { ProfileSearch } from "@/components/portfolio/ProfileSearch";
import { PersonalDashboard } from "@/components/personalization/PersonalDashboard";
import { modeLabel, type MetaMode } from "@/lib/clash/battles";
import { cardSlug } from "@/lib/clash/cards";
import { averageElixir, copyDeckLink, highestAvailableCardArt } from "@/lib/clash/assets";
import { useCardLibrary } from "@/lib/useCardCatalog";
import { errorMessage, globalTournamentsAction, isConvexConfigured, topCardsQuery, topDecksQuery } from "@/lib/convex";
import type { Card } from "@/lib/clash/domain";
import type { ApiTournament } from "@/lib/clash/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArenaHeroFrame } from "@/components/portfolio/ArenaRouteHero";

export default function HomePage() {
  return (
    <Layout variant="home">
      <ArenaHeroFrame className="royale-hero">
        <div className="royale-hero-inner">
          <div className="royale-hero-copy">
            <h1>
              <span className="hero-title-line">Look up a player.</span>
              <span className="hero-title-line hero-title-accent">Review recent battles.</span>
            </h1>
            <p className="royale-hero-description">
              Search by player name or tag to check available battle history,
              chest cycles, and deck performance. You can also switch the search to clans.
            </p>
            <ProfileSearch />
            <div className="royale-hero-actions">
              <Link href="/meta" className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
                Explore the meta <ArrowRight />
              </Link>
              <Link href="/decks" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}>
                <BarChart3 /> Deck tools
              </Link>
            </div>
          </div>

          <PlayerTagGuide />
        </div>
      </ArenaHeroFrame>

      <PersonalDashboard />

      <PlayerSpecificDataState
        title="Recent battles"
        copy="Battle history belongs to a player profile. Search a tag to see current opponents, decks, crown scores, and trophy changes."
        linkLabel="Find a player"
      />

      {isConvexConfigured ? <MetaTopDeck /> : <UnavailableMetaSection title="Top observed deck" />}

      {isConvexConfigured ? <LiveEventLab /> : <UnavailableMetaSection title="Live tournaments" href="/tournaments" />}

      <PlayerSpecificDataState
        title="Upcoming chests"
        copy="Chest cycles are player-specific. Open a player profile and choose Upcoming Chests to see the current sequence."
        linkLabel="Find a player"
      />

      {isConvexConfigured ? <MetaPopularCards /> : <UnavailableMetaSection title="Most played card" href="/cards" />}
    </Layout>
  );
}

function PlayerTagGuide() {
  return (
    <aside className="royale-hero-showcase player-tag-guide" aria-labelledby="player-tag-guide-title">
      <div className="player-tag-guide-heading">
        <h2 id="player-tag-guide-title">How to get your player tag</h2>
      </div>

      <div className="player-tag-guide-screen">
        <picture>
          <source media="(prefers-reduced-motion: reduce)" srcSet={`${import.meta.env.BASE_URL}images/animated/hashtag-static.png`} />
          <Image
            src="/images/animated/hashtag.gif"
            alt="Animation showing where to open a Clash Royale profile and copy its player tag"
            width={720}
            height={720}
            priority
          />
        </picture>
      </div>
    </aside>
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
    () => (deck?.cardIds ?? []).flatMap((id) => {
      const card = library.byId.get(id);
      return card ? [card] : [];
    }),
    [deck?.cardIds, library.byId]
  );
  const hasCompleteDeck = !deck || cards.length === deck.cardIds.length;

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
        <Link href="/meta" className="pink-button">See the full meta</Link>
      </div>
      <div className="archetype-tabs" aria-label="Battle mode">
        {HOME_MODES.map((item) => (
          <Button
            key={item}
            type="button"
            variant={mode === item ? "default" : "secondary"}
            size="sm"
            className={mode === item ? "active" : ""}
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
        <p className="table-note" role="status">Loading the latest deck statistics and card catalog…</p>
      ) : library.error ? (
        <p className="table-note" role="status">{errorMessage(library.error)}</p>
      ) : !deck ? (
        <p className="table-note">
          No {modeLabel(mode)} decks have been observed often enough in the last {HOME_WINDOW_DAYS} days to rank.
        </p>
      ) : !hasCompleteDeck ? (
        <p className="table-note" role="status">This ranked deck includes a card that is not yet available in the live catalog.</p>
      ) : (
        <>
          <div className="deck-row">
            <div className="elixir-pill">
              <Image src="/images/icons/elixir.png" alt="" width={26} height={26} />
              <strong>
                {elixir ? elixir.toFixed(1) : "—"} elixir<span>average cost</span>
              </strong>
            </div>
            <DeckStrip cards={cards} />
            {link ? (
              <a className="copy-deck" href={link} target="_blank" rel="noopener noreferrer">
                <Image src="/images/icons/copy.png" alt="" width={26} height={28} />
                Copy Deck
              </a>
            ) : null}
          </div>
          <div className="deck-demo-copy">
            <strong>#{deck.rank} in {modeLabel(mode)}</strong>
            <span>
              Seen {deck.uses.toLocaleString()} times in the last {HOME_WINDOW_DAYS} days of crawled battle logs.
            </span>
          </div>
          <div className="deck-metrics">
            <strong>{(deck.winRate * 100).toFixed(1)}%<span>deck win rate</span></strong>
            <strong>{(deck.usageRate * 100).toFixed(1)}%<span>usage rate</span></strong>
            <strong>{deck.uses.toLocaleString()}<span>games observed</span></strong>
          </div>
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
    limit: 1
  });

  const top = payload?.cards[0];
  const card = top ? library.byId.get(top.cardId) : undefined;

  return (
    <section className="popular page-band">
      <div className="section-title-row">
        <h2>Most played card</h2>
        <Link href="/meta" className="pink-button">Card and deck rankings</Link>
      </div>
      {payload === undefined || library.isLoading ? (
        <HomeDataMessage message="Loading Path of Legends card statistics…" />
      ) : library.error ? (
        <HomeDataMessage message={errorMessage(library.error)} />
      ) : !top ? (
        <HomeDataMessage message={`No Path of Legends card observations are available for the last ${HOME_WINDOW_DAYS} days.`} />
      ) : !card ? (
        <HomeDataMessage message="The leading card is not yet available in the live card catalog." />
      ) : (
        <>
          <div className="popular-grid">
            <MetaMetric
              color="pink"
              label="Win rate"
              value={`${(top.winRate * 100).toFixed(1)}%`}
              detail={`${top.uses.toLocaleString()} games observed`}
            />
            <Link href={`/cards/${cardSlug(card.name)}`} className="popular-card-center">
              <CardArt
                src={highestAvailableCardArt(card)}
                alt={card.name}
                width={96}
                height={120}
              />
              <strong>{card.name}</strong>
            </Link>
            <MetaMetric
              color="blue"
              label="Usage"
              value={`${(top.usageRate * 100).toFixed(1)}%`}
              detail="of observed decks"
            />
          </div>
          <p className="table-note">
            From {Math.round(payload.decksObserved).toLocaleString()} decks observed in Path of Legends over the last {HOME_WINDOW_DAYS} days. These rates are aggregated from crawled battle logs.
          </p>
        </>
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
        <Link href="/tournaments" className="pink-button">View tournaments</Link>
      </div>
      {query.isLoading ? (
        <HomeDataMessage message="Loading current Global Tournaments…" />
      ) : query.error ? (
        <HomeDataMessage message={errorMessage(query.error)} />
      ) : !tournaments.length ? (
        <HomeDataMessage message="Clash Royale reports no Global Tournament running right now. Community tournaments remain available from the tournament search." />
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

function PlayerSpecificDataState({ title, copy, linkLabel }: { title: string; copy: string; linkLabel: string }) {
  return (
    <section className="home-data-state page-band">
      <div>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      <Link href="/players" className="pink-button">{linkLabel}</Link>
    </section>
  );
}

function UnavailableMetaSection({ title, href = "/meta" }: { title: string; href?: string }) {
  return (
    <section className="home-data-state page-band">
      <div>
        <h2>{title}</h2>
        <p>StatsConnect cannot load this live section until its Clash Royale data service is configured.</p>
      </div>
      <Link href={href} className="pink-button">Open details</Link>
    </section>
  );
}

function HomeDataMessage({ message }: { message: string }) {
  return <p className="home-data-message" role="status">{message}</p>;
}

function DeckStrip({ cards }: { cards: Card[] }) {
  return (
    <div className="deck-strip">
      {cards.map((card, index) => (
        <CardArt key={`${card.name}-${index}`} src={card.image} alt={card.name} width={54} height={66} />
      ))}
    </div>
  );
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

function MetaMetric({ color, label, value, detail }: { color: "pink" | "blue"; label: string; value: string; detail: string }) {
  return (
    <div className={`spark spark-${color} meta-metric`}>
      <div className="spark-label">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}
