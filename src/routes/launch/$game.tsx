import { useQuery } from "@tanstack/react-query";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ErrorState, LoadingState } from "@/components/ui-helpers";
import { gameName, isGameId } from "@/lib/contracts";
import { dataClient, hubQueryOptions } from "@/lib/data-client";
import { destinationUrl } from "@/lib/destinations";

export const Route = createFileRoute("/launch/$game")({
  component: LaunchGamePage,
  head: ({ params }) => ({
    meta: [{ title: `${isGameId(params.game) ? `Launching ${gameName(params.game)}` : "Launch"} · StatsConnect` }],
  }),
});

function LaunchGamePage() {
  const { game } = Route.useParams();
  const hubQuery = useQuery(hubQueryOptions());
  const profile = isGameId(game)
    ? hubQuery.data?.profiles.find((entry) => entry.game === game)
    : undefined;

  useEffect(() => {
    if (!profile || !isGameId(game)) return;

    void dataClient.setActive(profile.id).catch(() => undefined);
    window.location.replace(destinationUrl(game, profile.playerTag));
  }, [game, profile]);

  if (!isGameId(game)) return <Navigate to="/connect" replace />;
  if (hubQuery.isPending) return <LoadingState label={`Finding your ${gameName(game)} profile`} />;
  if (hubQuery.isError) {
    return <ErrorState title="Unable to launch game" detail={hubQuery.error.message} />;
  }
  if (!profile) {
    return <Navigate to="/connect/$game" params={{ game }} replace />;
  }

  return <LoadingState label={`Opening ${gameName(game)}`} />;
}
