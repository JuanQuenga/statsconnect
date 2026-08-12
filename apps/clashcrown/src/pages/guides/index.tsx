import { ArrowRight, BarChart3, BookOpen } from "lucide-react";
import Head from "@/components/Head";
import Image from "@/components/Image";
import Link from "@/components/Link";
import { Layout } from "@/components/portfolio/Layout";
import { guideText, strategyGuides } from "@/content/guides";
import { useI18n } from "@/lib/i18n";

export default function GuidesPage() {
  const { locale, t } = useI18n();
  return (
    <Layout>
      <Head>
        <title>{t("guides.title")} | Clash Crown</title>
        <meta name="description" content={t("guides.description")} />
        <meta property="og:title" content={`${t("guides.title")} | Clash Crown`} />
        <meta property="og:description" content={t("guides.description")} />
        <link rel="canonical" href="/guides" />
      </Head>
      <div className="editorial-page">
        <section className="editorial-hero">
          <span className="eyebrow"><BookOpen size={14} /> {t("guides.editorial")}</span>
          <h1>{t("guides.title")}</h1>
          <p>{t("guides.description")}</p>
          <Link href="/meta" className="pink-button"><BarChart3 size={15} /> {t("guides.liveMeta")}</Link>
        </section>
        <section className="guide-grid">
          {strategyGuides.map((guide) => (
            <article className="guide-card" key={guide.slug}>
              <Image src={guide.heroCard.image} alt={guide.heroCard.name} width={120} height={148} />
              <div>
                <span>{guideText(guide.archetype, locale)}</span>
                <h2>{guideText(guide.title, locale)}</h2>
                <p>{guideText(guide.summary, locale)}</p>
                <Link href={`/guides/${guide.slug}`}>{t("guides.open")} <ArrowRight size={15} /></Link>
              </div>
            </article>
          ))}
        </section>
      </div>
    </Layout>
  );
}
