import { useQuery as useAsyncQuery } from "@tanstack/react-query";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import Head from "@/components/Head";
import { ClanManagementDashboard } from "@/components/clans/ClanManagementDashboard";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { Layout } from "@/components/portfolio/Layout";
import { errorMessage, isConvexConfigured } from "@/lib/convex";
import { clanManagementDashboardQuery, observeClanManagementAction } from "@/lib/clanManagement";

export default function ClanManagePage() {
  const params = useParams({ strict: false }) as { tag?: string };
  const tag = params.tag ?? "";

  if (!isConvexConfigured) {
    return <Layout><SetupState feature="clan management observations" /></Layout>;
  }
  if (!tag) {
    return <Layout><ErrorState message="A clan tag is required for the management view." /></Layout>;
  }
  return <LiveClanManagement tag={tag.replace(/^#/, "").toUpperCase()} />;
}

function LiveClanManagement({ tag }: { tag: string }) {
  const [now] = useState(() => Date.now());
  const observe = useAction(observeClanManagementAction);
  const observation = useAsyncQuery({
    queryKey: ["clan-management-observation", tag],
    queryFn: () => observe({ tag }),
    retry: false,
    staleTime: 5 * 60 * 1_000
  });
  const dashboard = useQuery(clanManagementDashboardQuery, { tag, now });

  if (dashboard === undefined && observation.isPending) {
    return <Layout><LoadingState label="clan management baseline" /></Layout>;
  }
  if (observation.error && !dashboard) {
    return <Layout><ErrorState message={errorMessage(observation.error)} /></Layout>;
  }
  if (dashboard === undefined || dashboard === null) {
    return <Layout><LoadingState label="first roster observation" /></Layout>;
  }

  return (
    <Layout>
      <Head><title>{`${dashboard.clan.name ?? `#${tag}`} Management | Royale Stats`}</title></Head>
      <div className="profile-page management-page">
        <ClanManagementDashboard
          data={dashboard}
          observing={observation.isFetching}
          onObserve={() => { void observation.refetch(); }}
        />
      </div>
    </Layout>
  );
}
