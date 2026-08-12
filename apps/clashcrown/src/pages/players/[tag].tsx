import Head from "@/components/Head";
import Link from "@/components/Link";
import { useRouter } from "@/lib/router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { Layout } from "@/components/portfolio/Layout";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { BattleHistory, CardCollection, ChestList, DeckAnalyticsSection, DeckOverview, PathOfLegendsSeasons, PerformanceSection, PlayerHero, PlayerStats, PlayerTabs, ProgressionChart, type PlayerTab } from "@/components/portfolio/PlayerSections";
import { player as mockPlayer, type Player } from "@/lib/mock-data";
import { errorMessage, isConvexConfigured, playerBundleAction } from "@/lib/convex";
import { mapPlayerBundle } from "@/lib/clash/mappers";
import { TrackingControls } from "@/components/personalization/PersonalDashboard";
import { usePersonalization } from "@/components/personalization/PersonalizationProvider";

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
        <title>{`${player.name} | Clash Crown`}</title>
      </Head>
      <div className="profile-page">
        <PlayerHero player={player} />
        <TrackingControls profile={{ kind: "players", tag: player.tag, name: player.name, clan: player.clan }} />
        <PlayerTabs active={activeTab} onChange={setActiveTab} />
        {activeTab === "Statistics" ? (
          <>
            <PlayerStats player={player} onRefresh={onRefresh} isRefreshing={isRefreshing} />
            <PerformanceSection battles={player.battles} />
            <ProgressionChart player={player} />
            <PathOfLegendsSeasons player={player} />
          </>
        ) : null}
        {activeTab === "Battles" ? <BattleHistory battles={player.battles} /> : null}
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
