import { createFileRoute } from "@tanstack/react-router";
import PlayerComparePage from "@/pages/players/compare";

export const Route = createFileRoute("/players/compare")({
  validateSearch: (search: Record<string, unknown>): { a?: string; b?: string } => ({
    a: typeof search.a === "string" ? search.a : undefined,
    b: typeof search.b === "string" ? search.b : undefined,
  }),
  component: PlayerComparePage,
});
