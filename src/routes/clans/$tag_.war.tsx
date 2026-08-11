import { createFileRoute } from "@tanstack/react-router";
import ClanWarPage from "@/pages/clans/[tag]/war";

export const Route = createFileRoute("/clans/$tag_/war")({ component: ClanWarPage });
