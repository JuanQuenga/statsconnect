import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useStatsConnectAuth } from "@statsconnect/auth";
import { useEffect } from "react";
import { ErrorState, LoadingState } from "@/components/ui-helpers";
import { gameName, isGameId } from "@/lib/contracts";
import { destinationUrl } from "@/lib/destinations";
import { profileForLaunch } from "@/lib/launch-profiles";

type LaunchSearch = {
  tag?: string;
};

export const Route = createFileRoute("/launch/$game")({
  component: LaunchGamePage,
  validateSearch: (search: Record<string, unknown>): LaunchSearch => ({
    tag: typeof search.tag === "string" ? search.tag : undefined,
  }),
  head: ({ params }) => ({
    meta: [{ title: `${isGameId(params.game) ? `Launching ${gameName(params.game)}` : "Launch"} · StatsConnect` }],
  }),
});

function LaunchGamePage() {
  const { game } = Route.useParams();
  const { tag } = Route.useSearch();
  const auth = useStatsConnectAuth();
  const profile = isGameId(game) ? profileForLaunch(auth.profiles, game, tag) : undefined;
  const profilesReady = !auth.isLoading && (auth.profilesStatus === "guest" || auth.profilesStatus === "synced");

  useEffect(() => {
    if (!profilesReady || !profile || !isGameId(game)) return;

    window.location.replace(destinationUrl(game, profile.tag));
  }, [game, profile, profilesReady]);

  if (!isGameId(game)) return <Navigate to="/connect" replace />;
  if (auth.isLoading || auth.profilesStatus === "reconciling") {
    return <LoadingState label={`Finding your ${gameName(game)} profile`} />;
  }
  if (auth.profilesStatus === "error") {
    return <ErrorState title="Unable to launch game" detail={auth.profilesError ?? "Connected profiles are unavailable."} />;
  }
  if (!profile) {
    return <Navigate to="/connect/$game" params={{ game }} replace />;
  }

  return <LoadingState label={`Opening ${gameName(game)}`} />;
}
