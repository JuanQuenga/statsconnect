import { createFileRoute } from "@tanstack/react-router";
import CardPage from "@/pages/cards/[slug]";

export const Route = createFileRoute("/cards/$slug")({ component: CardPage });
