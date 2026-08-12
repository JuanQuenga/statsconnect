import { createFileRoute } from "@tanstack/react-router";
import ClanManagePage from "@/pages/clans/[tag]/manage";

export const Route = createFileRoute("/clans/$tag_/manage")({ component: ClanManagePage });
