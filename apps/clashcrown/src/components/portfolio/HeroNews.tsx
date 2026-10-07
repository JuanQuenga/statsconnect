import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { ArrowUpRight } from "lucide-react";
import Link from "@/components/Link";
import { isConvexConfigured } from "@/lib/convex";
import { datedOfficialNews, type OfficialNewsArticle } from "@/lib/clash/news";
import { useI18n } from "@/lib/i18n";
import { officialNewsAction } from "@/lib/news";

/** The newest post from Supercell's Clash Royale blog, shown beside the home search. */
export function HeroNews() {
  return isConvexConfigured ? <LiveHeroNews /> : <HeroNewsCard article={datedOfficialNews[0]} />;
}

function LiveHeroNews() {
  const { locale } = useI18n();
  const getOfficialNews = useAction(officialNewsAction);
  const query = useQuery({
    queryKey: ["official-news", locale, 0],
    queryFn: () => getOfficialNews({ locale }),
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  if (query.isLoading) return <div className="cr-hero-news cr-hero-news-loading" aria-hidden="true" />;
  // A news outage should never leave a broken panel in the hero.
  const article = query.data?.articles[0] ?? (query.error ? datedOfficialNews[0] : undefined);
  return article ? <HeroNewsCard article={article} /> : null;
}

function HeroNewsCard({ article }: { article: OfficialNewsArticle }) {
  const { locale } = useI18n();
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(article.publishedAt));
  return (
    <aside className="cr-hero-news" aria-label="Latest Clash Royale news">
      <a className="cr-hero-news-story" href={article.url} target="_blank" rel="noreferrer noopener">
        {article.imageUrl ? <img src={article.imageUrl} alt="" loading="eager" /> : null}
        <span className="cr-hero-news-meta">
          <span>Latest news</span>
          <time dateTime={article.publishedAt}>{date}</time>
        </span>
        <strong>{article.title}</strong>
        <span className="cr-hero-news-read">Read on Supercell <ArrowUpRight size={15} aria-hidden="true" /></span>
      </a>
      <Link href="/news" className="cr-hero-news-more">All news</Link>
    </aside>
  );
}
