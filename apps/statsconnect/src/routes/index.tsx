import { Link, createFileRoute } from "@tanstack/react-router";
import { useStatsConnectAuth } from "@statsconnect/auth";
import { ArrowDownRight, ArrowRight } from "lucide-react";
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
        <div className="hub-hero__intro boot-in">
          <h1 id="hub-title">
            Your games.
            <span>One place to start.</span>
          </h1>
          <div className="hub-hero__aside">
            <p>
              Save your Clash Royale and Brawl Stars player tags. Get straight to
              the battles, rankings, and player details you came for.
            </p>
            <div className="hub-hero__actions">
              <Link to="/connect" className="hub-primary-action">
                Connect a profile <ArrowRight aria-hidden />
              </Link>
              <a href="#games" className="hub-text-action">
                Explore the games <ArrowDownRight aria-hidden />
              </a>
            </div>
          </div>
        </div>

        <div className="hub-hero__poster boot-in" role="img" aria-label="Clash Royale King and Hog Rider face Brawl Stars Shelly, Colt, and Spike across two arenas">
          <picture>
            <source media="(max-width: 640px)" srcSet="/games/generated/hub-worlds-mobile-v2.webp" />
            <img
              src="/games/generated/hub-worlds-wide-v2.webp"
              alt=""
              fetchPriority="high"
            />
          </picture>
          <div className="hub-hero__poster-names" aria-hidden>
            <span>Clash Royale</span>
            <span>Brawl Stars</span>
          </div>
        </div>
        {backendUnavailable ? (
          <p className="hub-config-note">Profile connections are temporarily unavailable. You can still open each game site.</p>
        ) : null}
      </section>

      <section id="games" className="hub-section hub-games scroll-mt-28" aria-labelledby="hub-games-title">
        <div className="hub-section__heading">
          <h2 id="hub-games-title">Pick your arena.</h2>
          <p>Each game has its own stats, tools, and ways to get ahead. Start with the one you play.</p>
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
      </section>

      <section className="hub-flow" aria-labelledby="hub-flow-title">
        <div className="hub-flow__lead">
          <h2 id="hub-flow-title">Your tag is the ticket in.</h2>
          <p>Connect once for each game. Your player profile is ready the next time you visit.</p>
        </div>
        <ol>
          <li><span>01</span><strong>Choose a game</strong><p>Pick Clash Royale or Brawl Stars.</p></li>
          <li><span>02</span><strong>Enter your tag</strong><p>Save the player profile you want to follow.</p></li>
          <li><span>03</span><strong>Get to the good stuff</strong><p>Open the game site with your profile ready.</p></li>
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
