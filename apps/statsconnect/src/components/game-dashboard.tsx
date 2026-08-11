import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { GameDashboardFrame } from "@/components/dashboard/GameDashboardFrame";
import { LoadoutRow } from "@/components/dashboard/LoadoutRow";
import { ProfileHero } from "@/components/dashboard/ProfileHero";
import { RecentMatches } from "@/components/dashboard/RecentMatches";
import { RosterGrid } from "@/components/dashboard/RosterGrid";
import { SectionTabs, type DashboardSection } from "@/components/dashboard/SectionTabs";
import { StatGrid } from "@/components/dashboard/StatGrid";
import { UpcomingList } from "@/components/dashboard/UpcomingList";
import { ErrorState, LoadingState, PageStatus } from "@/components/ui-helpers";
import { Badge } from "@/components/ui/badge";
import type { ConnectedProfile } from "@/lib/contracts";
import { statsQueryOptions } from "@/lib/data-client";

export function GameDashboard({ profile }: { profile: ConnectedProfile }) {
  const statsQuery = useQuery(statsQueryOptions(profile.id));
  const [section, setSection] = useState<DashboardSection>("statistics");
  if (statsQuery.isPending) return <LoadingState label="Loading dashboard" />;
  if (statsQuery.isError) return <ErrorState title="Dashboard unavailable" detail={statsQuery.error.message} />;

  const result = statsQuery.data;
  const stats = result.data;
  return (
    <GameDashboardFrame game={stats.game}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow">Signal</span>
        <span className="h-px flex-1 bg-border" aria-hidden />
        {result.cache.state === "stale" ? <Badge variant="secondary">Showing cached data</Badge> : result.cache.state === "stub" ? <Badge variant="secondary">Sample backend data</Badge> : <Badge variant="secondary">Live · {new Date(result.cache.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Badge>}
      </div>
      <ProfileHero summary={stats.summary} />
      {stats.warnings.map((warning) => <PageStatus key={warning} tone="info">{warning}</PageStatus>)}
      {stats.game === "clash-royale" ? (
        <>
          <SectionTabs value={section} onValueChange={setSection} />
          {section === "statistics" ? <div className="space-y-10"><StatGrid metrics={stats.metrics} /><UpcomingList items={stats.upcoming} /></div> : null}
          {section === "battles" ? <RecentMatches matches={stats.recentMatches} /> : null}
          {section === "decks" ? <LoadoutRow items={stats.currentLoadout} /> : null}
          {section === "cards" ? <RosterGrid items={stats.roster} /> : null}
        </>
      ) : (
        <div className="space-y-10"><StatGrid metrics={stats.metrics} /><RecentMatches matches={stats.recentMatches} /><RosterGrid items={stats.roster} /></div>
      )}
    </GameDashboardFrame>
  );
}
