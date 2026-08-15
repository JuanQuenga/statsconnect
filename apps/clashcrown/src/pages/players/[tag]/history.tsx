import Head from "@/components/Head";
import Link from "@/components/Link";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { Layout } from "@/components/portfolio/Layout";
import { isConvexConfigured } from "@/lib/convex";
import { playerHistoryQuery, type PathSnapshot, type PlayerHistorySnapshot } from "@/lib/history";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { ArrowLeft, CalendarClock, Database, ShieldCheck } from "lucide-react";

const dateTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short"
});

export default function PlayerHistoryPage() {
  const params = useParams({ strict: false });
  const tag = typeof params.tag === "string" ? params.tag.replace(/^#/, "").toUpperCase() : "";
  if (!isConvexConfigured) return <Layout><SetupState feature="player history" /></Layout>;
  if (!tag) return <Layout><ErrorState message="A player tag is required to open history." /></Layout>;
  return <PlayerHistory tag={tag} />;
}

function PlayerHistory({ tag }: { tag: string }) {
  const convex = useConvex();
  const query = useQuery({
    queryKey: ["player-history", tag],
    queryFn: () => convex.query(playerHistoryQuery, { tag, limit: 80 }),
    retry: false
  });

  if (query.isLoading) return <Layout><LoadingState label="observed player history" /></Layout>;
  if (query.error) return <Layout><ErrorState message="Royale Stats could not read this player’s history right now." /></Layout>;
  const snapshots = query.data ?? [];
  const latest = snapshots.find((snapshot) => snapshot.source === "api_profile");

  return (
    <Layout>
      <Head>
        <title>{`${latest?.name ?? `#${tag}`} History | Royale Stats`}</title>
        <meta name="description" content="Timestamped Royale Stats player observations and API-provided Path of Legends snapshots." />
      </Head>
      <div className="profile-page history-page">
        <section className="decks-hero history-hero">
          <h1>{latest?.name ?? `#${tag}`}</h1>
          <p>
            A change log built only from profile payloads Royale Stats actually received. Gaps mean the profile was not
            observed, not that nothing changed.
          </p>
          <Link className="history-back-link" href={`/players/${tag}`}><ArrowLeft size={16} /> Back to profile</Link>
        </section>

        {!snapshots.length ? (
          <section className="history-empty" aria-live="polite">
            <Database size={34} />
            <h2>No observations yet</h2>
            <p>Load the live player profile once to create the first snapshot. Royale Stats does not fabricate earlier seasons.</p>
            <Link className="pink-button" href={`/players/${tag}`}>Load player profile</Link>
          </section>
        ) : (
          <>
            <CoverageSummary snapshots={snapshots} />
            <ApiPathSection snapshot={latest} />
            <ObservedTimeline snapshots={snapshots} />
          </>
        )}
      </div>
    </Layout>
  );
}

function CoverageSummary({ snapshots }: { snapshots: PlayerHistorySnapshot[] }) {
  const oldest = snapshots.at(-1)!;
  const newest = snapshots[0]!;
  const fullSnapshots = snapshots.filter((snapshot) => snapshot.source === "api_profile").length;
  return (
    <section className="history-coverage" aria-label="History coverage">
      <div><CalendarClock size={22} /><span>First observed</span><strong>{dateTime.format(oldest.observedAt)}</strong></div>
      <div><ShieldCheck size={22} /><span>Meaningful changes</span><strong>{snapshots.length.toLocaleString()}</strong></div>
      <div><Database size={22} /><span>Full API snapshots</span><strong>{fullSnapshots.toLocaleString()}</strong></div>
      <p>
        Last checked {dateTime.format(newest.lastObservedAt)}. Unchanged refreshes extend coverage without adding a duplicate row.
      </p>
    </section>
  );
}

function ApiPathSection({ snapshot }: { snapshot?: PlayerHistorySnapshot }) {
  const path = snapshot?.path;
  const rows: Array<{ label: string; value?: PathSnapshot }> = [
    { label: "Current season snapshot", value: path?.current },
    { label: "Last season snapshot", value: path?.last },
    { label: "Personal-best snapshot", value: path?.best }
  ];
  return (
    <section className="profile-section">
      <div className="section-heading compact-heading"><span className="filter-button static">Official API</span><h2>Path of Legends</h2><span /></div>
      <div className="history-path-grid">
        {rows.map(({ label, value }) => (
          <article key={label} className="history-path-card">
            <span>{label}</span>
            <strong>{formatNumber(value?.trophies)}</strong>
            <small>{value?.rank ? `Rank #${value.rank.toLocaleString()}` : "No rank returned"}</small>
          </article>
        ))}
      </div>
      <p className="table-note">
        Supercell returns current, last, and personal-best results but no stable season identifier. These labels describe
        the API fields as observed {snapshot ? dateTime.format(snapshot.observedAt) : "—"}; Royale Stats does not assign season names.
      </p>
    </section>
  );
}

function ObservedTimeline({ snapshots }: { snapshots: PlayerHistorySnapshot[] }) {
  return (
    <section className="profile-section">
      <div className="section-heading compact-heading">
        <span className="filter-button static">Royale Stats observed</span>
        <h2>Profile changes</h2>
        <span className="chart-range">Newest first</span>
      </div>
      <ol className="history-timeline">
        {snapshots.map((snapshot, index) => (
          <SnapshotCard key={snapshot.id} snapshot={snapshot} previous={snapshots[index + 1]} />
        ))}
      </ol>
      <p className="table-note">
        Legacy rows contain only the trophy value and timestamp that were already stored. Full snapshots are retained for
        three years; no pre-observation values or season assignments are inferred.
      </p>
    </section>
  );
}

function SnapshotCard({ snapshot, previous }: { snapshot: PlayerHistorySnapshot; previous?: PlayerHistorySnapshot }) {
  const metrics = [
    metric("Trophies", snapshot.trophies, previous?.trophies),
    metric("Best trophies", snapshot.bestTrophies, previous?.bestTrophies),
    metric("Battles", snapshot.totals?.battleCount, previous?.totals?.battleCount),
    metric("Wins", snapshot.totals?.wins, previous?.totals?.wins),
    metric("Cards owned", snapshot.collection?.cardsOwned, previous?.collection?.cardsOwned),
    metric("Total card levels", snapshot.collection?.totalLevels, previous?.collection?.totalLevels),
    metric("Maxed cards", snapshot.collection?.maxedCards, previous?.collection?.maxedCards),
    metric("Evolutions", snapshot.collection?.evolvedCards, previous?.collection?.evolvedCards)
  ].filter((item) => item.value !== undefined);
  const clanChanged = previous && snapshot.clanTag !== previous.clanTag;

  return (
    <li className="history-snapshot-card">
      <div className="history-snapshot-time">
        <span className={`history-source ${snapshot.source}`}>{sourceLabel(snapshot.source)}</span>
        <time dateTime={new Date(snapshot.observedAt).toISOString()}>{dateTime.format(snapshot.observedAt)}</time>
        {snapshot.lastObservedAt > snapshot.observedAt ? <small>State last seen {dateTime.format(snapshot.lastObservedAt)}</small> : null}
      </div>
      <div className="history-metrics">
        {metrics.length ? metrics.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value?.toLocaleString()}</strong>
            {item.delta !== undefined && item.delta !== 0 ? <small className={item.delta > 0 ? "positive" : "negative"}>{item.delta > 0 ? "+" : ""}{item.delta.toLocaleString()}</small> : null}
          </div>
        )) : <p>Only the fields listed in the source record were available.</p>}
      </div>
      <div className="history-context">
        <span>Clan: <strong>{snapshot.clanName ?? "No clan returned"}</strong>{clanChanged ? " · changed" : ""}</span>
        <span>Deck: <strong>{snapshot.currentDeck?.length ? `${snapshot.currentDeck.length} cards recorded` : "Not returned"}</strong></span>
        <span>Arena: <strong>{snapshot.arenaName ?? "Not returned"}</strong></span>
      </div>
    </li>
  );
}

function metric(label: string, value?: number, prior?: number) {
  return { label, value, delta: value !== undefined && prior !== undefined ? value - prior : undefined };
}

function formatNumber(value?: number) {
  return value === undefined ? "—" : value.toLocaleString();
}

function sourceLabel(source: PlayerHistorySnapshot["source"]) {
  if (source === "api_profile") return "Full API snapshot";
  if (source === "battle_log") return "Battle-log observation";
  return "Legacy trophy record";
}
