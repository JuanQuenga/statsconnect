import Head from "@/components/Head";
import Link from "@/components/Link";
import { useRouter } from "@/lib/router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { Layout } from "@/components/portfolio/Layout";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { EntityCell, TableShell } from "@/components/portfolio/DataTable";
import { badgeImage, NO_CLAN_BADGE_IMAGE } from "@/lib/clash/assets";
import { formatApiDate } from "@/lib/clash/format";
import type { ApiCurrentRiverRace, ApiRiverRaceClan, ApiRiverRaceLog } from "@/lib/clash/types";
import { clanWarAction, errorMessage, isConvexConfigured } from "@/lib/convex";
import { ClanWarInsights } from "@/components/clans/ClanWarInsights";

/** Each clan gets four war-day decks per member per day. */
const DECKS_PER_MEMBER_PER_DAY = 4;

export default function ClanWarPage() {
  const router = useRouter();
  const tag = typeof router.query.tag === "string" ? router.query.tag : "";

  if (!router.isReady) {
    return (
      <Layout>
        <LoadingState label="clan war" />
      </Layout>
    );
  }
  if (!isConvexConfigured) {
    return (
      <Layout>
        <SetupState feature="clan wars" />
      </Layout>
    );
  }
  return <ClanWar tag={tag} />;
}

function ClanWar({ tag }: { tag: string }) {
  const getClanWar = useAction(clanWarAction);
  const query = useQuery({
    queryKey: ["clan-war", tag],
    queryFn: async () => getClanWar({ tag }),
    placeholderData: (previous) => previous,
    retry: false
  });

  if (query.isLoading) {
    return (
      <Layout>
        <LoadingState label="clan war" />
      </Layout>
    );
  }
  if (query.error) {
    return (
      <Layout>
        <ErrorState message={errorMessage(query.error)} />
      </Layout>
    );
  }

  const current = query.data?.currentRace.data ?? null;
  const log = query.data?.raceLog.data ?? null;

  return (
    <Layout>
      <Head>
        <title>{`Clan War #${tag} | StatsConnect · Clash Royale statistics`}</title>
      </Head>
      <div className="profile-page">
        <section className="decks-hero">
          <Link href={`/clans/${tag}`} className="breadcrumb">← Back to clan</Link>
          <h1>River Race</h1>
          <p>{current?.clan?.name ?? `#${tag}`}</p>
        </section>

        {!current && !log ? (
          <p className="empty-results">This clan has no River Race history yet.</p>
        ) : null}

        {current ? <RaceStandings race={current} /> : null}
        {current?.clan ? <Participation clan={current.clan} periodIndex={current.periodIndex} /> : null}
        <ClanWarInsights tag={tag} />
        {log ? <RaceLog log={log} /> : null}
      </div>
    </Layout>
  );
}

function RaceStandings({ race }: { race: ApiCurrentRiverRace }) {
  const clans = [...(race.clans ?? [])].sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0));
  const ownTag = race.clan?.tag;

  return (
    <TableShell
      title="Current Race"
      head={["#", "Clan", "Fame", "Repair", "Finished"]}
      empty={!clans.length}
      toolbar={<span>{describePeriod(race)}</span>}
      note="Fame is the score earned from war-day battles this week."
    >
      {clans.map((clan, index) => (
        <tr key={clan.tag ?? index} className={clan.tag === ownTag ? "row-highlight" : undefined}>
          <td>{index + 1}</td>
          <td>
            <EntityCell
              href={clan.tag ? `/clans/${clan.tag.replace(/^#/, "")}` : undefined}
              name={clan.name ?? "Unknown clan"}
              badge={badgeImage(clan.badgeId, clan.badgeUrls)}
              badgeFallback={NO_CLAN_BADGE_IMAGE}
            />
          </td>
          <td>
            <strong>{(clan.fame ?? 0).toLocaleString()}</strong>
          </td>
          <td>{(clan.repairPoints ?? 0).toLocaleString()}</td>
          <td>{clan.finishTime ? formatApiDate(clan.finishTime) : "—"}</td>
        </tr>
      ))}
    </TableShell>
  );
}

/**
 * Per-member contribution for the current race. This is the view clan leaders
 * actually want: who is pulling weight and who has decks left today.
 */
function Participation({ clan, periodIndex }: { clan: ApiRiverRaceClan; periodIndex?: number }) {
  const participants = useMemo(
    () => [...(clan.participants ?? [])].sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0)),
    [clan.participants]
  );

  const active = participants.filter((member) => (member.decksUsed ?? 0) > 0);
  const totalFame = participants.reduce((sum, member) => sum + (member.fame ?? 0), 0);

  return (
    <TableShell
      title="Member Participation"
      head={["Member", "Fame", "Repair", "Decks used", "Today", "Boat attacks"]}
      empty={!participants.length}
      toolbar={
        <span>
          {active.length}/{participants.length} took part · {totalFame.toLocaleString()} fame
        </span>
      }
      note={
        typeof periodIndex === "number"
          ? `Totals are for the current race week. Each member gets ${DECKS_PER_MEMBER_PER_DAY} decks per war day.`
          : undefined
      }
    >
      {participants.map((member) => {
        const usedToday = member.decksUsedToday ?? 0;
        return (
          <tr key={member.tag ?? member.name}>
            <td>
              <EntityCell
                href={member.tag ? `/players/${member.tag.replace(/^#/, "")}` : undefined}
                name={member.name ?? "Unknown"}
                sub={member.tag}
              />
            </td>
            <td>
              <strong>{(member.fame ?? 0).toLocaleString()}</strong>
            </td>
            <td>{(member.repairPoints ?? 0).toLocaleString()}</td>
            <td>{member.decksUsed ?? 0}</td>
            <td>
              <span className={usedToday >= DECKS_PER_MEMBER_PER_DAY ? "decks-done" : usedToday === 0 ? "decks-none" : undefined}>
                {usedToday}/{DECKS_PER_MEMBER_PER_DAY}
              </span>
            </td>
            <td>{member.boatAttacks ?? 0}</td>
          </tr>
        );
      })}
    </TableShell>
  );
}

function RaceLog({ log }: { log: ApiRiverRaceLog }) {
  const entries = log.items ?? [];
  return (
    <TableShell
      title="Past Races"
      head={["Season", "Week", "Date", "Placement", "Trophy change"]}
      empty={!entries.length}
      note="Placement is this clan's finishing position in each completed river race."
    >
      {entries.map((entry, index) => {
        const standing = entry.standings?.find((item) => item.clan?.participants !== undefined) ?? entry.standings?.[0];
        const rank = standing?.rank;
        const change = standing?.trophyChange ?? 0;
        return (
          <tr key={`${entry.seasonId}-${entry.sectionIndex}-${index}`}>
            <td>{entry.seasonId ?? "—"}</td>
            <td>{typeof entry.sectionIndex === "number" ? entry.sectionIndex + 1 : "—"}</td>
            <td>{entry.createdDate ? formatApiDate(entry.createdDate) : "—"}</td>
            <td>
              <strong>{rank ? `#${rank}` : "—"}</strong>
            </td>
            <td className={change > 0 ? "rank-up" : change < 0 ? "rank-down" : undefined}>
              {change > 0 ? `+${change}` : change}
            </td>
          </tr>
        );
      })}
    </TableShell>
  );
}

function describePeriod(race: ApiCurrentRiverRace) {
  const type = race.periodType?.replace(/([a-z])([A-Z])/g, "$1 $2") ?? race.state ?? "In progress";
  const day = typeof race.periodIndex === "number" ? ` · day ${(race.periodIndex % 7) + 1}` : "";
  return `${type}${day}`;
}
