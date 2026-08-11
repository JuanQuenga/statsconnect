import { createFileRoute } from "@tanstack/react-router";
import LeaderboardsPage from "@/pages/leaderboards";

export const Route = createFileRoute("/leaderboards")({ component: LeaderboardsPage });
