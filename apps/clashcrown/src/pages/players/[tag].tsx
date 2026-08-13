import Head from "@/components/Head";
import Link from "@/components/Link";
import { useRouter } from "@/lib/router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { Layout } from "@/components/portfolio/Layout";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { BattleHistory } from "@/components/portfolio/BattleLog";
import { CardCollection, ChestList, DeckAnalyticsSection, DeckOverview, PathOfLegendsSeasons, PerformanceSection, PlayerHero, PlayerStats, PlayerTabs, ProgressionChart, type PlayerTab } from "@/components/portfolio/PlayerSections";
import { PlayerAchievementsSection, PlayerBadgeSection, PlayerProfileDetails } from "@/components/portfolio/PlayerProfileSections";
import { player as mockPlayer, type Player } from "@/lib/mock-data";
import { errorMessage, isConvexConfigured, playerBundleAction } from "@/lib/convex";
import { mapPlayerBundle } from "@/lib/clash/mappers";
import { rememberProfile } from "@/lib/recentProfiles";
import { useCardLibrary } from "@/lib/useCardCatalog";
import type { Card } from "@/lib/mock-data";
import { TrackingControls } from "@/components/personalization/PersonalDashboard";
import { usePersonalization } from "@/components/personalization/PersonalizationProvider";
import { useI18n } from "@/lib/i18n";

export default function PlayerPage() {
  const router = useRouter();
  const tag = typeof router.query.tag === "string" ? router.query.tag : "";

  if (!router.isReady) return <Layout><LoadingState label="player" /></Layout>;
  if (tag.toUpperCase() === "CCDEMO") return <PlayerDashboard player={mockPlayer} />;
  if (!isConvexConfigured) return <Layout><SetupState feature="player profiles" /></Layout>;
  return <LivePlayer tag={tag} />;
}

function LivePlayer({ tag }: { tag: string }) {
  const { locale } = useI18n();
  const getPlayerBundle = useAction(playerBundleAction);
  const cardLibrary = useCardLibrary();
  const [refreshKey, setRefreshKey] = useState(0);
  const query = useQuery({
    queryKey: ["player", tag, refreshKey],
    queryFn: async () => mapPlayerBundle(await getPlayerBundle({ tag, force: refreshKey > 0 })),
    placeholderData: (previous) => previous,
    retry: false
  });

  if (query.isLoading) return <Layout><LoadingState label="player" /></Layout>;
  if (query.error) return <Layout><ErrorState message={errorMessage(query.error)} /></Layout>;
  if (!query.data) return <Layout><ErrorState message={locale === "es" ? "No se recibieron datos del jugador." : "No player data was returned."} /></Layout>;

  return (
    <PlayerDashboard
      player={query.data}
      isRefreshing={query.isFetching}
      onRefresh={() => setRefreshKey((value) => value + 1)}
      catalogCards={cardLibrary.cards}
      catalogLoading={cardLibrary.isLoading}
      catalogError={Boolean(cardLibrary.error)}
    />
  );
}

function PlayerDashboard({
  player,
  isRefreshing = false,
  onRefresh = () => undefined,
  catalogCards,
  catalogLoading = false,
  catalogError = false
}: {
  player: Player;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  catalogCards?: Card[];
  catalogLoading?: boolean;
  catalogError?: boolean;
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<PlayerTab>("Statistics");
  const personalization = usePersonalization();

  // Visiting a profile is what teaches this browser the player's name, so the
  // next lookup can be by name instead of by tag.
  useEffect(() => {
    if (!player.tag) return;
    void personalization.remember({ kind: "players", tag: player.tag, name: player.name, clan: player.clan }).catch(() => undefined);
    void personalization.observe({
      kind: "players",
      tag: player.tag,
      name: player.name,
      trophies: player.trophies,
      chestName: player.chests[0]?.name,
      chestIndex: player.chests[0]?.index,
    }).catch(() => undefined);
  }, [player.tag, player.name, player.clan, player.trophies, player.chests]);

  return (
    <Layout>
      <Head>
        <title>{`${player.name} | Royale Stats`}</title>
      </Head>
      <div className="profile-page">
        <PlayerHero
          player={player}
          actions={<TrackingControls profile={{ kind: "players", tag: player.tag, name: player.name, clan: player.clan }} />}
        />
        <PlayerTabs active={activeTab} onChange={setActiveTab} />
        {activeTab === "Statistics" ? (
          <>
            <PlayerStats player={player} onRefresh={onRefresh} isRefreshing={isRefreshing} />
            <PlayerProfileDetails player={player} />
            <PlayerBadgeSection badges={player.badges} />
            <PlayerAchievementsSection achievements={player.achievements} />
            <PerformanceSection battles={player.battles} />
            <ProgressionChart player={player} />
            <PathOfLegendsSeasons player={player} />
            <section className="history-callout">
              <div>
                <span className="eyebrow">Royale Stats observed</span>
                <h2>Profile history</h2>
                <p>Review timestamped trophy, Path, collection, deck, clan, and profile-total changes without treating gaps as continuous tracking.</p>
              </div>
              <Link href={`/players/${player.tag.replace(/^#/, "")}/history`} className="pink-button">Open history</Link>
            </section>
          </>
        ) : null}
        {activeTab === "Battles" ? <BattleHistory battles={player.battles} playerName={player.name} /> : null}
        {activeTab === "Decks" ? <><DeckAnalyticsSection battles={player.battles} /><DeckOverview cards={player.deck} supportCards={player.supportCards} /></> : null}
        {activeTab === "Cards" ? (
          <>
            <div className="section-heading compact-heading">
              <span />
              <Link href={`/players/${player.tag.replace(/^#/, "")}/upgrades`} className="pink-button">{t("player.upgradePlanner")}</Link>
              <span />
            </div>
            <CardCollection player={player} catalogCards={catalogCards} catalogLoading={catalogLoading} catalogError={catalogError} />
          </>
        ) : null}
        <ChestList chests={player.chests} />
      </div>
    </Layout>
  );
}
