import { createFileRoute } from "@tanstack/react-router";
import PlayerComparePage from "@/pages/players/compare";

export const Route = createFileRoute("/players/compare")({ component: PlayerComparePage });
