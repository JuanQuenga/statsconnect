import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/bands")({
  validateSearch: (search: Record<string, unknown>) => ({
    tag: typeof search.tag === "string" ? search.tag : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/clubs", search: { tag: search.tag }, replace: true });
  },
  component: () => null,
});
