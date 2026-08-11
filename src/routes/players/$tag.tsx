import { createFileRoute } from "@tanstack/react-router";
import PlayerPage from "@/pages/players/[tag]";

export const Route = createFileRoute("/players/$tag")({ component: PlayerPage });
