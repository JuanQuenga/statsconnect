import { createFileRoute } from "@tanstack/react-router";
import ClanSearchPage from "@/pages/clans/search";

export const Route = createFileRoute("/clans/search")({ component: ClanSearchPage });
