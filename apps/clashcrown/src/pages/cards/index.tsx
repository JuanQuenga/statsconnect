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
      summary="Every card, ranked by how often it's played and how often it wins. Tap a card for its matchups, trends, and best decks."
    >
      <CardMetaWorkspace library={library} />
    </CardsPageFrame>
  );
}

function CardsPageFrame({ children, summary = "Every card, ranked by how often it's played and how often it wins." }: { children: ReactNode; summary?: string }) {
  return (
    <Layout>
      <Head>
        <title>Card Stats & Tier List | StatsConnect · Clash Royale statistics</title>
        <meta
          name="description"
          content="Explore observed Clash Royale card usage, win rate, tiers, and movement with honest sample coverage."
        />
        <link rel="canonical" href="/cards" />
      </Head>
      <ArenaRouteHero title="Cards" summary={summary} />
      {children}
    </Layout>
  );
}
