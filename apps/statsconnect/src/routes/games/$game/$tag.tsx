import { createFileRoute, redirect } from "@tanstack/react-router";
import { isGameId } from "@/lib/contracts";

export const Route = createFileRoute("/games/$game/$tag")({
  beforeLoad: ({ params }) => {
    if (!isGameId(params.game)) throw redirect({ to: "/connect" });
    throw redirect({
      to: "/launch/$game",
      params: { game: params.game },
      search: { tag: params.tag },
    });
  },
});
