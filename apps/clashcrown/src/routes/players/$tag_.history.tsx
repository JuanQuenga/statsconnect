import { createFileRoute } from "@tanstack/react-router";
import PlayerHistoryPage from "@/pages/players/[tag]/history";

export const Route = createFileRoute("/players/$tag_/history")({ component: PlayerHistoryPage });
