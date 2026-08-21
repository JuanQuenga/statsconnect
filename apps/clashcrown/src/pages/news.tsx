import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { ExternalLink, Newspaper, RefreshCcw } from "lucide-react";
import Head from "@/components/Head";
import Image from "@/components/Image";
import { Layout } from "@/components/portfolio/Layout";
import { datedOfficialNews, officialArchiveUrl, type OfficialNewsArticle, type OfficialNewsPayload } from "@/lib/clash/news";
import { errorMessage, isConvexConfigured } from "@/lib/convex";
import { useI18n } from "@/lib/i18n";
import { officialNewsAction } from "@/lib/news";

const DATED_INDEX_CHECKED_AT = Date.UTC(2026, 7, 5, 12);

export default function NewsPage() {
  return isConvexConfigured ? <LiveNews /> : <StaticNews />;
}

function LiveNews() {
  const { locale, t } = useI18n();
  const getOfficialNews = useAction(officialNewsAction);
  const [refreshKey, setRefreshKey] = useState(0);
  const query = useQuery({
    queryKey: ["official-news", locale, refreshKey],
    queryFn: () => getOfficialNews({ locale, force: refreshKey > 0 }),
    retry: false,
  });

  return (
    <NewsLayout
      payload={query.data}
      loading={query.isLoading}
      error={query.error ? errorMessage(query.error) : null}
      refreshing={query.isFetching && !query.isLoading}
      onRefresh={() => setRefreshKey((value) => value + 1)}
      disclosure={query.data?.stale ? t("news.stale") : null}
    />
  );
}

function StaticNews() {
  const { locale, t } = useI18n();
  return (
    <NewsLayout
      payload={{
        articles: datedOfficialNews,
        fetchedAt: DATED_INDEX_CHECKED_AT,
        stale: true,
        locale,
        sourceUrl: officialArchiveUrl[locale],
      }}
      loading={false}
      error={null}
      refreshing={false}
      disclosure={t("news.static")}
    />
  );
}

function NewsLayout({
  payload,
  loading,
  error,
  refreshing,
  disclosure,
  onRefresh,
}: {
  payload?: OfficialNewsPayload;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  disclosure: string | null;
  onRefresh?: () => void;
}) {
  const { formatDate, formatNumber, t } = useI18n();
  const sourceUrl = payload?.sourceUrl ?? officialArchiveUrl.en;

  return (
    <Layout>
      <Head>
        <title>{t("news.title")} | StatsConnect · Clash Royale statistics</title>
        <meta name="description" content={t("news.description")} />
        <meta property="og:title" content={`${t("news.title")} | StatsConnect · Clash Royale statistics`} />
        <meta property="og:description" content={t("news.description")} />
        <link rel="canonical" href="/news" />
      </Head>
      <div className="editorial-page news-page">
        <section className="editorial-hero">
          <h1>{t("news.title")}</h1>
          <p>{t("news.description")} StatsConnect stores only headline metadata and always sends you to the original article.</p>
          <div className="editorial-actions">
            <a className="pink-button" href={sourceUrl} target="_blank" rel="noopener noreferrer">
              {t("common.source")} <ExternalLink size={15} />
            </a>
            {onRefresh ? (
              <button type="button" className="secondary-button" onClick={onRefresh} disabled={refreshing}>
                <RefreshCcw className={refreshing ? "spin" : ""} size={15} />
                {refreshing ? t("common.refreshing") : t("common.refresh")}
              </button>
            ) : null}
          </div>
        </section>

        {disclosure ? <p className="source-disclosure" role="status">{disclosure}</p> : null}
        {payload ? (
          <p className="news-freshness">
            {t("common.lastUpdated")}: {formatDate(payload.fetchedAt, { dateStyle: "medium", timeStyle: "short" })}
            {" · "}{formatNumber(payload.articles.length)} {payload.articles.length === 1 ? "article" : "articles"}
          </p>
        ) : null}

        {loading ? <NewsState icon={<RefreshCcw className="spin" size={30} />} copy={t("news.loading")} /> : null}
        {error ? (
          <NewsState
            icon={<Newspaper size={30} />}
            copy={`${t("news.error")} ${error}`}
            action={<a href={sourceUrl} target="_blank" rel="noopener noreferrer">{t("news.open")} <ExternalLink size={14} /></a>}
          />
        ) : null}
        {!loading && !error && payload && !payload.articles.length ? (
          <NewsState copy={t("news.empty")} icon={<Newspaper size={30} />} />
        ) : null}
        {payload?.articles.length ? <NewsGrid articles={payload.articles} /> : null}
      </div>
    </Layout>
  );
}

function NewsGrid({ articles }: { articles: OfficialNewsArticle[] }) {
  const { formatDate, t } = useI18n();
  return (
    <section className="news-grid" aria-label={t("news.title")}>
      {articles.map((article) => (
        <article className="news-card" key={article.url}>
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="news-card-media" tabIndex={-1} aria-hidden="true">
            {article.imageUrl ? (
              <Image src={article.imageUrl} alt="" width={720} height={405} />
            ) : (
              <span><Newspaper size={34} /></span>
            )}
          </a>
          <div className="news-card-copy">
            <span>{article.category} · {formatDate(article.publishedAt)}</span>
            <h2>{article.title}</h2>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              {t("news.open")} <ExternalLink size={14} />
            </a>
          </div>
        </article>
      ))}
    </section>
  );
}

function NewsState({ icon, copy, action }: { icon: React.ReactNode; copy: string; action?: React.ReactNode }) {
  return <div className="editorial-state" role="status">{icon}<p>{copy}</p>{action}</div>;
}
