import { createFileRoute } from "@tanstack/react-router";
import ClanPage from "@/pages/clans/[tag]";

export const Route = createFileRoute("/clans/$tag")({ component: ClanPage });
