import { useQuery } from "convex/react";
import { useState } from "react";
import Link from "@/components/Link";
import { clanManagementDashboardQuery } from "@/lib/clanManagement";

export function ClanWarInsights({ tag }: { tag: string }) {
  const [now] = useState(() => Date.now());
  const dashboard = useQuery(clanManagementDashboardQuery, {
    tag: tag.replace(/^#/, "").toUpperCase(),
    now
  });

  if (dashboard === undefined) {
    return <section className="profile-section"><p className="empty-results">Loading observed River Race history…</p></section>;
  }
  if (dashboard === null || !dashboard.weeks.length) {
    return (
      <section className="profile-section management-war-callout">
        <div>
          <span className="management-kicker">Observed history</span>
          <h2>No weekly contribution baseline yet</h2>
          <p>Open the leader workspace to begin bounded roster and River Race observations for this clan.</p>
        </div>
        <Link href={`/clans/${tag}/manage`} className="management-button">Open leader workspace</Link>
      </section>
    );
  }

  const contributors = dashboard.members
    .filter((member) => member.warWeeksObserved > 0)
    .sort((a, b) => (b.participationConsistency ?? -1) - (a.participationConsistency ?? -1))
    .slice(0, 10);

  return (
    <section className="profile-section management-war-insights" aria-labelledby="observed-war-title">
      <div className="management-section-heading">
        <div>
          <span className="management-kicker">Across observed weeks</span>
          <h2 id="observed-war-title">Participation consistency</h2>
          <p>Completed weeks only. A member counts as participating when at least one deck was used.</p>
        </div>
        <Link href={`/clans/${tag}/manage`} className="management-button management-button-muted">Full leader workspace</Link>
      </div>
      {!contributors.length ? (
        <p className="empty-results">Completed weekly participant rows have not been observed yet.</p>
      ) : (
        <div className="management-consistency-grid">
          {contributors.map((member) => (
            <article key={member.tag}>
              <Link href={`/players/${member.tag}`}><strong>{member.name}</strong></Link>
              <span>{Math.round((member.participationConsistency ?? 0) * 100)}%</span>
              <div className="management-consistency-track" aria-hidden="true">
                <i style={{ width: `${Math.round((member.participationConsistency ?? 0) * 100)}%` }} />
              </div>
              <small>{member.warWeeksParticipated}/{member.warWeeksObserved} completed observed weeks · recent trend {member.fameTrend === null ? "—" : member.fameTrend > 0 ? `+${member.fameTrend}` : member.fameTrend}</small>
            </article>
          ))}
        </div>
      )}
      <p className="table-note">Only weeks and participants exposed by the official API during the 12-week retention window are included.</p>
    </section>
  );
}
