import { Link, createFileRoute } from "@tanstack/react-router";
import { ConnectTagForm } from "@/components/connect-tag-form";
import { gameName, isGameId } from "@/lib/contracts";

export const Route = createFileRoute("/connect/$game")({
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
  if (!isGameId(game)) {
    return (
      <section className="mx-auto max-w-xl text-center">
        <p className="eyebrow">Unknown game</p>
        <h1 className="mt-4 font-display text-3xl font-bold uppercase">
          This game is not available
        </h1>
        <Link to="/connect" className="mt-6 inline-block text-[var(--ambient)]">
          Choose a supported game
        </Link>
      </section>
    );
  }
  return (
    <section
      data-game={game}
      className="boot-in mx-auto max-w-xl surface-card bevel-lg p-8 sm:p-10"
    >
      <p className="eyebrow text-[var(--game-accent)]">Connect {gameName(game)}</p>
      <h1 className="mt-4 font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">
        Find your profile
      </h1>
      <p className="mt-4 text-muted-foreground">
        We’ll verify the tag first, then let you confirm the profile before saving
        it.
      </p>
      <div className="mt-8">
        <ConnectTagForm key={game} game={game} />
      </div>
    </section>
  );
}
