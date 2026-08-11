import { createFileRoute, redirect } from "@tanstack/react-router";
import { isGameId } from "@/lib/contracts";
import { hubQueryOptions } from "@/lib/data-client";
import { normalizeTag } from "@/lib/tags";

export const Route = createFileRoute("/games/$game/")({
  beforeLoad: async ({ context, params }) => {
    if (!isGameId(params.game)) throw redirect({ to: "/connect" });
    const hub = await context.queryClient.ensureQueryData(hubQueryOptions());
    const profile = hub.profiles.find((entry) => entry.game === params.game);
    if (!profile) throw redirect({ to: "/connect/$game", params: { game: params.game } });
    throw redirect({ to: "/games/$game/$tag", params: { game: params.game, tag: normalizeTag(profile.playerTag) } });
  },
});
