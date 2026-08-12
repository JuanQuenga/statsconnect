import { createFileRoute } from "@tanstack/react-router";
import GuidesPage from "@/pages/guides/index";

export const Route = createFileRoute("/guides/")({ component: GuidesPage });
