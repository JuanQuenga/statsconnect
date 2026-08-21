import Head from "@/components/Head";
import { useRouter } from "@/lib/router";
import { useEffect } from "react";
import { ClanChestProgress, ClanProfile, MemberTable } from "@/components/portfolio/ClanSections";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { Layout } from "@/components/portfolio/Layout";
import type { Clan } from "@/lib/clash/domain";
import { clan as mockClan } from "@/lib/mock-data";
import { isConvexConfigured } from "@/lib/convex";
import { useClanAcquisition } from "@/lib/clash/profileAcquisition";
import { DashboardSaveControls } from "@/components/personalization/PersonalDashboard";
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
  const clan = useClanAcquisition(tag);

  if (clan.isLoading) return <Layout><LoadingState label="clan" /></Layout>;
  if (clan.errorMessage) return <Layout><ErrorState message={clan.errorMessage} /></Layout>;
  if (!clan.data) return <Layout><ErrorState message="No clan data was returned." /></Layout>;
  return <ClanDashboard clan={clan.data} isRefreshing={clan.isRefreshing} onRefresh={clan.refresh} />;
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
        <title>{`${clan.name} | StatsConnect · Clash Royale statistics`}</title>
      </Head>
      <div className="profile-page clan-page">
        <ClanProfile clan={clan} />
        <DashboardSaveControls profile={{ kind: "clans", tag: clan.tag, name: clan.name }} />
        <ClanChestProgress clan={clan} />
        <MemberTable clan={clan} onRefresh={onRefresh} isRefreshing={isRefreshing} />
      </div>
    </Layout>
  );
}
