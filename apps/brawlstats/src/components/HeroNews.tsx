import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ArrowUpRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type OfficialNewsArticle = { title: string; url: string; publishedAt: string; imageUrl: string | null; category: string };
type OfficialNewsPayload = { articles: OfficialNewsArticle[]; fetchedAt: number; stale: boolean; locale: "en" | "es"; sourceUrl: string };

const officialNewsAction = makeFunctionReference<"action", Record<string, never>, OfficialNewsPayload>("brawl/news:getOfficialNews");

/**
 * The newest post from Supercell's Brawl Stars blog, beside the home search.
 * Renders nothing until it has an article, so a news outage (or a backend
 * without this action yet) leaves the hero exactly as it was.
 */
export function HeroNews() {
  const { date } = useI18n();
  const getOfficialNews = useAction(officialNewsAction);
  const query = useQuery({
    queryKey: ["brawl-official-news"],
    queryFn: () => getOfficialNews({}),
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  const article = query.data?.articles[0];
  if (!article) return null;

  return (
    <aside className="brawl-hero-news" aria-label="Latest Brawl Stars news">
      <a href={article.url} target="_blank" rel="noreferrer noopener">
        {article.imageUrl ? <img src={article.imageUrl} alt="" /> : null}
        <span className="brawl-hero-news-meta">
          <span>Latest news</span>
          <time dateTime={article.publishedAt}>{date(new Date(article.publishedAt), { month: "short", day: "numeric" })}</time>
        </span>
        <strong>{article.title}</strong>
        <span className="brawl-hero-news-read">Read on Supercell <ArrowUpRight className="size-4" aria-hidden /></span>
      </a>
    </aside>
  );
}
