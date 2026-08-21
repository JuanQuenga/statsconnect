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
import type { Card } from "@/lib/clash/domain";
import { cards as localCards } from "@/lib/mock-data";
import { useI18n } from "@/lib/i18n";

type DeckSurface = "discover" | "war" | "builder";

export default function DecksPage() {
  return isConvexConfigured ? <LiveDeckExperience /> : <OfflineDeckExperience />;
}

function LiveDeckExperience() {
  const { locale, t } = useI18n();
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
    return <Layout><div className="data-state"><LoaderCircle className="state-spinner" size={38} /><h1>{t("deck.loading")}</h1><p>{locale === "es" ? "Sincronizando el catálogo antes de buscar mazos observados." : "Syncing the card catalog before matching observed decks."}</p></div></Layout>;
  }

  const cards = query.data ?? localCards;
  const catalogMessage = query.error ? `${locale === "es" ? "Catálogo en vivo no disponible" : "Live card catalog unavailable"}: ${errorMessage(query.error)}` : undefined;
  return (
    <DeckExperienceShell surface={surface} setSurface={setSurface}>
      <div hidden={surface !== "builder"}>
        <DeckBuilder
          cards={cards}
          source={query.data ? (locale === "es" ? "Catálogo en vivo de Clash Royale" : "Live Clash Royale card catalog") : (locale === "es" ? "Respaldo del catálogo local" : "Local catalog fallback")}
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
  const { locale } = useI18n();
  const router = useRouter();
  const [surface, setSurface] = useState<DeckSurface>(router.query.include || router.query.tool === "builder" ? "builder" : "discover");
  return (
    <DeckExperienceShell surface={surface} setSurface={setSurface}>
      <div hidden={surface !== "builder"}><DeckBuilder cards={localCards} source={locale === "es" ? "Catálogo local" : "Local catalog"} /></div>
      <div hidden={surface === "builder"}>
        <section className="profile-section discovery-results">
          <div className="discovery-empty"><ShieldCheck size={38} /><h2>{locale === "es" ? "Los datos de mazos observados no están conectados" : "Observed deck data is not connected"}</h2><p>{locale === "es" ? "El descubrimiento y las recomendaciones requieren una implementación de Convex configurada. El creador manual sigue disponible." : "Discovery and player recommendations require a configured Convex deployment. No demo win rates or synthetic recommendations are shown. The manual builder remains available."}</p><button type="button" className="pink-button" onClick={() => setSurface("builder")}>{locale === "es" ? "Abrir creador manual" : "Open manual builder"}</button></div>
        </section>
      </div>
    </DeckExperienceShell>
  );
}

function DeckExperienceShell({ surface, setSurface, children }: { surface: DeckSurface; setSurface: (surface: DeckSurface) => void; children: React.ReactNode }) {
  const { locale, t } = useI18n();
  return (
    <Layout>
      <Head><title>{locale === "es" ? "Descubrimiento y creador de mazos" : "Deck Discovery & Builder"} | StatsConnect · Clash Royale statistics</title><meta name="description" content={locale === "es" ? "Encuentra mazos observados, personaliza recomendaciones y crea conjuntos de guerra." : "Find observed Clash Royale decks, personalize recommendations from a player tag, build war sets, and copy decks into the game."} /><link rel="canonical" href="/decks" /></Head>
      <div className="decks-page discovery-page">
        <section className="decks-hero discovery-hero">
          <h1>{locale === "es" ? "Encuentra un mazo que encaje" : "Find a deck that fits"}</h1>
          <p>{locale === "es" ? "Busca mazos observados, considera tu colección, arma un conjunto de guerra válido o crea libremente." : "Search real observed decks, account for your collection, assemble a valid four-deck war set, or build freely from the card catalog."}</p>
          <div className="deck-surface-tabs" role="tablist" aria-label={t("deck.title")}>
            <button type="button" role="tab" aria-selected={surface === "discover"} className={surface === "discover" ? "active" : ""} onClick={() => setSurface("discover")}><Search size={17} />{locale === "es" ? "Descubrir" : "Discover"}</button>
            <button type="button" role="tab" aria-selected={surface === "war"} className={surface === "war" ? "active" : ""} onClick={() => setSurface("war")}><ShieldCheck size={17} />{locale === "es" ? "Guerra" : "War set"}</button>
            <button type="button" role="tab" aria-selected={surface === "builder"} className={surface === "builder" ? "active" : ""} onClick={() => setSurface("builder")}><Hammer size={17} />{t("deck.title")}</button>
          </div>
        </section>
        <div role="tabpanel">{children}</div>
      </div>
    </Layout>
  );
}
