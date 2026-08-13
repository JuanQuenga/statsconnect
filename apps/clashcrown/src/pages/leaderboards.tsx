import Head from "@/components/Head";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { Layout } from "@/components/portfolio/Layout";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { EntityCell, RankCell, TableShell, TrophyCell } from "@/components/portfolio/DataTable";
import { badgeImage, NO_CLAN_BADGE_IMAGE } from "@/lib/clash/assets";
import type { ApiClanRanking, ApiLeaderboard, ApiLocation, ApiPlayerRanking, RankingKind } from "@/lib/clash/types";
import {
  GLOBAL_LOCATION_ID,
  errorMessage,
  isConvexConfigured,
  leaderboardAction,
  leaderboardsAction,
  locationsAction,
  rankingsAction
} from "@/lib/convex";

const TABS: Array<{ kind: RankingKind; label: string; blurb: string }> = [
  { kind: "players", label: "Top Players", blurb: "The event and season leaderboards the game is currently running." },
  { kind: "clans", label: "Top Clans", blurb: "Clans ranked by total clan score." },
  { kind: "clanwars", label: "Clan Wars", blurb: "Clans ranked by war trophies." }
];

export default function LeaderboardsPage() {
  if (!isConvexConfigured) {
    return (
      <Layout>
        <SetupState feature="leaderboards" />
      </Layout>
    );
  }
  return <Leaderboards />;
}

function Leaderboards() {
  const [kind, setKind] = useState<RankingKind>("players");
  const [locationId, setLocationId] = useState(GLOBAL_LOCATION_ID);
  const [boardId, setBoardId] = useState<number | undefined>();

  const getLocations = useAction(locationsAction);
  const getRankings = useAction(rankingsAction);
  const getBoards = useAction(leaderboardsAction);
  const getBoard = useAction(leaderboardAction);

  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: async () => (await getLocations({})).locations.data.items ?? [],
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
    enabled: kind !== "players"
  });

  const boardsQuery = useQuery({
    queryKey: ["leaderboards"],
    queryFn: async () => namedBoards((await getBoards({})).leaderboards.data.items ?? []),
    staleTime: 60 * 60 * 1000,
    retry: false,
    enabled: kind === "players"
  });

  const activeBoard = boardId ?? boardsQuery.data?.[0]?.id;

  const boardQuery = useQuery({
    queryKey: ["leaderboard", activeBoard],
    queryFn: async () => (await getBoard({ leaderboardId: activeBoard!, limit: 100 })).leaderboard.data.items ?? [],
    enabled: kind === "players" && typeof activeBoard === "number",
    placeholderData: (previous) => previous,
    retry: false
  });

  const rankingsQuery = useQuery({
    queryKey: ["rankings", kind, locationId],
    queryFn: async () => (await getRankings({ kind, locationId, limit: 100 })).rankings.data.items ?? [],
    enabled: kind !== "players",
    placeholderData: (previous) => previous,
    retry: false
  });

  // The API exposes the global pseudo-location in /locations; prefer whatever it
  // actually returns over our hardcoded fallback id.
  const { global, countries } = useMemo(() => splitLocations(locationsQuery.data ?? []), [locationsQuery.data]);
  const activeTab = TABS.find((tab) => tab.kind === kind) ?? TABS[0];
  const active = kind === "players" ? boardQuery : rankingsQuery;

  // Both pickers live in the table's own heading rather than a bar of their own:
  // the heading already names the board, so a separate strip above it repeated
  // the same words in a control stranded at the left edge of the page.
  const boardPicker = (
    <label className="rarity-filter">
      <span className="sr-only">Leaderboard</span>
      <select
        value={activeBoard ?? ""}
        onChange={(event) => setBoardId(Number(event.target.value))}
        disabled={!boardsQuery.data?.length}
      >
        {boardsQuery.data?.length ? (
          boardsQuery.data.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}
            </option>
          ))
        ) : (
          <option value="">Loading leaderboards…</option>
        )}
      </select>
    </label>
  );

  // Event boards are not location-scoped, so the region filter only applies to
  // the clan tabs.
  const regionPicker = (
    <label className="rarity-filter">
      <span className="sr-only">Region</span>
      <select value={locationId} onChange={(event) => setLocationId(Number(event.target.value))}>
        {global.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
        {countries.length ? (
          <optgroup label="Countries">
            {countries.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  );

  return (
    <Layout>
      <Head>
        <title>Leaderboards | Royale Stats</title>
        <meta name="description" content="Global and per-country Clash Royale rankings for players and clans." />
      </Head>
      <div className="profile-page">
        <section className="decks-hero">
          <span className="eyebrow">Official player and clan rankings</span>
          <h1>Leaderboards</h1>
          <p>{activeTab.blurb}</p>
        </section>

        <div className="archetype-tabs" aria-label="Leaderboard type">
          {TABS.map((tab) => (
            <button key={tab.kind} type="button" className={kind === tab.kind ? "active" : ""} onClick={() => setKind(tab.kind)}>
              {tab.label}
            </button>
          ))}
        </div>

        {active.isLoading ? <LoadingState label="rankings" /> : null}
        {active.error ? <ErrorState message={errorMessage(active.error)} /> : null}
        {kind === "players"
          ? boardQuery.data
            ? <PlayerRankings rows={boardQuery.data} label={boardsQuery.data?.find((b) => b.id === activeBoard)?.name} toolbar={boardPicker} />
            : null
          : rankingsQuery.data
            ? <ClanRankings rows={rankingsQuery.data as ApiClanRanking[]} kind={kind} toolbar={regionPicker} />
            : null}
      </div>
    </Layout>
  );
}

function splitLocations(locations: ApiLocation[]) {
  const global = locations.filter((location) => !location.isCountry);
  const countries = locations.filter((location) => location.isCountry).sort((a, b) => a.name.localeCompare(b.name));
  return {
    global: global.length ? global : [{ id: GLOBAL_LOCATION_ID, name: "Global" }],
    countries
  };
}

/**
 * `/leaderboards` returns every board the game is running, including several
 * past instances of the same event and a number with a null name. Keeping the
 * highest id per name leaves one labelled entry per event — the current one,
 * since ids climb with each new instance.
 */
function namedBoards(boards: ApiLeaderboard[]) {
  const byName = new Map<string, ApiLeaderboard & { name: string }>();
  for (const board of boards) {
    if (!board.name) continue;
    const existing = byName.get(board.name);
    if (!existing || board.id > existing.id) byName.set(board.name, { ...board, name: board.name });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Sentinel the API returns on boards with no meaningful score. */
const SCORE_SENTINEL = 2147483647;

function PlayerRankings({ rows, label, toolbar }: { rows: ApiPlayerRanking[]; label?: string; toolbar?: ReactNode }) {
  return (
    <TableShell
      title={label ?? "Top Players"}
      toolbar={toolbar}
      head={["Rank", "Player", "Score", "Clan"]}
      empty={!rows.length}
      emptyMessage="This board has no entries yet. Event leaderboards fill up once the event has been running for a while."
      note={`Showing ${rows.length} ranked players. Event boards report a score rather than trophies.`}
    >
      {rows.map((row) => (
        <tr key={row.tag}>
          <td>
            <RankCell rank={row.rank} previousRank={row.previousRank} />
          </td>
          <td>
            <EntityCell href={`/players/${row.tag.replace(/^#/, "")}`} name={row.name} sub={row.tag} />
          </td>
          <td>
            {typeof row.score === "number" && row.score !== SCORE_SENTINEL ? (
              <TrophyCell value={row.score} />
            ) : (
              "—"
            )}
          </td>
          <td>
            {row.clan?.tag ? (
              <EntityCell
                href={`/clans/${row.clan.tag.replace(/^#/, "")}`}
                name={row.clan.name ?? "Clan"}
                badge={badgeImage(row.clan.badgeId, row.clan.badgeUrls)}
                badgeFallback={NO_CLAN_BADGE_IMAGE}
              />
            ) : (
              "—"
            )}
          </td>
        </tr>
      ))}
    </TableShell>
  );
}

function ClanRankings({ rows, kind, toolbar }: { rows: ApiClanRanking[]; kind: RankingKind; toolbar?: ReactNode }) {
  const warMode = kind === "clanwars";
  return (
    <TableShell
      title={warMode ? "Clan War Rankings" : "Top Clans"}
      toolbar={toolbar}
      head={["Rank", "Clan", "Members", warMode ? "War Trophies" : "Clan Score"]}
      empty={!rows.length}
      emptyMessage="This region has no ranked clans. Smaller countries often rank fewer than the API's minimum, so try Global."
      note={`Showing ${rows.length} ranked clans.`}
    >
      {rows.map((row) => (
        <tr key={row.tag}>
          <td>
            <RankCell rank={row.rank} previousRank={row.previousRank} />
          </td>
          <td>
            <EntityCell
              href={`/clans/${row.tag.replace(/^#/, "")}`}
              name={row.name}
              badge={badgeImage(row.badgeId, row.badgeUrls)}
              badgeFallback={NO_CLAN_BADGE_IMAGE}
              sub={row.location?.name}
            />
          </td>
          <td>{row.members ?? "—"} / 50</td>
          <td>
            <TrophyCell value={warMode ? row.clanWarTrophies : row.clanScore} />
          </td>
        </tr>
      ))}
    </TableShell>
  );
}
