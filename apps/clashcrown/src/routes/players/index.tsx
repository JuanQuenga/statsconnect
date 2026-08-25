import { createFileRoute } from "@tanstack/react-router";
import PlayersPage from "@/pages/players/index";

export const Route = createFileRoute("/players/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: PlayersPage,
});
