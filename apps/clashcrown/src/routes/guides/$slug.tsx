import { createFileRoute } from "@tanstack/react-router";
import GuidePage from "@/pages/guides/[slug]";

export const Route = createFileRoute("/guides/$slug")({ component: GuideRoute });

function GuideRoute() {
  const { slug } = Route.useParams();
  return <GuidePage slug={slug} />;
}
