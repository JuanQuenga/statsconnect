import { createFileRoute } from "@tanstack/react-router";
import PlayerUpgradesPage from "@/pages/players/[tag]/upgrades";

export const Route = createFileRoute("/players/$tag_/upgrades")({ component: PlayerUpgradesPage });
