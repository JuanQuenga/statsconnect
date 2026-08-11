import { createFileRoute } from "@tanstack/react-router";
import CardsPage from "@/pages/cards/index";

export const Route = createFileRoute("/cards/")({ component: CardsPage });
