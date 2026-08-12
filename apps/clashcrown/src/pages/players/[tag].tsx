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
import { player as mockPlayer, type Player } from "@/lib/mock-data";
import { errorMessage, isConvexConfigured, playerBundleAction } from "@/lib/convex";
import { mapPlayerBundle } from "@/lib/clash/mappers";
import { rememberProfile } from "@/lib/recentProfiles";

export default function PlayerPage() {
  const router = useRouter();
  const tag = typeof router.query.tag === "string" ? router.query.tag : "";

  if (!router.isReady) return <Layout><LoadingState label="player" /></Layout>;
  if (tag.toUpperCase() === "CCDEMO") return <PlayerDashboard player={mockPlayer} />;
  if (!isConvexConfigured) return <Layout><SetupState feature="player profiles" /></Layout>;
  return <LivePlayer tag={tag} />;
}

function LivePlayer({ tag }: { tag: string }) {
  const getPlayerBundle = useAction(playerBundleAction);
  const [refreshKey, setRefreshKey] = useState(0);
  const query = useQuery({
    queryKey: ["player", tag, refreshKey],
    queryFn: async () => mapPlayerBundle(await getPlayerBundle({ tag, force: refreshKey > 0 })),
    placeholderData: (previous) => previous,
    retry: false
  });

  if (query.isLoading) return <Layout><LoadingState label="player" /></Layout>;
  if (query.error) return <Layout><ErrorState message={errorMessage(query.error)} /></Layout>;
  if (!query.data) return <Layout><ErrorState message="No player data was returned." /></Layout>;

  return <PlayerDashboard player={query.data} isRefreshing={query.isFetching} onRefresh={() => setRefreshKey((value) => value + 1)} />;
}

function PlayerDashboard({ player, isRefreshing = false, onRefresh = () => undefined }: { player: Player; isRefreshing?: boolean; onRefresh?: () => void }) {
  const [activeTab, setActiveTab] = useState<PlayerTab>("Statistics");

  // Visiting a profile is what teaches this browser the player's name, so the
  // next lookup can be by name instead of by tag.
  useEffect(() => {
    if (player.tag) rememberProfile({ kind: "players", tag: player.tag, name: player.name });
  }, [player.tag, player.name]);

  return (
    <Layout>
      <Head>
        <title>{`${player.name} | Clash Crown`}</title>
      </Head>
      <div className="profile-page">
        <PlayerHero player={player} />
        <PlayerTabs active={activeTab} onChange={setActiveTab} />
        {activeTab === "Statistics" ? (
          <>
            <PlayerStats player={player} onRefresh={onRefresh} isRefreshing={isRefreshing} />
            <PerformanceSection battles={player.battles} />
            <ProgressionChart player={player} />
            <PathOfLegendsSeasons player={player} />
          </>
        ) : null}
        {activeTab === "Battles" ? <BattleHistory battles={player.battles} playerName={player.name} /> : null}
        {activeTab === "Decks" ? <><DeckAnalyticsSection battles={player.battles} /><DeckOverview cards={player.deck} supportCards={player.supportCards} /></> : null}
        {activeTab === "Cards" ? (
          <>
            <div className="section-heading compact-heading">
              <span />
              <Link href={`/players/${player.tag.replace(/^#/, "")}/upgrades`} className="pink-button">Upgrade Planner</Link>
              <span />
            </div>
            <CardCollection cards={player.cards} />
          </>
        ) : null}
        <ChestList chests={player.chests} />
      </div>
    </Layout>
  );
}
