import { ArrowRight, BarChart3 } from "lucide-react";
import Head from "@/components/Head";
import Image from "@/components/Image";
import Link from "@/components/Link";
import { ArenaRouteHero } from "@/components/portfolio/ArenaRouteHero";
import { Layout } from "@/components/portfolio/Layout";
import { guideText, strategyGuides } from "@/content/guides";
import { useI18n } from "@/lib/i18n";

export default function GuidesPage() {
  const { locale, t } = useI18n();
  return (
    <Layout>
      <Head>
        <title>{t("guides.title")} | StatsConnect · Clash Royale statistics</title>
        <meta name="description" content={t("guides.description")} />
        <meta property="og:title" content={`${t("guides.title")} | StatsConnect · Clash Royale statistics`} />
        <meta property="og:description" content={t("guides.description")} />
        <link rel="canonical" href="/guides" />
      </Head>
      <div className="editorial-page">
        <ArenaRouteHero
          title={t("guides.title")}
          summary={t("guides.description")}
          actions={<Link href="/meta" className="pink-button"><BarChart3 size={15} /> {t("guides.liveMeta")}</Link>}
        />
        <section className="guide-grid">
          {strategyGuides.map((guide) => (
            <article className="guide-card" key={guide.slug}>
              <Image src={guide.heroCard.image} alt={guide.heroCard.name} width={120} height={148} />
              <div>
                <h2>{guideText(guide.title, locale)}</h2>
                <p><strong>{guideText(guide.archetype, locale)}</strong> · {guideText(guide.summary, locale)}</p>
                <Link href={`/guides/${guide.slug}`}>{t("guides.open")} <ArrowRight size={15} /></Link>
              </div>
            </article>
          ))}
        </section>
      </div>
    </Layout>
  );
}
