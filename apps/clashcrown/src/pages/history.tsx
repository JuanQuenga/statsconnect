import Head from "@/components/Head";
import Link from "@/components/Link";
import { LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { EntityCell, RankCell, TableShell, TrophyCell } from "@/components/portfolio/DataTable";
import { Layout } from "@/components/portfolio/Layout";
import { isConvexConfigured } from "@/lib/convex";
import {
  leaderboardBoardsQuery,
  leaderboardSnapshotQuery,
  leaderboardSnapshotsQuery,
  type HistoricalLeaderboard,
  type HistoricalLeaderboardDetail,
  type HistoricalLeaderboardSnapshot
} from "@/lib/history";
import { useQuery } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { AlertTriangle, Archive, CalendarRange } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export default function HistoryPage() {
  if (!isConvexConfigured) return <Layout><SetupState feature="historical leaderboards" /></Layout>;
  return <LeaderboardHistory />;
}

function LeaderboardHistory() {
  const convex = useConvex();
  const [chosenBoard, setChosenBoard] = useState<string>();
  const [chosenSnapshot, setChosenSnapshot] = useState<string>();
  const [chosenComparison, setChosenComparison] = useState<string>();
  const boardsQuery = useQuery({
    queryKey: ["historical-leaderboards"],
    queryFn: () => convex.query(leaderboardBoardsQuery, { limit: 120 }),
    retry: false
  });
  const boards = boardsQuery.data ?? [];
  const boardKey = chosenBoard ?? boards[0]?.key;
  const activeBoard = boards.find((board) => board.key === boardKey);
  const snapshotsQuery = useQuery({
    queryKey: ["leaderboard-snapshots", boardKey],
    queryFn: () => convex.query(leaderboardSnapshotsQuery, { boardKey: boardKey!, limit: 80 }),
    enabled: Boolean(boardKey),
    retry: false
  });
  const snapshots = snapshotsQuery.data ?? [];

  useEffect(() => {
    setChosenSnapshot(undefined);
    setChosenComparison(undefined);
  }, [boardKey]);

  const snapshotId = chosenSnapshot ?? snapshots[0]?.id;
  const defaultComparison = useMemo(
    () => snapshots.find((snapshot) => snapshot.id !== snapshotId)?.id,
    [snapshotId, snapshots]
  );
  const comparisonId = chosenComparison === "none" ? undefined : chosenComparison ?? defaultComparison;
  const detailQuery = useQuery({
    queryKey: ["leaderboard-history-detail", snapshotId, comparisonId],
    queryFn: () => convex.query(leaderboardSnapshotQuery, {
      snapshotId: snapshotId!,
      ...(comparisonId ? { compareToId: comparisonId } : {}),
      limit: 100
    }),
    enabled: Boolean(snapshotId),
    retry: false
  });

  if (boardsQuery.isLoading) return <Layout><LoadingState label="historical leaderboards" /></Layout>;

  return (
    <Layout>
      <Head>
        <title>History | Royale Stats</title>
        <meta name="description" content="Timestamped Royale Stats leaderboard observations and historical rank comparisons." />
      </Head>
      <div className="profile-page history-page">
        <section className="decks-hero history-hero">
          <h1>Leaderboard History</h1>
          <p>Browse API boards Royale Stats has actually captured and compare two observations. No ranks are reconstructed between timestamps.</p>
          <Link className="history-back-link" href="/leaderboards">View live leaderboards</Link>
        </section>

        {boardsQuery.error ? <HistoryError message="The historical board catalog could not be loaded." /> : null}
        {!boardsQuery.error && !boards.length ? <EmptyArchive /> : null}
        {boards.length ? (
          <>
            <HistoryControls
              boards={boards}
              snapshots={snapshots}
              boardKey={boardKey ?? ""}
              snapshotId={snapshotId}
              comparisonId={comparisonId}
              onBoard={setChosenBoard}
              onSnapshot={setChosenSnapshot}
              onComparison={setChosenComparison}
            />
            <Coverage activeBoard={activeBoard} snapshots={snapshots} />
            {snapshotsQuery.isLoading || detailQuery.isLoading ? <LoadingState label="leaderboard snapshots" /> : null}
            {snapshotsQuery.error || detailQuery.error ? <HistoryError message="Those snapshots could not be compared right now." /> : null}
            {detailQuery.data ? <HistoryTable detail={detailQuery.data} /> : null}
            {!snapshotsQuery.isLoading && !snapshots.length ? (
              <section className="history-empty"><Archive size={32} /><h2>No saved rows for this board</h2><p>The board is known, but a ranked result has not been captured yet.</p></section>
            ) : null}
          </>
        ) : null}
      </div>
    </Layout>
  );
}

function HistoryControls({
  boards,
  snapshots,
  boardKey,
  snapshotId,
  comparisonId,
  onBoard,
  onSnapshot,
  onComparison
}: {
  boards: HistoricalLeaderboard[];
  snapshots: HistoricalLeaderboardSnapshot[];
  boardKey: string;
  snapshotId?: string;
  comparisonId?: string;
  onBoard: (value: string) => void;
  onSnapshot: (value: string) => void;
  onComparison: (value: string) => void;
}) {
  return (
    <section className="history-controls" aria-label="Leaderboard history controls">
      <label>
        <span>API board</span>
        <select value={boardKey} onChange={(event) => onBoard(event.target.value)}>
          {boards.map((board) => <option key={board.key} value={board.key}>{board.name} · {kindLabel(board)}</option>)}
        </select>
      </label>
      <label>
        <span>Observation</span>
        <select value={snapshotId ?? ""} onChange={(event) => onSnapshot(event.target.value)} disabled={!snapshots.length}>
          {snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{dateTime.format(snapshot.observedAt)}</option>)}
          {!snapshots.length ? <option value="">No observations</option> : null}
        </select>
      </label>
      <label>
        <span>Compare against</span>
        <select value={comparisonId ?? "none"} onChange={(event) => onComparison(event.target.value)} disabled={snapshots.length < 2}>
          <option value="none">No comparison</option>
          {snapshots.filter((snapshot) => snapshot.id !== snapshotId).map((snapshot) => (
            <option key={snapshot.id} value={snapshot.id}>{dateTime.format(snapshot.observedAt)}</option>
          ))}
        </select>
      </label>
    </section>
  );
}

function Coverage({ activeBoard, snapshots }: { activeBoard?: HistoricalLeaderboard; snapshots: HistoricalLeaderboardSnapshot[] }) {
  if (!activeBoard) return null;
  return (
    <section className="history-coverage leaderboard-coverage" aria-label="Board coverage">
      <div><CalendarRange size={22} /><span>First captured</span><strong>{dateTime.format(activeBoard.firstObservedAt)}</strong></div>
      <div><Archive size={22} /><span>Changed snapshots</span><strong>{activeBoard.snapshotCount.toLocaleString()}</strong></div>
      <div><CalendarRange size={22} /><span>Last checked</span><strong>{dateTime.format(activeBoard.lastObservedAt)}</strong></div>
      <p>{snapshots.length < activeBoard.snapshotCount ? `Showing the newest ${snapshots.length} retained observations.` : "All retained observations are available in this picker."}</p>
    </section>
  );
}

function HistoryTable({ detail }: { detail: HistoricalLeaderboardDetail }) {
  const scoreLabel = detail.board.kind === "clanwars" ? "War trophies" : detail.board.kind === "clans" ? "Clan score" : "Score";
  return (
    <TableShell
      title={detail.board.name}
      head={["Rank", detail.board.kind === "clans" || detail.board.kind === "clanwars" ? "Clan" : "Player", scoreLabel, "Change"]}
      empty={!detail.entries.length}
      emptyMessage="The API returned no ranked entries in this observation."
      note={
        <>
          Captured {dateTime.format(detail.snapshot.observedAt)} from the official API. {detail.comparedAt
            ? `Changes compare with ${dateTime.format(detail.comparedAt)}.`
            : "Choose a second observation to calculate changes."} The archive stores at most the top 200 entries per snapshot; changed snapshots roll off after two years, while each board’s first capture is retained.
        </>
      }
    >
      {detail.entries.map((entry) => {
        const entityHref = detail.board.kind === "clans" || detail.board.kind === "clanwars"
          ? `/clans/${entry.tag}`
          : `/players/${entry.tag}`;
        const value = entry.score ?? entry.trophies;
        return (
          <tr key={entry.tag}>
            <td><RankCell rank={entry.rank} previousRank={entry.previousRank} /></td>
            <td><EntityCell href={entityHref} name={entry.name} sub={`#${entry.tag}`} /></td>
            <td>{value === undefined ? "—" : <TrophyCell value={value} />}</td>
            <td><ChangeValue rankChange={entry.rankChange} scoreChange={entry.scoreChange} /></td>
          </tr>
        );
      })}
    </TableShell>
  );
}

function ChangeValue({ rankChange, scoreChange }: { rankChange?: number; scoreChange?: number }) {
  if (rankChange === undefined && scoreChange === undefined) return <span className="history-new-entry">New / not compared</span>;
  return (
    <span className="history-change">
      {rankChange !== undefined ? <strong className={rankChange > 0 ? "positive" : rankChange < 0 ? "negative" : ""}>{rankChange > 0 ? "+" : ""}{rankChange} ranks</strong> : null}
      {scoreChange !== undefined ? <small>{scoreChange > 0 ? "+" : ""}{scoreChange.toLocaleString()} score</small> : null}
    </span>
  );
}

function EmptyArchive() {
  return (
    <section className="history-empty">
      <Archive size={36} />
      <h2>No leaderboard observations yet</h2>
      <p>Open a live leaderboard or let the crawler complete a discovery pass. History begins with that real API response; earlier boards are not backfilled from guesses.</p>
      <Link className="pink-button" href="/leaderboards">Open live leaderboards</Link>
    </section>
  );
}

function HistoryError({ message }: { message: string }) {
  return <div className="history-error" role="alert"><AlertTriangle size={24} /><span>{message}</span></div>;
}

function kindLabel(board: HistoricalLeaderboard) {
  if (board.kind === "event") return "Event / season board";
  if (board.kind === "clanwars") return "Clan wars";
  return board.kind === "clans" ? "Clan ranking" : "Player ranking";
}
