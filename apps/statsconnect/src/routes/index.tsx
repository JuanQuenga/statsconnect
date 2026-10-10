import { Link, createFileRoute } from "@tanstack/react-router";
import { useStatsConnectAuth } from "@statsconnect/auth";
import { ArrowDown, ArrowRight, Hash } from "lucide-react";
import { ConnectedGameBoard } from "@/components/connected-game-board";
import { GameChannelTile } from "@/components/lobby/GameChannelTile";
import { TileNav } from "@/components/lobby/TileNav";
import { LoadingState } from "@/components/ui-helpers";
import { games, type StatsConnectPlusOffer } from "@/lib/contracts";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "StatsConnect — your games, one home" },
      {
        name: "description",
        content: "Connect your Clash Royale and Brawl Stars player profiles, then find the stats and tools made for each game.",
      },
    ],
  }),
});

function HomePage() {
  const auth = useStatsConnectAuth();

  if (auth.isLoading) return <LoadingState className="mx-auto max-w-4xl" label="Loading StatsConnect" />;

  if (auth.profiles.length) {
    return <ConnectedGameBoard profiles={auth.profiles} />;
  }

  return (
    <LandingPage
      backendUnavailable={auth.profilesStatus === "error"}
      plusOffer={auth.plusOffer}
    />
  );
}

function LandingPage({
  backendUnavailable,
  plusOffer,
}: {
  backendUnavailable: boolean;
  plusOffer: StatsConnectPlusOffer | null;
}) {
  return (
    <div className="hub-landing">
      <section className="hub-hero" aria-labelledby="hub-title">
        <picture className="hub-hero__worlds" aria-hidden>
          <source media="(max-width: 640px)" srcSet="/games/generated/hub-worlds-2026-mobile.webp" />
          <img src="/games/generated/hub-worlds-2026-wide.webp" alt="" fetchPriority="high" />
        </picture>
        <div className="hub-hero__light" aria-hidden />
        <div className="hub-hero__intro boot-in">
          <h1 id="hub-title">Know<br />your <em>game.</em></h1>
          <p>Clash Royale. Brawl Stars.<br />Your players, battles, and progress, together.</p>
          <Link to="/connect" className="hub-primary-action">
            Find your player <span><ArrowRight aria-hidden /></span>
          </Link>
        </div>
        <a href="#games" className="hub-hero__explore">
          <ArrowDown aria-hidden /> <span>Choose your game</span>
        </a>
        <div className="hub-hero__signature" aria-hidden>
          <span>Clash<br />Royale</span><i /> <span>Brawl<br />Stars</span>
        </div>
      </section>
      {backendUnavailable ? (
        <p className="hub-config-note">Profile connections are temporarily unavailable. You can still open each game site.</p>
      ) : null}

      <section id="games" className="hub-games scroll-mt-24" aria-labelledby="hub-games-title">
        <div className="hub-section__heading">
          <h2 id="hub-games-title">Two worlds.<br /><em>Your way in.</em></h2>
          <p>Follow the climb. Revisit a close one.<br />Find the details behind your next win.</p>
        </div>
        <TileNav className="stagger hub-game-grid">
          {games.map((game) => (
            <GameChannelTile
              key={game.id}
              id={game.id}
              name={game.name}
              description={game.description}
            />
          ))}
        </TileNav>
        <div className="hub-explore">
          <h3>What you can explore</h3>
          <p>
            In <Link to="/games/$game" params={{ game: "clash-royale" }}>Clash Royale</Link>: global and regional
            leaderboards, a meta report built from real public battle logs with the sample sizes shown, deck discovery
            and war-set building, the full card library, clan search, and official news.
          </p>
          <p>
            In <Link to="/games/$game" params={{ game: "brawl-stars" }}>Brawl Stars</Link>: player and club lookup,
            official trophy leaderboards, the live map and event rotation, map-by-map meta with date windows and
            confidence floors, a progression planner for Power Points and coins, and a map assistant that suggests picks
            from live data.
          </p>
          <p>
            Everything on StatsConnect reads public game data through the official Supercell APIs and our own battle-log
            aggregation — <a href="/data-methodology">see how the data works</a>.
          </p>
        </div>
      </section>

      <section className="hub-flow" aria-labelledby="hub-flow-title">
        <div className="hub-flow__symbol" aria-hidden><Hash /></div>
        <div className="hub-flow__lead">
          <h2 id="hub-flow-title">Bring your<br /><em>player along.</em></h2>
          <p>Your tag connects the dots. Save a player profile for each game and pick up where you left off.</p>
          <Link to="/connect" className="hub-text-action">Connect a profile <ArrowRight aria-hidden /></Link>
        </div>
        <ol>
          <li><span>01</span><div><strong>Choose your game</strong><p>Clash Royale or Brawl Stars.</p></div></li>
          <li><span>02</span><div><strong>Drop in your player tag</strong><p>You’ll find it in your in-game profile.</p></div></li>
          <li><span>03</span><div><strong>Make yourself at home</strong><p>Your player is here when you come back.</p></div></li>
        </ol>
      </section>

      {plusOffer ? <PlusOffer offer={plusOffer} /> : null}
    </div>
  );
}

function PlusOffer({ offer }: { offer: StatsConnectPlusOffer }) {
  return (
    <section className="hub-plus" aria-labelledby="statsconnect-plus-title">
      <div>
        <h2 id="statsconnect-plus-title">{offer.name}, across the network.</h2>
        <p>{offer.scope}. Membership is not available yet.</p>
      </div>
      <ul>{offer.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
      <p className="hub-config-note">{offer.notice}</p>
    </section>
  );
}
