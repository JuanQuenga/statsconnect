import Head from "@/components/Head";
import Image from "@/components/Image";
import Link from "@/components/Link";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { CardArt } from "@/components/portfolio/CardArt";
import { Layout } from "@/components/portfolio/Layout";
import { badgeImage, NO_CLAN_BADGE_IMAGE } from "@/lib/clash/assets";
import { stripSupercellColorTags } from "@/lib/clash/format";
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
import {
  leaderboardSnapshotQuery,
  leaderboardSnapshotsQuery,
  type HistoricalLeaderboardDetail,
  type HistoricalLeaderboardSnapshotId
} from "@/lib/history";
import { useQuery } from "@tanstack/react-query";
import { useAction, useConvex } from "convex/react";
import { ArrowUpRight, ChevronRight, Crown, Globe2, History, Search, Swords, TrendingUp, Trophy, Users } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState, type ComponentType, type SVGProps } from "react";
import styles from "./leaderboards.module.css";

const TABS: Array<{
  kind: RankingKind;
  label: string;
  shortLabel: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}> = [
  { kind: "players", label: "Top Players", shortLabel: "Players", description: "The live Path of Legends and event boards currently published by Clash Royale.", icon: Trophy },
  { kind: "clans", label: "Top Clans", shortLabel: "Clans", description: "The strongest clans worldwide or in a country, ranked by total clan score.", icon: Users },
  { kind: "clanwars", label: "Clan Wars", shortLabel: "Clan Wars", description: "The global and local River Race order, ranked by clan war trophies.", icon: Swords }
];

const SCORE_SENTINEL = 2147483647;
const PAGE_SIZES = [25, 50, 100] as const;
const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

type DisplayRanking = {
  tag: string;
  name: string;
  rank: number;
  previousRank?: number;
  score?: number;
  previousScore?: number;
  scoreChange?: number;
  clanTag?: string;
  clanName?: string;
  badge?: string;
  members?: number;
  location?: string;
};

export default function LeaderboardsPage() {
  if (!isConvexConfigured) return <Layout><SetupState feature="leaderboards" /></Layout>;
  return <Leaderboards />;
}

function Leaderboards() {
  const convex = useConvex();
  const [kind, setKind] = useState<RankingKind>("players");
  const [locationId, setLocationId] = useState(GLOBAL_LOCATION_ID);
  const [boardId, setBoardId] = useState<number>();
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());

  const getLocations = useAction(locationsAction);
  const getRankings = useAction(rankingsAction);
  const getBoards = useAction(leaderboardsAction);
  const getBoard = useAction(leaderboardAction);

  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: async () => (await getLocations({})).locations.data.items ?? [],
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    enabled: kind !== "players"
  });
  const boardsQuery = useQuery({
    queryKey: ["leaderboards"],
    queryFn: async () => namedBoards((await getBoards({})).leaderboards.data.items ?? []),
    staleTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    enabled: kind === "players"
  });
  const activeBoard = boardId ?? boardsQuery.data?.[0]?.id;
  const boardQuery = useQuery({
    queryKey: ["leaderboard", activeBoard],
    queryFn: async () => (await getBoard({ leaderboardId: activeBoard!, limit: 100 })).leaderboard.data.items ?? [],
    enabled: kind === "players" && typeof activeBoard === "number",
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false
  });
  const rankingsQuery = useQuery({
    queryKey: ["rankings", kind, locationId],
    queryFn: async () => (await getRankings({ kind, locationId, limit: 100 })).rankings.data.items ?? [],
    enabled: kind !== "players",
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false
  });

  const boardKey = kind === "players"
    ? typeof activeBoard === "number" ? `event:${activeBoard}` : undefined
    : `rankings:${kind}:${locationId}`;
  const snapshotsQuery = useQuery({
    queryKey: ["leaderboard-snapshots", boardKey, "rankings-desk"],
    queryFn: () => convex.query(leaderboardSnapshotsQuery, { boardKey: boardKey!, limit: 3 }),
    enabled: Boolean(boardKey),
    staleTime: 2 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false
  });
  const snapshots = snapshotsQuery.data ?? [];
  const latestSnapshotId = snapshots[0]?.id;
  const previousSnapshotId = snapshots[1]?.id;
  const historyQuery = useQuery({
    queryKey: ["leaderboard-history-detail", latestSnapshotId, previousSnapshotId, "rankings-desk"],
    queryFn: () => convex.query(leaderboardSnapshotQuery, {
      snapshotId: latestSnapshotId as HistoricalLeaderboardSnapshotId,
      ...(previousSnapshotId ? { compareToId: previousSnapshotId as HistoricalLeaderboardSnapshotId } : {}),
      limit: 100
    }),
    enabled: Boolean(latestSnapshotId),
    staleTime: 2 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false
  });

  const { global, countries } = useMemo(() => splitLocations(locationsQuery.data ?? []), [locationsQuery.data]);
  const activeTab = TABS.find((tab) => tab.kind === kind) ?? TABS[0];
  const activeBoardName = boardsQuery.data?.find((board) => board.id === activeBoard)?.name;
  const activeLocationName = [...global, ...countries].find((location) => location.id === locationId)?.name ?? "Global";
  const scopeName = kind === "players" ? activeBoardName ?? "Current event" : activeLocationName;
  const activeQuery = kind === "players" ? boardQuery : rankingsQuery;
  const liveRows = useMemo(
    () => kind === "players"
      ? boardQuery.data ? normalisePlayers(boardQuery.data) : undefined
      : rankingsQuery.data ? normaliseClans(rankingsQuery.data as ApiClanRanking[], kind) : undefined,
    [boardQuery.data, kind, rankingsQuery.data]
  );
  const archivedRows = useMemo(() => normaliseHistory(historyQuery.data), [historyQuery.data]);
  const rows = liveRows ?? archivedRows;
  const isArchiveFallback = liveRows === undefined && archivedRows.length > 0;
  const filteredRows = useMemo(() => {
    if (!deferredSearch) return rows;
    return rows.filter((row) => [row.name, row.tag, row.clanName, row.clanTag, row.location]
      .some((value) => value?.toLocaleLowerCase().includes(deferredSearch)));
  }, [deferredSearch, rows]);
  const visibleRows = filteredRows.slice(0, pageSize);
  const podium = rows.slice(0, 3);

  useEffect(() => {
    setSearch("");
    setPageSize(25);
  }, [activeBoard, kind, locationId]);

  const boardPicker = kind === "players" ? (
    <label className={styles.scopePicker}>
      <span>Board</span>
      <select value={activeBoard ?? ""} onChange={(event) => setBoardId(Number(event.target.value))} disabled={!boardsQuery.data?.length}>
        {boardsQuery.data?.length ? boardsQuery.data.map((board) => <option key={board.id} value={board.id}>{board.name}</option>) : <option value="">Loading boards…</option>}
      </select>
    </label>
  ) : (
    <label className={styles.scopePicker}>
      <span>Region</span>
      <select value={locationId} onChange={(event) => setLocationId(Number(event.target.value))}>
        {global.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        {countries.length ? <optgroup label="Countries">{countries.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</optgroup> : null}
      </select>
    </label>
  );

  return (
    <Layout>
      <Head>
        <title>Leaderboards | StatsConnect · Clash Royale statistics</title>
        <meta name="description" content="Live Clash Royale player, clan, and clan-war rankings with searchable results and real historical movement from StatsConnect." />
      </Head>
      <div className={styles.page}>
        <section className={styles.hero} data-arena-frame>
          <span className="arena-hero-frame-art" aria-hidden="true" />
          <div className={styles.heroCopy}>
            <h1>Leaderboards</h1>
            <p>Find the players and clans setting the pace now, then use StatsConnect’s saved observations to see who is actually climbing.</p>
            <div className={styles.heroFacts} aria-label="Leaderboard coverage">
              <span><strong>{rows.length || "—"}</strong> positions</span>
              <span><strong>{historyQuery.data?.board.snapshotCount ?? snapshots.length}</strong> saved captures</span>
              <span><strong>{formatRelativeTime(historyQuery.data?.snapshot.lastObservedAt)}</strong> checked</span>
            </div>
          </div>
          <div className={styles.heroArt} aria-hidden="true">
            <Image src="/images/art/leaderboards-hero-banner-2026-no-character.png" alt="" width={2172} height={724} priority />
          </div>
        </section>

        <nav className={styles.modeSwitch} aria-label="Leaderboard type">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return <button key={tab.kind} type="button" className={kind === tab.kind ? styles.activeMode : undefined} aria-pressed={kind === tab.kind} onClick={() => setKind(tab.kind)}>
              <Icon aria-hidden="true" />
              <span><strong>{tab.shortLabel}</strong><small>{tab.description}</small></span>
            </button>;
          })}
        </nav>

        <section className={styles.controls} aria-label="Ranking controls">
          <div className={styles.scopeSummary}>
            <span className={styles.scopeIcon}>{kind === "players" ? <Trophy /> : <Globe2 />}</span>
            <div><small>{activeTab.label}</small><strong>{scopeName}</strong></div>
          </div>
          {boardPicker}
          <label className={styles.searchField}>
            <span className="sr-only">Search this ranking</span>
            <Search aria-hidden="true" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={kind === "players" ? "Search player, tag, or clan" : "Search clan, tag, or region"} />
          </label>
        </section>

        {activeQuery.isLoading && !rows.length ? <LoadingState label="rankings" /> : null}
        {activeQuery.error && !rows.length ? <ErrorState message={errorMessage(activeQuery.error)} /> : null}
        {rows.length ? <>
          <Podium rows={podium} kind={kind} archived={isArchiveFallback} />
          <div className={styles.contentGrid}>
            <RankingList rows={visibleRows} total={filteredRows.length} sourceTotal={rows.length} kind={kind} query={search} pageSize={pageSize} setPageSize={setPageSize} archived={isArchiveFallback} liveError={activeQuery.error ? errorMessage(activeQuery.error) : undefined} />
            <Insights detail={historyQuery.data} loading={snapshotsQuery.isLoading || historyQuery.isLoading} kind={kind} />
          </div>
        </> : !activeQuery.isLoading && !activeQuery.error ? <section className={styles.emptyState}><Trophy /><h2>No ranked entries yet</h2><p>This board is active but has not published meaningful scores. Try another board or region.</p></section> : null}
      </div>
    </Layout>
  );
}

function Podium({ rows, kind, archived }: { rows: DisplayRanking[]; kind: RankingKind; archived: boolean }) {
  if (rows.length < 3) return null;
  const ordered = [rows[1], rows[0], rows[2]];
  return <section className={styles.podiumSection} aria-label={`Top three ${kind === "players" ? "players" : "clans"}`}>
    <div className={styles.sectionIntro}><div><h2>The podium</h2><p>{archived ? "The top three in the newest saved capture." : "The current top three on this board."}</p></div><span><Crown /> {archived ? "Saved order" : "Live order"}</span></div>
    <div className={styles.podium}>{ordered.map((row) => {
      const href = rankingHref(row, kind);
      const card = <>
        <div className={styles.podiumBadge}>{row.badge ? <CardArt src={row.badge} fallback={NO_CLAN_BADGE_IMAGE} alt="" width={72} height={86} /> : <span>{row.rank}</span>}</div>
        <strong>{stripSupercellColorTags(row.name)}</strong>
        <small>{secondaryLabel(row, kind)}</small>
        <div className={styles.podiumScore}><Image src="/images/icons/trophy.png" alt="" width={20} height={20} />{formatScore(row.score)}</div>
      </>;
      return href ? <Link key={row.tag} href={href} className={styles.podiumCard} data-rank={row.rank}>{card}</Link> : <div key={row.tag} className={styles.podiumCard} data-rank={row.rank}>{card}</div>;
    })}</div>
  </section>;
}

function RankingList({ rows, total, sourceTotal, kind, query, pageSize, setPageSize, archived, liveError }: {
  rows: DisplayRanking[];
  total: number;
  sourceTotal: number;
  kind: RankingKind;
  query: string;
  pageSize: (typeof PAGE_SIZES)[number];
  setPageSize: (value: (typeof PAGE_SIZES)[number]) => void;
  archived: boolean;
  liveError?: string;
}) {
  return <section className={styles.rankingPanel}>
    <div className={styles.panelHeading}>
      <div><h2>Full ranking</h2><p>{archived ? "Showing the latest saved production capture while the live board is unavailable." : `${sourceTotal} live entries, ranked in official order.`}</p></div>
      <div className={styles.pageSizes} aria-label="Rows shown">{PAGE_SIZES.map((size) => <button key={size} type="button" className={pageSize === size ? styles.activePageSize : undefined} onClick={() => setPageSize(size)}>{size}</button>)}</div>
    </div>
    {liveError && archived ? <p className={styles.archiveNotice}>Live refresh failed: {liveError} The saved capture below is still available.</p> : null}
    <div className={styles.columnLabels} aria-hidden="true"><span>Rank</span><span>Player / clan</span><span>Movement</span><span>Score</span><span /></div>
    <div className={styles.rankingRows}>{rows.map((row) => <RankingRow key={row.tag} row={row} kind={kind} />)}</div>
    {!rows.length ? <div className={styles.noMatches}><Search /><strong>No matches for “{query}”</strong><span>Try a shorter name, clan, or tag.</span></div> : null}
    {total > rows.length ? <p className={styles.listFoot}>Showing {rows.length} of {total} matching entries. Choose a larger row count to see more.</p> : null}
  </section>;
}

function RankingRow({ row, kind }: { row: DisplayRanking; kind: RankingKind }) {
  const href = rankingHref(row, kind);
  const rankChange = row.previousRank ? row.previousRank - row.rank : undefined;
  return <Link href={href} className={styles.rankingRow}>
    <div className={styles.rankNumber} data-rank={row.rank}>{row.rank}</div>
    <div className={styles.entity}>
      {row.badge ? <CardArt src={row.badge} fallback={NO_CLAN_BADGE_IMAGE} alt="" width={42} height={48} /> : null}
      <span><strong>{stripSupercellColorTags(row.name)}</strong><small>#{row.tag.replace(/^#/, "")} · {secondaryLabel(row, kind)}</small></span>
    </div>
    <Movement rankChange={rankChange} scoreChange={row.scoreChange} />
    <div className={styles.rowScore}><Image src="/images/icons/trophy.png" alt="" width={20} height={20} /><strong>{formatScore(row.score)}</strong></div>
    <ChevronRight className={styles.rowArrow} aria-hidden="true" />
  </Link>;
}

function Movement({ rankChange, scoreChange }: { rankChange?: number; scoreChange?: number }) {
  if (rankChange === undefined && scoreChange === undefined) return <span className={styles.steady}>—</span>;
  if (rankChange === 0 && (scoreChange === undefined || scoreChange === 0)) return <span className={styles.steady}>Held rank</span>;
  return <span className={rankChange && rankChange > 0 ? styles.movementUp : rankChange && rankChange < 0 ? styles.movementDown : styles.steady}>
    {rankChange !== undefined && rankChange !== 0 ? `${rankChange > 0 ? "+" : ""}${rankChange} ranks` : "Same rank"}
    {scoreChange !== undefined && scoreChange !== 0 ? <small>{scoreChange > 0 ? "+" : ""}{scoreChange.toLocaleString()} score</small> : null}
  </span>;
}

function Insights({ detail, loading, kind }: { detail: HistoricalLeaderboardDetail | null | undefined; loading: boolean; kind: RankingKind }) {
  const movers = useMemo(() => detail?.entries.filter((entry) => typeof entry.rankChange === "number" && entry.rankChange > 0).sort((a, b) => (b.rankChange ?? 0) - (a.rankChange ?? 0)).slice(0, 5) ?? [], [detail]);
  return <aside className={styles.insights}>
    <section className={styles.movementPanel}>
      <div className={styles.insightHeading}><span><TrendingUp /></span><div><h2>Biggest movers</h2><p>Changes between real StatsConnect captures.</p></div></div>
      {loading ? <div className={styles.insightLoading}>Comparing saved observations…</div> : null}
      {!loading && movers.length ? <ol className={styles.moverList}>{movers.map((entry) => {
        const href = kind === "players" ? `/players/${entry.tag}` : `/clans/${entry.tag}`;
        return <li key={entry.tag}><Link href={href}><span><strong>{stripSupercellColorTags(entry.name)}</strong><small>Now #{entry.rank}</small></span><b>+{entry.rankChange}</b></Link></li>;
      })}</ol> : null}
      {!loading && detail && !movers.length ? <p className={styles.insightEmpty}>No upward rank changes in the two newest saved captures.</p> : null}
      {!loading && !detail ? <p className={styles.insightEmpty}>This board needs two changed captures before movement analysis appears.</p> : null}
    </section>
    <section className={styles.archivePanel}>
      <div className={styles.insightHeading}><span><History /></span><div><h2>Saved history</h2><p>What StatsConnect has observed in production.</p></div></div>
      {detail ? <div className={styles.archiveStats}>
        <div><span>Changed captures</span><strong>{detail.board.snapshotCount.toLocaleString()}</strong></div>
        <div><span>First observed</span><strong>{dateTime.format(detail.board.firstObservedAt)}</strong></div>
        <div><span>Latest check</span><strong>{dateTime.format(detail.snapshot.lastObservedAt)}</strong></div>
        <div><span>Compared with</span><strong>{detail.comparedAt ? dateTime.format(detail.comparedAt) : "Waiting for a change"}</strong></div>
      </div> : <p className={styles.insightEmpty}>The live board works now. Saved comparisons will appear after the crawler records it.</p>}
      <Link className={styles.historyLink} href="/history">Explore every captured board <ArrowUpRight /></Link>
    </section>
  </aside>;
}

function splitLocations(locations: ApiLocation[]) {
  const global = locations.filter((location) => !location.isCountry);
  const countries = locations.filter((location) => location.isCountry).sort((a, b) => a.name.localeCompare(b.name));
  return { global: global.length ? global : [{ id: GLOBAL_LOCATION_ID, name: "Global" }], countries };
}

function namedBoards(boards: ApiLeaderboard[]) {
  const byName = new Map<string, ApiLeaderboard & { name: string }>();
  for (const board of boards) {
    if (!board.name) continue;
    const existing = byName.get(board.name);
    if (!existing || board.id > existing.id) byName.set(board.name, { ...board, name: board.name });
  }
  return [...byName.values()].sort((a, b) => b.id - a.id);
}

function normalisePlayers(rows: ApiPlayerRanking[]): DisplayRanking[] {
  return rows.map((row, index) => ({ tag: row.tag, name: row.name, rank: row.rank ?? index + 1, previousRank: row.previousRank, score: row.score === SCORE_SENTINEL ? undefined : row.score, clanTag: row.clan?.tag, clanName: row.clan?.name }));
}

function normaliseClans(rows: ApiClanRanking[], kind: RankingKind): DisplayRanking[] {
  return rows.map((row, index) => ({ tag: row.tag, name: row.name, rank: row.rank ?? index + 1, previousRank: row.previousRank, score: kind === "clanwars" ? row.clanWarTrophies : row.clanScore, badge: badgeImage(row.badgeId, row.badgeUrls), members: row.members, location: row.location?.name }));
}

function normaliseHistory(detail: HistoricalLeaderboardDetail | null | undefined): DisplayRanking[] {
  return detail?.entries.map((entry) => ({ tag: entry.tag, name: entry.name, rank: entry.rank, previousRank: entry.previousRank, score: entry.score ?? entry.trophies, previousScore: entry.previousScore, scoreChange: entry.scoreChange, clanTag: entry.clanTag, clanName: entry.clanName })) ?? [];
}

function rankingHref(row: DisplayRanking, kind: RankingKind) {
  const tag = row.tag.replace(/^#/, "");
  return kind === "players" ? `/players/${tag}` : `/clans/${tag}`;
}

function secondaryLabel(row: DisplayRanking, kind: RankingKind) {
  if (kind === "players") return row.clanName ? `with ${stripSupercellColorTags(row.clanName)}` : "No clan";
  const membership = typeof row.members === "number" ? `${row.members}/50 members` : undefined;
  return [row.location, membership].filter(Boolean).join(" · ") || "Clan";
}

function formatScore(score?: number) {
  return typeof score === "number" ? score.toLocaleString() : "—";
}

function formatRelativeTime(timestamp?: number) {
  if (!timestamp) return "Not yet";
  const minutes = Math.round((timestamp - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeTime.format(hours, "hour");
  return relativeTime.format(Math.round(hours / 24), "day");
}
