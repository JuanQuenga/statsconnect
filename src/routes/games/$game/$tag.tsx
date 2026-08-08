import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { GameDashboard } from "@/components/game-dashboard";
import { ErrorState, LoadingState } from "@/components/ui-helpers";
import { buttonVariants } from "@/components/ui/button";
import { gameName, isGameId } from "@/lib/contracts";
import { hubQueryOptions } from "@/lib/data-client";
import { normalizeTag } from "@/lib/tags";

export const Route = createFileRoute("/games/$game/$tag")({ component: DashboardRoute, head: ({ params }) => ({ meta: [{ title: `${isGameId(params.game) ? gameName(params.game) : "Dashboard"} · StatsConnect` }] }) });

function DashboardRoute() {
  const { game, tag } = Route.useParams();
  const hubQuery = useQuery(hubQueryOptions());
  if (!isGameId(game)) return <ErrorState title="Unknown game" detail="This game is not supported by StatsConnect." />;
  if (hubQuery.isPending) return <LoadingState label="Loading connection" />;
  if (hubQuery.isError) return <ErrorState title="Dashboard unavailable" detail={hubQuery.error.message} />;
  const profile = hubQuery.data.profiles.find((entry) => entry.game === game);
  let requestedTag: string;
  try { requestedTag = normalizeTag(tag); } catch { return <ErrorState title="Invalid player tag" detail="This dashboard URL does not contain a valid player tag." />; }
  if (!profile || normalizeTag(profile.playerTag) !== requestedTag) {
    return <section className="mx-auto max-w-2xl rounded-2xl border border-border/60 bg-card/45 p-8 text-center"><p className="eyebrow">Read-only profile</p><h1 className="mt-3 font-display text-3xl font-semibold">Connect this profile to view its dashboard</h1><p className="mx-auto mt-3 max-w-lg text-muted-foreground">StatsConnect only loads full statistics for a profile connected to this browser.</p><Link to="/connect/$game" params={{ game }} className={`${buttonVariants()} mt-7`}>Connect {gameName(game)}</Link></section>;
  }
  return <GameDashboard profile={profile} />;
}
