import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { gameDestinationHref } from "@statsconnect/site-nav";
import { ArrowLeft } from "lucide-react";
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

const joinArt: Record<GameId, { bust: string; where: string }> = {
  "clash-royale": {
    bust: "/brand/nav/ronin-bust.webp",
    where: "On the main screen, tap your name in the top-left corner. Your tag is the # code under your name. Tap it to copy.",
  },
  "brawl-stars": {
    bust: "/brand/nav/cosmo-bust.webp",
    where: "On the home screen, tap your profile icon in the top-left corner. Your tag is the # code under your name.",
  },
};

function ConnectGamePage() {
  const { game } = Route.useParams();
  // beforeLoad already turns unknown games into the shared not-found page;
  // repeating the guard here narrows the route param to GameId.
  if (!isGameId(game)) throw notFound();
  const art = joinArt[game];
  const browseHref = gameDestinationHref(game, undefined, window.location.origin);

  return (
    <section data-game={game} className="join">
      <img src={`/games/generated/${game}-2026-feature.webp`} alt="" aria-hidden className="join__backdrop" />
      <div className="content-column join__inner">
        <div className="join__main">
          <Link to="/connect" className="join__back">
            <ArrowLeft aria-hidden /> All games
          </Link>
          <div className="join__popup">
            <img src={art.bust} alt="" aria-hidden className="join__bust" />
            <div className="join__panel">
              <p className="join__game">{gameName(game)}</p>
              <h1 className="join__title">What’s your player tag?</h1>
              <p className="join__lede">
                We’ll find your profile so you can check it’s you. Saved players open in one tap from the lobby.
              </p>
              <ConnectTagForm key={game} game={game} />
              <div className="join__skip">
                <p>Just looking around?</p>
                <a
                  href={browseHref}
                  onClick={(event) => handleGameDestinationClick(event, browseHref)}
                  className="join-button join-button--plain"
                >
                  Browse {gameName(game)} stats
                </a>
              </div>
            </div>
          </div>
        </div>

        <aside className="join__where" aria-labelledby="where-title">
          <h2 id="where-title">Where’s my tag?</h2>
          <div className="join-mock" aria-hidden>
            <img src={`/games/${game}.png`} alt="" className="join-mock__icon" />
            <div className="join-mock__id">
              <span className="join-mock__name">Your name</span>
              <span className="join-mock__tag">#2PPGL9YL</span>
            </div>
            <span className="join-mock__bar" />
            <span className="join-mock__bar join-mock__bar--short" />
          </div>
          <p>{art.where}</p>
        </aside>
      </div>
    </section>
  );
}
