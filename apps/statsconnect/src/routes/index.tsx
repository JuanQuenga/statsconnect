import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  Layers3,
  Link2,
  ShieldCheck,
} from "lucide-react";
import { ConnectedGameBoard } from "@/components/connected-game-board";
import { GameChannelTile } from "@/components/lobby/GameChannelTile";
import { TileNav } from "@/components/lobby/TileNav";
import { buttonVariants } from "@/components/ui/button";
import { games } from "@/lib/contracts";
import { hubQueryOptions } from "@/lib/data-client";

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
  const hubQuery = useQuery(hubQueryOptions());

  if (hubQuery.data?.profiles.length) {
    return <ConnectedGameBoard hub={hubQuery.data} />;
  }

  return <LandingPage backendUnavailable={hubQuery.isError} />;
}

function LandingPage({ backendUnavailable }: { backendUnavailable: boolean }) {
  return (
    <div className="hub-landing">
      <section className="hub-hero">
        <div className="hub-hero__media" aria-hidden>
          <img
            src="/games/generated/statsconnect-supercell-hero.webp"
            alt=""
          />
        </div>
        <div className="hub-hero__copy boot-in">
          <div className="hub-kicker">
            <span aria-hidden />
            One home for your game data
          </div>
          <h1>
            Your game stats.
            <span>All in one place.</span>
          </h1>
          <p className="hub-hero__lede">
            Move from player profiles to live statistics and focused game tools without losing context—or entering the same tag twice.
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
            <li><Check aria-hidden /> No repeated player tags</li>
            <li><Check aria-hidden /> Live official data</li>
            <li><Check aria-hidden /> Built for more games</li>
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
        <p><strong>∞</strong><span>room to expand</span></p>
      </section>

      <section id="games" className="hub-section scroll-mt-28">
        <div className="hub-section__heading">
          <div>
            <p className="eyebrow">Game experiences</p>
            <h2>Specialized tools, connected by design.</h2>
          </div>
          <p>
            Each game keeps its own identity and deep statistics while StatsConnect handles the shared profile experience.
          </p>
        </div>
        <TileNav className="stagger grid gap-5 md:grid-cols-2">
          {games.map((game) => (
            <GameChannelTile
              key={game.id}
              id={game.id}
              name={game.id === "brawl-stars" ? "BrawlStats" : "ClashCrown"}
              description={game.description}
            />
          ))}
        </TileNav>
      </section>

      <section className="hub-section hub-section--platform">
        <div className="hub-section__heading">
          <div>
            <p className="eyebrow">The platform layer</p>
            <h2>Less switching. More signal.</h2>
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
            title="Live statistics"
            copy="Game-specific data pipelines keep rankings, player history, battles, and meta views current."
          />
          <Feature
            icon={<Layers3 />}
            title="One coherent system"
            copy="Shared navigation and account context create continuity without flattening each game's personality."
          />
          <Feature
            icon={<ShieldCheck />}
            title="Built to scale"
            copy="Clear game namespaces let the platform grow or separate infrastructure without changing the experience."
          />
        </div>
      </section>
    </div>
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
