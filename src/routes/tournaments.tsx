import { createFileRoute } from "@tanstack/react-router";
import TournamentsPage from "@/pages/tournaments";

export const Route = createFileRoute("/tournaments")({ component: TournamentsPage });
