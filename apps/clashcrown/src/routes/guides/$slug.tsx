import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/guides/$slug")({
  beforeLoad: () => {
    throw redirect({ href: "/news" });
  },
});
