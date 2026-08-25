import Head from "@/components/Head";
import { ArenaRouteHero } from "@/components/portfolio/ArenaRouteHero";
import { Layout } from "@/components/portfolio/Layout";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { errorMessage, isConvexConfigured } from "@/lib/convex";
import { useCardLibrary } from "@/lib/useCardCatalog";
import { CardMetaWorkspace } from "@/components/cards/CardMetaWorkspace";
import type { ReactNode } from "react";

export default function CardsPage() {
  if (!isConvexConfigured) {
    return <CardsPageFrame><SetupState feature="the card meta workspace" /></CardsPageFrame>;
  }
  return <CardLibrary />;
}

function CardLibrary() {
  const library = useCardLibrary();

  if (library.isLoading) {
    return <CardsPageFrame><LoadingState label="card statistics" /></CardsPageFrame>;
  }
  if (library.error) {
    return <CardsPageFrame><ErrorState message={errorMessage(library.error)} /></CardsPageFrame>;
  }

  return (
    <CardsPageFrame
      summary={`${library.cards.length} cards · ${library.towerTroops.length} Tower Troops · observed usage, performance, and movement`}
    >
      <CardMetaWorkspace library={library} />
    </CardsPageFrame>
  );
}

function CardsPageFrame({ children, summary = "Observed usage, performance, and movement from crawled battle logs" }: { children: ReactNode; summary?: string }) {
  return (
    <Layout>
      <Head>
        <title>Card Meta Workspace | StatsConnect · Clash Royale statistics</title>
        <meta
          name="description"
          content="Explore observed Clash Royale card usage, win rate, tiers, and movement with honest sample coverage."
        />
        <link rel="canonical" href="/cards" />
      </Head>
      <ArenaRouteHero title="Card meta workspace" summary={summary} />
      {children}
    </Layout>
  );
}
