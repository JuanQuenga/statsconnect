import { createFileRoute } from "@tanstack/react-router";
import BetaPage from "@/pages/beta";

export const Route = createFileRoute("/beta")({ component: BetaPage });
