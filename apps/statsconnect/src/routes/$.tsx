import { createFileRoute } from "@tanstack/react-router";
import { NotFoundPage } from "@/components/NotFoundPage";

export const Route = createFileRoute("/$")({
  component: NotFoundPage,
  head: () => ({ meta: [{ title: "Page not found · StatsConnect" }] }),
});
