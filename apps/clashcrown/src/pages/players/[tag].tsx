import Head from "@/components/Head";
import Link from "@/components/Link";
import { useRouter } from "@/lib/router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/portfolio/Layout";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { BattleHistory } from "@/components/portfolio/BattleLog";
import { CardCollection, ChestList, DeckAnalyticsSection, DeckOverview, PathOfLegendsSeasons, PerformanceSection, PlayerHero, PlayerStats, PlayerTabs, ProgressionChart, type PlayerTab } from "@/components/portfolio/PlayerSections";
import { PlayerAchievementsSection, PlayerBadgeSection, PlayerProfileDetails } from "@/components/portfolio/PlayerProfileSections";
import type { Card, Player } from "@/lib/clash/domain";
import { player as mockPlayer } from "@/lib/mock-data";
import { isConvexConfigured } from "@/lib/convex";
import { usePlayerAcquisition } from "@/lib/clash/profileAcquisition";
import { useCardLibrary } from "@/lib/useCardCatalog";
import { TrackingControls } from "@/components/personalization/PersonalDashboard";
import { usePersonalization } from "@/components/personalization/PersonalizationProvider";
import { useI18n } from "@/lib/i18n";
import { PlayerActivity } from "@/components/portfolio/PlayerActivity";

export default function PlayerPage() {
  const router = useRouter();
  const tag = typeof router.query.tag === "string" ? router.query.tag : "";

  if (!router.isReady) return <Layout><LoadingState label="player" /></Layout>;
  if (tag.toUpperCase() === "CCDEMO") return <PlayerDashboard player={mockPlayer} isDemo />;
  if (!isConvexConfigured) return <Layout><SetupState feature="player profiles" /></Layout>;
  return <LivePlayer tag={tag} />;
}

function LivePlayer({ tag }: { tag: string }) {
  const { locale } = useI18n();
  const cardLibrary = useCardLibrary();
  const player = usePlayerAcquisition(tag);

  if (player.isLoading) return <Layout><LoadingState label="player" /></Layout>;
  if (player.errorMessage) return <Layout><ErrorState message={player.errorMessage} /></Layout>;
  if (!player.data) return <Layout><ErrorState message={locale === "es" ? "No se recibieron datos del jugador." : "No player data was returned."} /></Layout>;

  return (
    <PlayerDashboard
      player={player.data}
      isRefreshing={player.isRefreshing}
      onRefresh={player.refresh}
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
  catalogError = false,
  isDemo = false,
}: {
  player: Player;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  catalogCards?: Card[];
  catalogLoading?: boolean;
  catalogError?: boolean;
  isDemo?: boolean;
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<PlayerTab>("Statistics");
  const personalization = usePersonalization();

  // Visiting a profile is what teaches this browser the player's name, so the
  // next lookup can be by name instead of by tag.
  useEffect(() => {
    if (isDemo || !player.tag) return;
    void personalization.remember({ kind: "players", tag: player.tag, name: player.name, clan: player.clan }).catch(() => undefined);
    void personalization.observe({
      kind: "players",
      tag: player.tag,
      name: player.name,
      trophies: player.trophies,
      chestName: player.chests[0]?.name,
      chestIndex: player.chests[0]?.index,
    }).catch(() => undefined);
  }, [isDemo, player.tag, player.name, player.clan, player.trophies, player.chests]);

  return (
    <Layout>
      <Head>
        <title>{`${player.name} | StatsConnect · Clash Royale statistics`}</title>
      </Head>
      <div className="profile-page">
        <PlayerHero
          player={player}
          actions={isDemo ? null : <TrackingControls profile={{ tag: player.tag, name: player.name }} />}
        />
        <PlayerTabs active={activeTab} onChange={setActiveTab} />
        {activeTab === "Statistics" ? (
          <div className="profile-story">
            <PlayerStats player={player} onRefresh={onRefresh} isRefreshing={isRefreshing} />
            <PlayerActivity player={player} isDemo={isDemo} />
            <PerformanceSection battles={player.battles} />
            <PlayerProfileDetails player={player} />
            <ProgressionChart player={player} />
            <PathOfLegendsSeasons player={player} />
            <section className="history-callout">
              <div>
                <h2>Profile history</h2>
                <p>See when trophies, deck, clan, and collection totals changed across observed profile checks.</p>
              </div>
              <Link href={`/players/${player.tag.replace(/^#/, "")}/history`} className="pink-button">Open history</Link>
            </section>
            <PlayerBadgeSection badges={player.badges} />
            <PlayerAchievementsSection achievements={player.achievements} />
          </div>
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
        {activeTab === "Chests" ? <div className="profile-story profile-story-single"><ChestList chests={player.chests} /></div> : null}
      </div>
    </Layout>
  );
}
