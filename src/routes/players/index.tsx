import { createFileRoute } from "@tanstack/react-router";
import PlayersPage from "@/pages/players/index";

export const Route = createFileRoute("/players/")({ component: PlayersPage });
