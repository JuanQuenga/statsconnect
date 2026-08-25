import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/history")({
  beforeLoad: () => {
    throw redirect({ href: "/leaderboards?view=history" });
  },
});
