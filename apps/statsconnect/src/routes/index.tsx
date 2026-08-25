import { Link, createFileRoute } from "@tanstack/react-router";
import { useStatsConnectAuth } from "@statsconnect/auth";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  Layers3,
  Link2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ConnectedGameBoard } from "@/components/connected-game-board";
import { GameChannelTile } from "@/components/lobby/GameChannelTile";
import { TileNav } from "@/components/lobby/TileNav";
import { buttonVariants } from "@/components/ui/button";
import { LoadingState } from "@/components/ui-helpers";
import { games, type StatsConnectPlusOffer } from "@/lib/contracts";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "StatsConnect — every game, one profile" },
      {
        name: "description",
        content: "Connect your player profiles and move between live game statistics from one calm, unified home.",
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
      <section className="hub-hero">
        <div className="hub-hero__media" aria-hidden>
          <img
            src="/games/generated/brawl-stars-channel.webp"
            alt=""
          />
        </div>
        <div className="hub-hero__copy boot-in">
          <p className="hub-kicker">Brawl Stars and Clash Royale</p>
          <h1>
            Your player profiles,
            <span>connected.</span>
          </h1>
          <p className="hub-hero__lede">
            Save each player tag once, then jump straight to the stats, battles,
            decks, and rankings for that game.
          </p>
          <div className="hub-hero__actions">
            <Link to="/connect" className={buttonVariants({ size: "lg" })}>
              Connect a profile
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a href="#games" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Explore game sites
            </a>
          </div>
          <ul className="hub-proof" aria-label="Platform highlights">
            <li><Check aria-hidden /> Save tags once</li>
            <li><Check aria-hidden /> Official live data</li>
            <li><Check aria-hidden /> Separate tools for each game</li>
          </ul>
          {backendUnavailable ? (
            <p className="hub-config-note">Profile connections are temporarily unavailable. The game sites remain open.</p>
          ) : null}
        </div>

      </section>

      <section className="hub-value-strip" aria-label="StatsConnect platform qualities">
        <p><strong>2</strong><span>live game experiences</span></p>
        <p><strong>1</strong><span>connected profile layer</span></p>
        <p><strong>24/7</strong><span>statistics pipelines</span></p>
        <p><strong>0</strong><span>repeat tag entry</span></p>
      </section>

      <section id="games" className="hub-section scroll-mt-28">
        <div className="hub-section__heading">
          <div>
            <p className="eyebrow">Choose a game</p>
            <h2>Each game keeps the tools that fit it.</h2>
          </div>
          <p>
            StatsConnect remembers your profiles. Its Brawl Stars and Clash Royale
            experiences keep the game-specific detail.
          </p>
        </div>
        <TileNav className="stagger grid gap-5 md:grid-cols-2">
          {games.map((game) => (
            <GameChannelTile
              key={game.id}
              id={game.id}
              name={game.id === "brawl-stars" ? "StatsConnect · Brawl Stars statistics" : "StatsConnect · Clash Royale statistics"}
              description={game.description}
            />
          ))}
        </TileNav>
      </section>

      {plusOffer ? <PlusOffer offer={plusOffer} /> : null}

      <section className="hub-section hub-section--platform">
        <div className="hub-section__heading">
          <div>
            <p className="eyebrow">How it works</p>
            <h2>Your profiles stay connected.</h2>
          </div>
        </div>
        <div className="hub-feature-grid">
          <Feature
            icon={<Link2 />}
            title="Connect once"
            copy="Save each player profile once and launch the right game experience without re-entering tags."
          />
          <Feature
            icon={<BarChart3 />}
            title="Current game data"
            copy="Open rankings, player history, battles, and meta views without leaving the game site."
          />
          <Feature
            icon={<Layers3 />}
            title="Easy game switching"
            copy="Move between games from the same navigation while each site keeps its own look and tools."
          />
          <Feature
            icon={<ShieldCheck />}
            title="Ready for another game"
            copy="New games can join the same profile hub without changing the profiles you already saved."
          />
        </div>
      </section>
    </div>
  );
}

function PlusOffer({ offer }: { offer: StatsConnectPlusOffer }) {
  return (
    <section className="hub-section" aria-labelledby="statsconnect-plus-title">
      <div className="hub-section__heading">
        <div>
          <p className="eyebrow">{offer.name} · foundation preview</p>
          <h2 id="statsconnect-plus-title">One upgrade for every game site.</h2>
        </div>
        <p>{offer.scope}. No checkout is presented while verified account and billing integrations are unfinished.</p>
      </div>
      <div className="hub-feature-grid">
        {offer.features.map((feature) => (
          <Feature
            key={feature}
            icon={<Sparkles />}
            title={feature}
            copy="Included in the shared premium entitlement when this capability is integrated on a game site."
          />
        ))}
      </div>
      <p className="hub-config-note mt-6">{offer.notice}</p>
    </section>
  );
}

function Feature({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <article className="hub-feature">
      <div className="hub-feature__icon" aria-hidden>{icon}</div>
      <h3>{title}</h3>
      <p>{copy}</p>
    </article>
  );
}
