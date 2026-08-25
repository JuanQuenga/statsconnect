import { createFileRoute } from "@tanstack/react-router";
import { notFound } from "@tanstack/react-router";
import { ConnectTagForm } from "@/components/connect-tag-form";
import { gameName, isGameId } from "@/lib/contracts";

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

function ConnectGamePage() {
  const { game } = Route.useParams();
  // beforeLoad already turns unknown games into the shared not-found page;
  // repeating the guard here narrows the route param to GameId.
  if (!isGameId(game)) throw notFound();

  return (
    <section
      data-game={game}
      className="connect-game-card boot-in mx-auto max-w-xl surface-card bevel-lg overflow-hidden p-8 sm:p-10"
    >
      <img
        src={`/games/${game}.png`}
        alt=""
        aria-hidden
        className="connect-game-card__art"
      />
      <div className="relative z-[1]">
        <p className="eyebrow text-[var(--game-accent)]">
          Connect {gameName(game)}
        </p>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Find your profile
        </h1>
        <p className="mt-4 text-muted-foreground">
          We’ll verify the tag first, then let you confirm the profile before
          saving it.
        </p>
        <div className="mt-8">
          <ConnectTagForm key={game} game={game} />
        </div>
      </div>
    </section>
  );
}
