import { ArrowLeft, BarChart3, CheckCircle2, Hammer, TriangleAlert } from "lucide-react";
import Head from "@/components/Head";
import Image from "@/components/Image";
import Link from "@/components/Link";
import { Layout } from "@/components/portfolio/Layout";
import { ArenaHeroFrame } from "@/components/portfolio/ArenaRouteHero";
import { findGuide, guideText } from "@/content/guides";
import { useI18n } from "@/lib/i18n";

export default function GuidePage({ slug }: { slug: string }) {
  const { locale, t } = useI18n();
  const guide = findGuide(slug);

  if (!guide) {
    return (
      <Layout>
        <div className="editorial-state">
          <BookFallback />
          <h1>Guide not found</h1>
          <Link href="/guides" className="pink-button"><ArrowLeft size={15} /> {t("guides.title")}</Link>
        </div>
      </Layout>
    );
  }

  const title = guideText(guide.title, locale);
  const summary = guideText(guide.summary, locale);
  return (
    <Layout>
      <Head>
        <title>{title} | StatsConnect · Clash Royale statistics</title>
        <meta name="description" content={summary} />
        <meta property="og:title" content={`${title} | StatsConnect · Clash Royale statistics`} />
        <meta property="og:description" content={summary} />
        <link rel="canonical" href={`/guides/${guide.slug}`} />
      </Head>
      <article className="editorial-page guide-detail">
        <ArenaHeroFrame className="guide-detail-hero">
          <div>
            <Link href="/guides" className="breadcrumb"><ArrowLeft size={14} /> {t("guides.title")}</Link>
            <h1>{title}</h1>
            <p>{summary}</p>
            <div className="editorial-actions">
              <Link href="/meta" className="pink-button"><BarChart3 size={15} /> {t("guides.liveMeta")}</Link>
              <Link href={`/decks?include=${guide.heroCard.slug}`} className="secondary-button"><Hammer size={15} /> {t("guides.build")}</Link>
            </div>
          </div>
          <Image src={guide.heroCard.image} alt={guide.heroCard.name} width={190} height={230} priority />
        </ArenaHeroFrame>

        <section className="guide-section">
          <h2>{locale === "es" ? "Principios del arquetipo" : "Archetype principles"}</h2>
          <ul className="principle-list">
            {guide.principles.map((principle) => <li key={principle.en}><CheckCircle2 size={18} /> {guideText(principle, locale)}</li>)}
          </ul>
        </section>

        <section className="guide-section">
          <h2>{locale === "es" ? "Plan de partida" : "Match plan"}</h2>
          <div className="phase-grid">
            {guide.phases.map((phase, index) => (
              <div key={phase.title.en}><span>0{index + 1}</span><h3>{guideText(phase.title, locale)}</h3><p>{guideText(phase.copy, locale)}</p></div>
            ))}
          </div>
        </section>

        <section className="guide-section guide-mistakes">
          <h2><TriangleAlert size={22} /> {locale === "es" ? "Errores comunes" : "Common mistakes"}</h2>
          <ul>{guide.mistakes.map((mistake) => <li key={mistake.en}>{guideText(mistake, locale)}</li>)}</ul>
        </section>

        <section className="guide-live-links">
          <div>
            <h2>{locale === "es" ? "Contrasta la guía con lo que se juega ahora" : "Compare the guide with what is played now"}</h2>
            <p>{locale === "es" ? "Las guías explican decisiones duraderas. El informe del meta muestra la muestra actual y siempre indica cuántas batallas observó." : "Guides explain durable decisions. The meta report shows the current sample and always discloses how many battles it observed."}</p>
          </div>
          <div className="guide-card-links">
            {guide.relatedCards.map((card) => <Link key={card.slug} href={`/cards/${card.slug}`}>{card.name}</Link>)}
            <Link href="/meta">{t("guides.liveMeta")} <BarChart3 size={14} /></Link>
          </div>
        </section>
      </article>
    </Layout>
  );
}

function BookFallback() {
  return <span aria-hidden="true">♛</span>;
}
