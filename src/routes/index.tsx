import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ConnectedGameBoard } from "@/components/connected-game-board";
import { ErrorState, LoadingState } from "@/components/ui-helpers";
import { buttonVariants } from "@/components/ui/button";
import { games } from "@/lib/contracts";
import { hubQueryOptions } from "@/lib/data-client";

export const Route = createFileRoute("/")({ component: HomePage, head: () => ({ meta: [{ title: "StatsConnect" }] }) });

function HomePage() {
  const hubQuery = useQuery(hubQueryOptions());
  if (hubQuery.isPending) return <LoadingState label="Loading connected games" />;
  if (hubQuery.isError) return <ErrorState title="StatsConnect needs configuration" detail={hubQuery.error.message} />;
  if (hubQuery.data.profiles.length) return <ConnectedGameBoard hub={hubQuery.data} />;
  return (
    <section className="slide-up flex min-h-[58vh] flex-col justify-center gap-14 py-6 sm:gap-16 sm:py-10 md:py-14">
      <div className="max-w-2xl"><p className="eyebrow text-primary">StatsConnect</p><h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">Your game stats, one hub.</h1><p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">Connect a game profile by player tag and open a single dashboard for your stats.</p><Link to="/connect" className={`${buttonVariants({ size: "lg" })} mt-8`}>Connect a game</Link></div>
      <div className="max-w-3xl"><p className="eyebrow">Available games</p><ul className="mt-4 grid gap-3 sm:grid-cols-2">{games.map((game) => <li key={game.id} className="surface-card p-5"><p className="font-display text-lg font-semibold">{game.name}</p><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{game.description}</p></li>)}</ul></div>
    </section>
  );
}
