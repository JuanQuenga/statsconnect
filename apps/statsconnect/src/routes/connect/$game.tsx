import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { gameDestinationHref } from "@statsconnect/site-nav";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ConnectTagForm } from "@/components/connect-tag-form";
import { handleGameDestinationClick } from "@/lib/application-navigation";
import { gameName, isGameId, type GameId } from "@/lib/contracts";

export const Route = createFileRoute("/connect/$game")({
  beforeLoad: ({ params }) => {
    if (!isGameId(params.game)) throw notFound();
  },
  component: ConnectGamePage,
  head: ({ params }) => ({
    meta: [
      {
        title: `${isGameId(params.game) ? gameName(params.game) : "Connect"} · StatsConnect`,
      },
    ],
  }),
});

function tagSteps(game: GameId): string[] {
  return [`Open ${gameName(game)} and tap your profile`, "Copy the # tag under your player name", "Paste it here and check it"];
}

function ConnectGamePage() {
  const { game } = Route.useParams();
  // beforeLoad already turns unknown games into the shared not-found page;
  // repeating the guard here narrows the route param to GameId.
  if (!isGameId(game)) throw notFound();
  const browseHref = gameDestinationHref(game, undefined, window.location.origin);

  return (
    <section data-game={game} className="connect-stage boot-in">
      <div className="connect-stage__art">
        <img src={`/games/generated/${game}-2026-feature.webp`} alt="" aria-hidden />
        <span className="connect-stage__wordmark" aria-hidden>
          {game === "clash-royale" ? "ROYALE" : "BRAWL"}
        </span>
        <ol className="connect-stage__steps" aria-label="Where to find your player tag">
          {tagSteps(game).map((step, index) => (
            <li key={step}><span>{index + 1}</span>{step}</li>
          ))}
        </ol>
      </div>
      <div className="connect-stage__panel">
        <Link to="/connect" className="connect-stage__back">
          <ArrowLeft aria-hidden /> All games
        </Link>
        <p className="connect-stage__eyebrow">Connect {gameName(game)}</p>
        <h1>Find your player</h1>
        <p className="connect-stage__lede">
          Save your tag once and your stats open in one tap from the lobby.
          We’ll show you the profile before anything is saved.
        </p>
        <div className="mt-8">
          <ConnectTagForm key={game} game={game} />
        </div>
        <div className="connect-stage__skip">
          <p>Just looking around?</p>
          <a href={browseHref} onClick={(event) => handleGameDestinationClick(event, browseHref)}>
            Open {gameName(game)} stats without saving
            <ArrowRight aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
