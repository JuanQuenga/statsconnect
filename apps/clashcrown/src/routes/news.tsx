import { createFileRoute } from "@tanstack/react-router";
import NewsPage from "@/pages/news";

export const Route = createFileRoute("/news")({ component: NewsPage });
