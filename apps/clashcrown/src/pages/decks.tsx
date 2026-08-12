import { Hammer, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import Head from "@/components/Head";
import { DeckBuilder } from "@/components/decks/DeckBuilder";
import { DeckDiscovery } from "@/components/decks/DeckDiscovery";
import { Layout } from "@/components/portfolio/Layout";
import { mapCardsPayload } from "@/lib/clash/mappers";
import { cardsAction, errorMessage, isConvexConfigured } from "@/lib/convex";
import { useRouter } from "@/lib/router";
import { cards as localCards, type Card } from "@/lib/mock-data";

type DeckSurface = "discover" | "war" | "builder";

export default function DecksPage() {
  return isConvexConfigured ? <LiveDeckExperience /> : <OfflineDeckExperience />;
}

function LiveDeckExperience() {
  const router = useRouter();
  const getCards = useAction(cardsAction);
  const [refreshKey, setRefreshKey] = useState(0);
  const [surface, setSurface] = useState<DeckSurface>(router.query.include || router.query.tool === "builder" ? "builder" : "discover");
  const [builderSeed, setBuilderSeed] = useState<{ cards: Card[]; key: string }>({ cards: [], key: "" });
  const query = useQuery({
    queryKey: ["cards", refreshKey],
    queryFn: async () => mapCardsPayload(await getCards({ force: refreshKey > 0 })),
    placeholderData: (previous) => previous,
    retry: false
  });

  if (query.isLoading) {
    return <Layout><div className="data-state"><LoaderCircle className="state-spinner" size={38} /><h1>Loading deck discovery</h1><p>Syncing the card catalog before matching observed decks.</p></div></Layout>;
  }

  const cards = query.data ?? localCards;
  const catalogMessage = query.error ? `Live card catalog unavailable: ${errorMessage(query.error)}` : undefined;
  return (
    <DeckExperienceShell surface={surface} setSurface={setSurface}>
      <div hidden={surface !== "builder"}>
        <DeckBuilder
          cards={cards}
          source={query.data ? "Live Clash Royale card catalog" : "Local catalog fallback"}
          initialCards={builderSeed.cards}
          initialKey={builderSeed.key}
          onRefresh={() => setRefreshKey((value) => value + 1)}
          isRefreshing={query.isFetching}
        />
      </div>
      <div hidden={surface === "builder"}>
        <DeckDiscovery
          cards={cards}
          view={surface === "war" ? "war" : "discover"}
          catalogMessage={catalogMessage}
          onUseDeck={(deckCards, deckHash) => {
            setBuilderSeed({ cards: deckCards, key: `${deckHash}:${Date.now()}` });
            setSurface("builder");
          }}
        />
      </div>
    </DeckExperienceShell>
  );
}

function OfflineDeckExperience() {
  const router = useRouter();
  const [surface, setSurface] = useState<DeckSurface>(router.query.include || router.query.tool === "builder" ? "builder" : "discover");
  return (
    <DeckExperienceShell surface={surface} setSurface={setSurface}>
      <div hidden={surface !== "builder"}><DeckBuilder cards={localCards} source="Local catalog" /></div>
      <div hidden={surface === "builder"}>
        <section className="profile-section discovery-results">
          <div className="discovery-empty"><ShieldCheck size={38} /><h2>Observed deck data is not connected</h2><p>Discovery and player recommendations require a configured Convex deployment. No demo win rates or synthetic recommendations are shown. The manual builder remains available.</p><button type="button" className="pink-button" onClick={() => setSurface("builder")}>Open manual builder</button></div>
        </section>
      </div>
    </DeckExperienceShell>
  );
}

function DeckExperienceShell({ surface, setSurface, children }: { surface: DeckSurface; setSurface: (surface: DeckSurface) => void; children: React.ReactNode }) {
  return (
    <Layout>
      <Head><title>Deck Discovery & Builder | Clash Crown</title><meta name="description" content="Find observed Clash Royale decks, personalize recommendations from a player tag, build war sets, and copy decks into the game." /></Head>
      <div className="decks-page discovery-page">
        <section className="decks-hero discovery-hero">
          <span className="eyebrow">Battle-log evidence, not generated guesses</span>
          <h1>Find a deck that fits</h1>
          <p>Search real observed decks, account for your collection, assemble a valid four-deck war set, or build freely from the card catalog.</p>
          <div className="deck-surface-tabs" role="tablist" aria-label="Deck tools">
            <button type="button" role="tab" aria-selected={surface === "discover"} className={surface === "discover" ? "active" : ""} onClick={() => setSurface("discover")}><Search size={17} />Discover</button>
            <button type="button" role="tab" aria-selected={surface === "war"} className={surface === "war" ? "active" : ""} onClick={() => setSurface("war")}><ShieldCheck size={17} />War set</button>
            <button type="button" role="tab" aria-selected={surface === "builder"} className={surface === "builder" ? "active" : ""} onClick={() => setSurface("builder")}><Hammer size={17} />Builder</button>
          </div>
        </section>
        <div role="tabpanel">{children}</div>
      </div>
    </Layout>
  );
}
