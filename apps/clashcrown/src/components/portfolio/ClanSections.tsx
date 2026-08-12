import Image from "@/components/Image";
import Link from "@/components/Link";
import { RefreshCcw, Settings2, Swords, User } from "lucide-react";
import { RankCell } from "@/components/portfolio/DataTable";
import { relativeTime } from "@/lib/clash/format";
import type { Clan } from "@/lib/mock-data";

export function ClanProfile({ clan }: { clan: Clan }) {
  return (
    <section className="clan-hero">
      <Image src={clan.badge} alt="" width={74} height={92} priority />
      <h1>{clan.name}</h1>
      <strong>
        #{clan.tag} <span>TYPE: {(clan.type ?? "Unknown").toUpperCase()}</span>
        {clan.location ? <span>{clan.location.toUpperCase()}</span> : null}
      </strong>
      <p>{clan.description}</p>
      <div className="clan-summary">
        <Summary icon="/images/icons/trophy.png" value={clan.score.toLocaleString()} label="Clan Trophies" />
        <Summary icon="/images/icons/trophy.png" value={(clan.requiredTrophies ?? 0).toLocaleString()} label="Required Trophies" />
        <Summary icon="/images/icons/cardsq.png" value={clan.donations.toLocaleString()} label="Donations / Week" />
        <Summary icon={clan.warBadge} value={clan.warTrophies.toLocaleString()} label={clan.warLeague ?? "War Trophies"} />
      </div>
      <div className="clan-hero-actions">
        <Link href={`/clans/${clan.tag}/war`} className="pink-button">
          <Swords size={17} /> Clan war
        </Link>
        {clan.fetchedAt ? (
          <Link href={`/clans/${clan.tag}/manage`} className="management-button management-button-muted">
            <Settings2 size={17} /> Leader workspace
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function ClanChestProgress({ clan }: { clan: Clan }) {
  const memberProgress = Math.min(100, (clan.members.length / 50) * 100);
  const donationProgress = Math.min(100, (clan.donations / 40_000) * 100);
  const warProgress = Math.min(100, (clan.warTrophies / 5000) * 100);
  return (
    <section className="clan-progress profile-section">
      <h2>Clan Pulse</h2>
      <div className="progress-columns">
        <ProgressItem icon={clan.badge} label={`${clan.members.length} members`} total="/ 50" progress={memberProgress} />
        <ProgressItem icon="/images/icons/book.png" label={`${clan.donations.toLocaleString()} donated`} total="this week" progress={donationProgress} />
        <ProgressItem icon="/images/icons/trophy.png" label={`${clan.warTrophies.toLocaleString()} war trophies`} total="live" progress={warProgress} />
      </div>
    </section>
  );
}

export function MemberTable({ clan, onRefresh, isRefreshing }: { clan: Clan; onRefresh: () => void; isRefreshing: boolean }) {
  return (
    <section className="profile-section member-section">
      <div className="section-heading">
        <span className="filter-button static">Trophies</span>
        <h2>Clan Members</h2>
        <div className="update-tools"><span>{updatedLabel(clan.fetchedAt)}</span><button type="button" onClick={onRefresh} disabled={isRefreshing}><RefreshCcw className={isRefreshing ? "spin" : ""} size={16} />{isRefreshing ? "Refreshing" : "Refresh"}</button></div>
      </div>
      <div className="members-table-wrap">
        <table className="members-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Name</th>
              {/* Not "Level": /clans returns expLevel: 0 for every member, so
                  the column was fifty identical zeroes. lastSeen is populated
                  and is the field a leader actually reads down the roster. */}
              <th>Last seen</th>
              <th>Trophies</th>
              <th>Donations</th>
              <th>Received</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {clan.members.map((member, index) => (
              <tr key={member.tag ?? member.name}>
                <td><RankCell rank={member.rank ?? index + 1} previousRank={member.previousRank} /></td>
                <td>{member.tag ? <Link href={`/players/${member.tag}`}><strong>{member.name}</strong></Link> : <strong>{member.name}</strong>}</td>
                <td><span className="table-lastseen">{relativeTime(member.lastSeen)}</span></td>
                <td><Image src="/images/icons/trophy.png" alt="" width={25} height={25} /> <strong>{member.trophies}</strong></td>
                <td><Image src="/images/icons/book.png" alt="" width={22} height={25} />{member.donations}</td>
                <td>{member.donationsReceived ?? "—"}</td>
                <td><User size={20} />{member.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-note">Showing all {clan.members.length} members returned by the live clan API.</p>
    </section>
  );
}

function Summary({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="summary-tile">
      <Image src={icon} alt="" width={36} height={36} />
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ProgressItem({ icon, label, total, progress }: { icon: string; label: string; total: string; progress: number }) {
  return (
    <div className="progress-item">
      <Image src={icon} alt="" width={58} height={58} />
      <strong>{label} <span>{total}</span></strong>
      <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

function updatedLabel(fetchedAt?: number) {
  if (!fetchedAt) return "demo data";
  const minutes = Math.max(0, Math.floor((Date.now() - fetchedAt) / 60_000));
  return minutes < 1 ? "updated just now" : `updated ${minutes}m ago`;
}
