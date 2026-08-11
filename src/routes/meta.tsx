import { createFileRoute } from "@tanstack/react-router";
import MetaPage from "@/pages/meta";

export const Route = createFileRoute("/meta")({ component: MetaPage });
