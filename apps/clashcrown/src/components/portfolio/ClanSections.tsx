import Image from "@/components/Image";
import Link from "@/components/Link";
import { RefreshCcw, Settings2, Swords, User } from "lucide-react";
import { RankCell } from "@/components/portfolio/DataTable";
import { ArenaHeroFrame } from "@/components/portfolio/ArenaRouteHero";
import { relativeTime } from "@/lib/clash/format";
import type { Clan } from "@/lib/clash/domain";
import { useI18n, type Locale } from "@/lib/i18n";

export function ClanProfile({ clan }: { clan: Clan }) {
  const { formatNumber, locale, t } = useI18n();
  return (
    <ArenaHeroFrame className="clan-hero">
      <Image src={clan.badge} alt="" width={74} height={92} priority />
      <h1>{clan.name}</h1>
      <strong>
        #{clan.tag} <span>TYPE: {(clan.type ?? "Unknown").toUpperCase()}</span>
        {clan.location ? <span>{clan.location.toUpperCase()}</span> : null}
      </strong>
      <p>{clan.description}</p>
      <div className="clan-summary">
        <Summary icon="/images/icons/trophy.png" value={formatNumber(clan.score)} label={locale === "es" ? "Trofeos del clan" : "Clan Trophies"} />
        <Summary icon="/images/icons/trophy.png" value={formatNumber(clan.requiredTrophies ?? 0)} label={locale === "es" ? "Trofeos requeridos" : "Required Trophies"} />
        <Summary icon="/images/icons/cardsq.png" value={formatNumber(clan.donations)} label={locale === "es" ? "Donaciones / semana" : "Donations / Week"} />
        <Summary icon={clan.warBadge} value={formatNumber(clan.warTrophies)} label={clan.warLeague ?? (locale === "es" ? "Trofeos de guerra" : "War Trophies")} />
      </div>
      <div className="clan-hero-actions">
        <Link href={`/clans/${clan.tag}/war`} className="pink-button">
          <Swords size={17} /> {t("clan.war")}
        </Link>
        {clan.fetchedAt ? (
          <Link href={`/clans/${clan.tag}/manage`} className="management-button management-button-muted">
            <Settings2 size={17} /> Leader workspace
          </Link>
        ) : null}
      </div>
    </ArenaHeroFrame>
  );
}

export function ClanChestProgress({ clan }: { clan: Clan }) {
  const { formatNumber, locale } = useI18n();
  const memberProgress = Math.min(100, (clan.members.length / 50) * 100);
  const donationProgress = Math.min(100, (clan.donations / 40_000) * 100);
  const warProgress = Math.min(100, (clan.warTrophies / 5000) * 100);
  return (
    <section className="clan-progress profile-section">
      <h2>{locale === "es" ? "Pulso del clan" : "Clan Pulse"}</h2>
      <div className="progress-columns">
        <ProgressItem icon={clan.badge} label={`${clan.members.length} ${locale === "es" ? "miembros" : "members"}`} total="/ 50" progress={memberProgress} />
        <ProgressItem icon="/images/icons/book.png" label={`${formatNumber(clan.donations)} ${locale === "es" ? "donadas" : "donated"}`} total={locale === "es" ? "esta semana" : "this week"} progress={donationProgress} />
        <ProgressItem icon="/images/icons/trophy.png" label={`${formatNumber(clan.warTrophies)} ${locale === "es" ? "trofeos de guerra" : "war trophies"}`} total={locale === "es" ? "en vivo" : "live"} progress={warProgress} />
      </div>
    </section>
  );
}

export function MemberTable({ clan, onRefresh, isRefreshing }: { clan: Clan; onRefresh: () => void; isRefreshing: boolean }) {
  const { formatNumber, locale, t } = useI18n();
  return (
    <section className="profile-section member-section">
      <div className="section-heading">
        <span className="filter-button static">Trophies</span>
        <h2>{t("clan.members")}</h2>
        <div className="update-tools"><span>{updatedLabel(clan.fetchedAt, locale)}</span><button type="button" onClick={onRefresh} disabled={isRefreshing}><RefreshCcw className={isRefreshing ? "spin" : ""} size={16} />{isRefreshing ? t("common.refreshing") : t("common.refresh")}</button></div>
      </div>
      <div className="members-table-wrap">
        <table className="members-table">
          <thead>
            <tr>
              <th>{locale === "es" ? "Puesto" : "Rank"}</th>
              <th>{locale === "es" ? "Nombre" : "Name"}</th>
              {/* Not "Level": /clans returns expLevel: 0 for every member, so
                  the column was fifty identical zeroes. lastSeen is populated
                  and is the field a leader actually reads down the roster. */}
              <th>{locale === "es" ? "Última vez" : "Last seen"}</th>
              <th>{locale === "es" ? "Trofeos" : "Trophies"}</th>
              <th>{locale === "es" ? "Donaciones" : "Donations"}</th>
              <th>{locale === "es" ? "Recibidas" : "Received"}</th>
              <th>{locale === "es" ? "Rol" : "Role"}</th>
            </tr>
          </thead>
          <tbody>
            {clan.members.map((member, index) => (
              <tr key={member.tag ?? member.name}>
                <td><RankCell rank={member.rank ?? index + 1} previousRank={member.previousRank} /></td>
                <td>{member.tag ? <Link href={`/players/${member.tag}`}><strong>{member.name}</strong></Link> : <strong>{member.name}</strong>}</td>
                <td><span className="table-lastseen">{relativeTime(member.lastSeen, locale)}</span></td>
                <td><Image src="/images/icons/trophy.png" alt="" width={25} height={25} /> <strong>{formatNumber(member.trophies)}</strong></td>
                <td><Image src="/images/icons/book.png" alt="" width={22} height={25} />{formatNumber(member.donations)}</td>
                <td>{member.donationsReceived === undefined ? "—" : formatNumber(member.donationsReceived)}</td>
                <td><User size={20} />{member.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-note">{locale === "es" ? `Mostrando los ${clan.members.length} miembros devueltos por la API de clanes en vivo.` : `Showing all ${clan.members.length} members returned by the live clan API.`}</p>
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

function updatedLabel(fetchedAt: number | undefined, locale: Locale) {
  if (!fetchedAt) return locale === "es" ? "datos de demostración" : "demo data";
  const minutes = Math.max(0, Math.floor((Date.now() - fetchedAt) / 60_000));
  if (locale === "es") return minutes < 1 ? "actualizado ahora" : `actualizado hace ${minutes} min`;
  return minutes < 1 ? "updated just now" : `updated ${minutes}m ago`;
}
