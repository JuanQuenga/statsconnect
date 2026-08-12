import Head from "@/components/Head";
import { useRouter } from "@/lib/router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { ClanChestProgress, ClanProfile, MemberTable } from "@/components/portfolio/ClanSections";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { Layout } from "@/components/portfolio/Layout";
import { clan as mockClan, type Clan } from "@/lib/mock-data";
import { clanBundleAction, errorMessage, isConvexConfigured } from "@/lib/convex";
import { mapClanBundle } from "@/lib/clash/mappers";
import { TrackingControls } from "@/components/personalization/PersonalDashboard";
import { usePersonalization } from "@/components/personalization/PersonalizationProvider";

export default function ClanPage() {
  const router = useRouter();
  const tag = typeof router.query.tag === "string" ? router.query.tag : "";

  if (!router.isReady) return <Layout><LoadingState label="clan" /></Layout>;
  if (tag.toUpperCase() === "CCDEMO") return <ClanDashboard clan={mockClan} />;
  if (!isConvexConfigured) return <Layout><SetupState feature="clan profiles" /></Layout>;
  return <LiveClan tag={tag} />;
}

function LiveClan({ tag }: { tag: string }) {
  const getClanBundle = useAction(clanBundleAction);
  const [refreshKey, setRefreshKey] = useState(0);
  const query = useQuery({
    queryKey: ["clan", tag, refreshKey],
    queryFn: async () => mapClanBundle(await getClanBundle({ tag, force: refreshKey > 0 })),
    placeholderData: (previous) => previous,
    retry: false
  });

  if (query.isLoading) return <Layout><LoadingState label="clan" /></Layout>;
  if (query.error) return <Layout><ErrorState message={errorMessage(query.error)} /></Layout>;
  if (!query.data) return <Layout><ErrorState message="No clan data was returned." /></Layout>;
  return <ClanDashboard clan={query.data} isRefreshing={query.isFetching} onRefresh={() => setRefreshKey((value) => value + 1)} />;
}

function ClanDashboard({ clan, isRefreshing = false, onRefresh = () => undefined }: { clan: Clan; isRefreshing?: boolean; onRefresh?: () => void }) {
  const personalization = usePersonalization();
  useEffect(() => {
    if (!clan.tag) return;
    void personalization.remember({ kind: "clans", tag: clan.tag, name: clan.name }).catch(() => undefined);
    void personalization.observe({ kind: "clans", tag: clan.tag, name: clan.name, warTrophies: clan.warTrophies }).catch(() => undefined);
  }, [clan.tag, clan.name, clan.warTrophies]);

  return (
    <Layout>
      <Head>
        <title>{`${clan.name} | Clash Crown`}</title>
      </Head>
      <div className="profile-page clan-page">
        <ClanProfile clan={clan} />
        <TrackingControls profile={{ kind: "clans", tag: clan.tag, name: clan.name }} />
        <ClanChestProgress clan={clan} />
        <MemberTable clan={clan} onRefresh={onRefresh} isRefreshing={isRefreshing} />
      </div>
    </Layout>
  );
}
