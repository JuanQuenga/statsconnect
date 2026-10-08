import Head from "@/components/Head";
import { MetaReport } from "@/components/meta/MetaReport";
import { SetupState } from "@/components/portfolio/AsyncState";
import { Layout } from "@/components/portfolio/Layout";
import { isConvexConfigured } from "@/lib/convex";
import { useI18n } from "@/lib/i18n";

/**
 * The public face of the battle-log pipeline. Deck statistics are not
 * published by the official API — they exist here because the crawler reads
 * battle logs one player at a time and folds them into daily aggregates, and
 * every view shows the sample it came from.
 */
export default function MetaPage() {
  const { locale, t } = useI18n();
  return (
    <Layout>
      <Head>
        <title>{t("meta.title")} | StatsConnect · Clash Royale statistics</title>
        <meta
          name="description"
          content={locale === "es" ? "Estadísticas en vivo de mazos y cartas de Clash Royale, agregadas desde registros de batalla observados." : "Live Clash Royale deck and card statistics, aggregated from real battle logs."}
        />
        <link rel="canonical" href="/meta" />
      </Head>
      {isConvexConfigured ? <MetaReport /> : <SetupState feature="the meta report" />}
    </Layout>
  );
}
