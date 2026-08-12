import { ArrowDown, ArrowUp, CalendarClock, RefreshCcw, Search, ShieldAlert, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "@/components/Link";
import { ClanNotifications } from "@/components/clans/ClanNotifications";
import type { ClanAttention, ClanManagementDashboard as DashboardData, ClanManagementMember } from "@/lib/clanManagement";

type SortKey = "attention" | "trophies" | "donations" | "inactivity" | "consistency" | "fameTrend";
type SignalFilter = "all" | "recognition" | "checkIn" | "none";

const sortLabels: Record<SortKey, string> = {
  attention: "Attention signals",
  trophies: "Trophies",
  donations: "Donation change",
  inactivity: "Inactivity",
  consistency: "War consistency",
  fameTrend: "War fame trend"
};

function attentionRank(attention: ClanAttention): number {
  if (attention === "checkIn") return 2;
  if (attention === "recognition") return 1;
  return 0;
}

function sortValue(member: ClanManagementMember, key: SortKey): number {
  if (key === "attention") return attentionRank(member.attention);
  if (key === "trophies") return member.trophies;
  if (key === "donations") return member.donationChange;
  if (key === "inactivity") return member.inactivityDays ?? -1;
  if (key === "consistency") return member.participationConsistency ?? -1;
  return member.fameTrend ?? Number.NEGATIVE_INFINITY;
}

function formatDate(value: number | null): string {
  if (value === null) return "Not observed yet";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function formatPercent(value: number | null): string {
  return value === null ? "Not enough data" : `${Math.round(value * 100)}%`;
}

function signed(value: number | null): string {
  if (value === null) return "—";
  return value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
}

export function ClanManagementDashboard({
  data,
  observing,
  onObserve
}: {
  data: DashboardData;
  observing: boolean;
  onObserve: () => void;
}) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [signal, setSignal] = useState<SignalFilter>("all");
  const [sort, setSort] = useState<SortKey>("attention");
  const [descending, setDescending] = useState(true);

  const roles = useMemo(() => [...new Set(data.members.map((member) => member.role))].sort(), [data.members]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.members
      .filter((member) => !needle || member.name.toLowerCase().includes(needle) || member.tag.toLowerCase().includes(needle))
      .filter((member) => role === "all" || member.role === role)
      .filter((member) => signal === "all" || (signal === "none" ? member.attention === null : member.attention === signal))
      .sort((left, right) => {
        const difference = sortValue(right, sort) - sortValue(left, sort);
        return (descending ? difference : -difference) || left.name.localeCompare(right.name);
      });
  }, [data.members, descending, role, search, signal, sort]);

  const recognitionCount = data.members.filter((member) => member.attention === "recognition").length;
  const checkInCount = data.members.filter((member) => member.attention === "checkIn").length;
  const activeRecently = data.members.filter((member) => member.inactivityDays !== null && member.inactivityDays < 3).length;
  const clanName = data.clan.name ?? `#${data.clan.tag}`;

  return (
    <>
      <section className="management-overview" aria-labelledby="management-title">
        <div className="management-overview-copy">
          <span className="management-kicker">Clan leader workspace · #{data.clan.tag}</span>
          <h1 id="management-title">{clanName} management</h1>
          <p>
            Decisions stay with your clan. Signals below only explain changes observed by Clash Crown; they are not official
            Supercell recommendations and cannot see chat, conduct, or leadership context.
          </p>
          <div className="management-actions">
            <Link href={`/clans/${data.clan.tag}`} className="management-button management-button-muted">Clan profile</Link>
            <Link href={`/clans/${data.clan.tag}/war`} className="management-button management-button-muted">River Race</Link>
            <button type="button" className="management-button" onClick={onObserve} disabled={observing}>
              <RefreshCcw size={17} className={observing ? "spin" : undefined} aria-hidden="true" />
              {observing ? "Checking…" : "Check for an observation"}
            </button>
          </div>
        </div>
        <div className="management-observation-card">
          <CalendarClock size={22} aria-hidden="true" />
          <strong>{data.clan.observationCount.toLocaleString()} observations</strong>
          <span>Latest: {formatDate(data.clan.lastObservedAt)}</span>
          <span>Next scheduled check: {formatDate(data.clan.nextObservationAt)}</span>
          <small>At most once every 6 hours per clan. History is retained for 12 weeks.</small>
        </div>
      </section>

      {data.clan.lastError ? (
        <div className="management-warning" role="status">
          <ShieldAlert size={18} aria-hidden="true" />
          <span><strong>The latest scheduled check failed.</strong> {data.clan.lastError} Existing observations remain available.</span>
        </div>
      ) : null}

      <section className="management-metrics" aria-label="Observed clan summary">
        <Metric icon={<Users aria-hidden="true" />} label="Current roster" value={data.members.length.toLocaleString()} detail="From the latest successful observation" />
        <Metric icon={<Sparkles aria-hidden="true" />} label="Promotion attention" value={recognitionCount.toLocaleString()} detail="Observed consistency and donation context" />
        <Metric icon={<ShieldAlert aria-hidden="true" />} label="Demotion attention" value={checkInCount.toLocaleString()} detail="Inactivity or low observed war participation" />
        <Metric icon={<CalendarClock aria-hidden="true" />} label="Seen in last 3 days" value={activeRecently.toLocaleString()} detail="Based only on API last-seen timestamps" />
      </section>

      <ClanNotifications tag={data.clan.tag} name={clanName} events={data.events} />

      <section className="profile-section management-roster" aria-labelledby="roster-title">
        <div className="management-section-heading">
          <div>
            <span className="management-kicker">Explainable signals</span>
            <h2 id="roster-title">Roster attention</h2>
            <p>Donation and trophy changes cover the interval between the two latest successful observations, not a guaranteed full week.</p>
          </div>
          <span className="management-result-count" aria-live="polite">{filtered.length} of {data.members.length} members</span>
        </div>

        <div className="management-filters">
          <label className="management-search">
            <span className="sr-only">Search roster</span>
            <Search size={16} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or tag" />
          </label>
          <label>
            <span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="all">All roles</option>
              {roles.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Signal</span>
            <select value={signal} onChange={(event) => setSignal(event.target.value as SignalFilter)}>
              <option value="all">All signals</option>
              <option value="recognition">Promotion attention</option>
              <option value="checkIn">Demotion attention</option>
              <option value="none">No signal</option>
            </select>
          </label>
          <label>
            <span>Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              {(Object.keys(sortLabels) as SortKey[]).map((key) => <option key={key} value={key}>{sortLabels[key]}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="management-sort-direction"
            onClick={() => setDescending((value) => !value)}
            aria-label={`Sort ${descending ? "ascending" : "descending"}`}
          >
            {descending ? <ArrowDown size={16} aria-hidden="true" /> : <ArrowUp size={16} aria-hidden="true" />}
            {descending ? "High first" : "Low first"}
          </button>
        </div>

        {!data.members.length ? (
          <p className="empty-results">No roster was returned in the latest successful observation.</p>
        ) : !filtered.length ? (
          <p className="empty-results">No members match the current filters.</p>
        ) : (
          <div className="members-table-wrap">
            <table className="members-table management-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Last seen</th>
                  <th>Trophies</th>
                  <th>Donations Δ</th>
                  <th>War consistency</th>
                  <th>Recent war</th>
                  <th>Attention</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => <MemberRow key={member.tag} member={member} />)}
              </tbody>
            </table>
          </div>
        )}
        <p className="table-note">
          Completed River Race weeks assume 16 available decks (4 per battle day). Current-week unused decks are not called
          “missed” because the day may still be in progress. Consistency uses only completed weeks where the API listed that member.
        </p>
      </section>

      <section className="profile-section management-activity" aria-labelledby="activity-title">
        <div className="management-section-heading">
          <div>
            <span className="management-kicker">Consecutive observations</span>
            <h2 id="activity-title">Roster activity</h2>
          </div>
          <span className="management-result-count">Latest 100 retained events</span>
        </div>
        {!data.events.length ? (
          <p className="empty-results">
            No changes have been detected yet. The first observation establishes a baseline; joins, leaves, role changes, and
            seven-day inactivity crossings appear after later observations.
          </p>
        ) : (
          <ol className="management-timeline">
            {data.events.map((event) => (
              <li key={event.id}>
                <span className={`management-event-dot management-event-${event.kind}`} aria-hidden="true" />
                <div>
                  <strong>{event.summary}</strong>
                  <p>{event.detail}</p>
                </div>
                <time dateTime={new Date(event.observedAt).toISOString()}>{formatDate(event.observedAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="management-window-note">
        Observation window: {formatDate(data.observationWindow.firstObservedAt)} to {formatDate(data.observationWindow.lastObservedAt)}.
        {" "}{data.observationWindow.snapshotsRead} retained clan snapshots were read for this view.
      </p>
    </>
  );
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <article>
      <span>{icon}</span>
      <div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div>
    </article>
  );
}

function MemberRow({ member }: { member: ClanManagementMember }) {
  const signalLabel = member.attention === "recognition" ? "Promotion attention" : member.attention === "checkIn" ? "Demotion attention" : "No signal";
  return (
    <tr>
      <td>
        <Link href={`/players/${member.tag}`} className="management-member"><strong>{member.name}</strong><span>#{member.tag}</span></Link>
      </td>
      <td>{member.role}</td>
      <td>{member.inactivityDays === null ? "Unavailable" : member.inactivityDays === 0 ? "Today" : `${member.inactivityDays}d ago`}</td>
      <td><strong>{member.trophies.toLocaleString()}</strong> <Delta value={member.trophyChange} /></td>
      <td><strong>{signed(member.donationChange)}</strong><small className="management-cell-note">{member.donations.toLocaleString()} total now</small></td>
      <td><strong>{formatPercent(member.participationConsistency)}</strong><small className="management-cell-note">{member.warWeeksParticipated}/{member.warWeeksObserved} completed observed weeks</small></td>
      <td>
        <strong>{member.recentFame === null ? "No data" : `${member.recentFame.toLocaleString()} fame`}</strong>
        <small className="management-cell-note">
          {member.recentDecksUsed ?? "—"} decks · {member.recentBoatAttacks ?? "—"} boat attacks · {member.recentRepairPoints ?? "—"} repair
        </small>
        <small className="management-cell-note">Fame trend {signed(member.fameTrend)} · {member.recentMissedDecks ?? "—"} missed in latest completed week</small>
      </td>
      <td>
        <span className={`management-signal management-signal-${member.attention ?? "none"}`}>{signalLabel}</span>
        {member.attentionReasons.length ? (
          <details className="management-reasons"><summary>Why?</summary><ul>{member.attentionReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>
        ) : null}
      </td>
    </tr>
  );
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <small className="management-delta management-delta-flat">±0</small>;
  return <small className={`management-delta ${value > 0 ? "management-delta-up" : "management-delta-down"}`}>{signed(value)}</small>;
}
