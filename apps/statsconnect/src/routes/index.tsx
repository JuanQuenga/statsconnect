import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ConnectedGameBoard } from "@/components/connected-game-board";
import { GameChannelTile } from "@/components/lobby/GameChannelTile";
import { TileNav } from "@/components/lobby/TileNav";
import { ErrorState, LoadingState } from "@/components/ui-helpers";
import { buttonVariants } from "@/components/ui/button";
import { games } from "@/lib/contracts";
import { hubQueryOptions } from "@/lib/data-client";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({ meta: [{ title: "StatsConnect" }] }),
});

function HomePage() {
  const hubQuery = useQuery(hubQueryOptions());
  if (hubQuery.isPending) return <LoadingState label="Loading connected games" />;
  if (hubQuery.isError)
    return (
      <ErrorState
        title="StatsConnect needs configuration"
        detail={hubQuery.error.message}
      />
    );
  if (hubQuery.data.profiles.length)
    return <ConnectedGameBoard hub={hubQuery.data} />;

  return (
    <section className="flex min-h-[62vh] flex-col justify-center gap-16 py-4">
      <div className="boot-in max-w-4xl">
        <p className="eyebrow text-[var(--ambient)]">System ready</p>
        <h1 className="mt-5 font-display text-5xl font-bold uppercase leading-[0.92] tracking-[-0.01em] sm:text-7xl lg:text-8xl">
          Your game stats,
          <span className="block text-[var(--ambient)]">one console.</span>
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Connect each player tag once, then jump between BrawlStats and
          ClashCrown from one launcher.
        </p>
        <Link to="/connect" className={`${buttonVariants({ size: "lg" })} mt-10`}>
          Connect a game
          <ArrowRight className="size-4" />
        </Link>
      </div>

      <div className="boot-in" style={{ animationDelay: "160ms" }}>
        <p className="eyebrow">Available channels</p>
        <TileNav className="stagger mt-5 grid gap-5 md:grid-cols-2">
          {games.map((game) => (
            <GameChannelTile
              key={game.id}
              id={game.id}
              name={game.name}
              description={game.description}
            />
          ))}
        </TileNav>
      </div>
    </section>
  );
}
