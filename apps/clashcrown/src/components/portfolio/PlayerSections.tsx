import Image from "@/components/Image";
import Link from "@/components/Link";
import { useQuery } from "convex/react";
import { RefreshCcw } from "lucide-react";
import { NO_CLAN_BADGE_IMAGE, variantArt } from "@/lib/clash/assets";
import { analyzePlayerBattles } from "@/lib/clash/battles";
import { cardSlug } from "@/lib/clash/cards";
import { isConvexConfigured, profileHistoryQuery } from "@/lib/convex";
import { CardArt } from "@/components/portfolio/CardArt";
import { PlayerCardCollection } from "@/components/portfolio/PlayerCardCollection";
import { PlayerShareActions } from "@/components/portfolio/PlayerShareActions";
import type { Battle, Card, Chest, PathOfLegendsResult, Player } from "@/lib/mock-data";
import type { ProfileHistoryPoint } from "@/lib/clash/types";

const tabItems = [
  { label: "Statistics", icon: "/images/icons/trophy.png" },
  { label: "Battles", icon: "/images/icons/sword.png" },
  { label: "Decks", icon: "/images/icons/cardsq.png" },
  { label: "Cards", icon: "/images/icons/book-cards.png" }
];

export function PlayerHero({ player }: { player: Player }) {
  return (
    <section className="profile-hero">
      <CardArt
        src={player.clanBadge ?? NO_CLAN_BADGE_IMAGE}
        alt=""
        width={74}
        height={92}
        priority
        fallback={NO_CLAN_BADGE_IMAGE}
      />
      <span>
        {player.clanTag ? <Link href={`/clans/${player.clanTag.replace(/^#/, "")}`}>{player.clan} &gt;</Link> : `${player.clan} >`}
      </span>
      <h1>{player.name}{player.level !== undefined ? <span className="hero-level" aria-label={`Level ${player.level}`}>{player.level}</span> : null}</h1>
      <strong>#{player.tag}</strong>
      <div className="card-detail-meta hero-chips">
        <span className="status-chip">
          <Image src={player.arenaImage} alt="" width={20} height={20} />
          {player.arena}
        </span>
        {player.pathOfLegends?.current?.trophies !== undefined ? (
          <span className="status-chip">
            Path of Legends · {player.pathOfLegends.current.trophies.toLocaleString()}
            {player.pathOfLegends.current.rank ? ` · #${player.pathOfLegends.current.rank.toLocaleString()}` : ""}
          </span>
        ) : null}
        {player.clanTag ? (
          <Link className="status-chip" href={`/clans/${player.clanTag.replace(/^#/, "")}/war`}>
            Clan war
          </Link>
        ) : null}
      </div>
      <PlayerShareActions player={player} />
    </section>
  );
}

export type PlayerTab = "Statistics" | "Battles" | "Decks" | "Cards";

export function PlayerTabs({ active, onChange }: { active: PlayerTab; onChange: (tab: PlayerTab) => void }) {
  return (
    <nav className="profile-tabs" aria-label="Player sections">
      {tabItems.map((tab) => (
        <button key={tab.label} type="button" className={active === tab.label ? "active" : ""} onClick={() => onChange(tab.label as PlayerTab)}>
          <Image src={tab.icon} alt="" width={44} height={44} />
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export function PlayerStats({ player, onRefresh, isRefreshing }: { player: Player; onRefresh: () => void; isRefreshing: boolean }) {
  const rows = [
    ...(player.bestTrophies !== undefined ? [["Highest trophies", player.bestTrophies.toLocaleString()]] : []),
    ...Object.entries(player.stats)
  ];

  return (
    <section className="profile-section">
      <div className="section-tools">
        <FilterButton />
        <div className="update-tools"><span>{updatedLabel(player.fetchedAt)}</span><button type="button" onClick={onRefresh} disabled={isRefreshing}><RefreshCcw className={isRefreshing ? "spin" : ""} size={16} />{isRefreshing ? "Refreshing" : "Refresh"}</button></div>
      </div>
      {rows.length ? (
        <div className="stat-matrix">
          {rows.map(([label, value]) => (
            <div key={label} className="stat-cell">
              <Image src={statIcon(label, player.arenaImage)} alt="" width={46} height={46} />
              <div>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="empty-results">The API did not report player statistics for this profile.</p>}
    </section>
  );
}

export function PerformanceSection({ battles }: { battles: Battle[] }) {
  const performance = analyzePlayerBattles(battles);
  if (!performance.games) return <EmptyPanel title="No battle performance yet" copy="Performance will appear when this player's battle log has a result." />;

  return (
    <section className="profile-section performance-section">
      <div className="section-heading">
        <span className="filter-button static">Last {performance.games} battles</span>
        <h2>Performance</h2>
        <span />
      </div>
      <div className="stat-matrix performance-stats">
        <PerformanceStat
          icon="/images/icons/sword.png"
          value={performance.draws ? `${performance.wins}–${performance.losses}–${performance.draws}` : `${performance.wins}–${performance.losses}`}
          label={performance.draws ? "W / L / D record" : "W / L record"}
        />
        <PerformanceStat icon="/images/icons/trophy.png" value={`${performance.winRate.toFixed(1)}%`} label="Win rate" />
        <PerformanceStat icon="/images/icons/crown-gold.png" value={`${performance.threeCrownRate.toFixed(1)}%`} label={`${performance.threeCrownWins} three-crown wins`} />
        <PerformanceStat icon="/images/icons/sword.png" value={`${performance.currentWinStreak} / ${performance.bestWinStreak}`} label="Current / best streak" />
      </div>
      <div className="performance-grid">
        <div className="performance-card">
          <h3>Win rate by mode</h3>
          <div className="members-table-wrap">
            <table className="members-table">
              <thead><tr><th>Mode</th><th>Record</th><th>Win rate</th></tr></thead>
              <tbody>
                {performance.modes.map((mode) => (
                  <tr key={mode.mode}>
                    <td>{mode.mode}</td>
                    <td>{mode.wins}–{mode.losses}</td>
                    <td>{mode.winRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="performance-card recent-form-card">
          <h3>Recent form</h3>
          <div className="form-pips" role="list" aria-label={`Last ${performance.recent.length} battles, newest first`}>
            {performance.recent.map((battle, index) => (
              <span
                key={`${battle.date}-${battle.opponent}-${index}`}
                className={`form-pip ${battle.result.toLowerCase()}`}
                role="listitem"
                title={`${battle.result} · ${battle.mode}`}
                aria-label={`${battle.result}, ${battle.mode}`}
              >
                {battle.result === "Win" ? "W" : battle.result === "Draw" ? "D" : "L"}
              </span>
            ))}
          </div>
          <div className="form-legend"><span><i className="form-pip win">W</i> Win</span><span><i className="form-pip loss">L</i> Loss</span><span><i className="form-pip draw">D</i> Draw</span></div>
          <p className="table-note">Newest first · {performance.recent.length} of {performance.games} battles shown</p>
        </div>
      </div>
      <p className="table-note">All figures are calculated from this player's last {performance.games} battles, so small samples can swing quickly.</p>
      <PerformanceStyles />
    </section>
  );
}

function PerformanceStat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="stat-cell">
      <Image src={icon} alt="" width={46} height={46} />
      <div><strong>{value}</strong><span>{label}</span></div>
    </div>
  );
}

function PerformanceStyles() {
  return (
    <style>{`
      .performance-stats { margin-bottom: 34px; }
      .performance-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(260px, .85fr); gap: 28px; }
      .performance-card { min-width: 0; padding: 18px; border: 1px solid rgba(62, 88, 128, .2); border-radius: 7px; background: rgba(8, 24, 44, .52); }
      .performance-card h3 { margin: 0 0 16px; color: #dfe8f8; font-size: 14px; }
      .performance-card .members-table-wrap { margin: 0 -18px -18px; }
      .performance-card .members-table td { height: 52px; }
      .recent-form-card { display: flex; flex-direction: column; justify-content: center; }
      .form-pips { display: flex; gap: 7px; flex-wrap: wrap; }
      .form-pip { width: 28px; height: 28px; display: inline-grid; place-items: center; border-radius: 50%; color: white; font: 700 11px var(--font-ui); font-style: normal; }
      .form-pip.win { background: #218b61; box-shadow: 0 0 0 1px rgba(83, 220, 151, .3) inset; }
      .form-pip.loss { background: #a63c5b; box-shadow: 0 0 0 1px rgba(255, 126, 153, .3) inset; }
      .form-pip.draw { background: #4a5a78; box-shadow: 0 0 0 1px rgba(142, 162, 196, .3) inset; }
      .form-legend { display: flex; gap: 16px; margin-top: 18px; color: #8ea2c4; font: 11px var(--font-ui); }
      .form-legend span { display: inline-flex; align-items: center; gap: 6px; }
      .form-legend .form-pip { width: 18px; height: 18px; font-size: 9px; }
      @media (max-width: 680px) {
        .performance-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}

function statIcon(label: string, arenaImage: string) {
  if (label === "Arena") return arenaImage;
  if (label.includes("card")) return "/images/icons/cardsq.png";
  if (label.includes("3 crown")) return "/images/icons/crown-gold.png";
  if (label.includes("donation")) return "/images/icons/crown-2d.png";
  if (label.includes("win") || label === "Losses" || label === "Battles") return "/images/icons/sword.png";
  return "/images/icons/trophy.png";
}

/**
 * This season, last season, and this player's personal best — the only three
 * Path of Legends snapshots Supercell exposes. Not a season history, so the
 * copy here never implies one. Absent entirely (see `mapPathOfLegends`) for a
 * player who has never queued Path of Legends.
 */
export function PathOfLegendsSeasons({ player }: { player: Player }) {
  const seasons = player.pathOfLegends;
  if (!seasons) return null;

  const rows: Array<{ label: string; result?: PathOfLegendsResult }> = [
    { label: "This season", result: seasons.current },
    { label: "Last season", result: seasons.last },
    { label: "Personal best", result: seasons.best }
  ];

  return (
    <section className="profile-section">
      <div className="section-heading compact-heading">
        <span className="filter-button static">Path of Legends</span>
        <h2>Season Comparison</h2>
        <span />
      </div>
      <div className="pol-columns">
        {rows.map(({ label, result }) => (
          <div key={label} className="pol-card">
            <span className="pol-label">{label}</span>
            <strong>{result?.trophies !== undefined ? result.trophies.toLocaleString() : "—"}</strong>
            <span>{result?.rank ? `#${result.rank.toLocaleString()}` : "Unranked"}</span>
          </div>
        ))}
      </div>
      <p className="table-note">
        These are the only three Path of Legends snapshots the API returns — not a full season history.
      </p>
    </section>
  );
}

export function BattleHistory({ battles }: { battles: Battle[] }) {
  if (!battles.length) return <EmptyPanel title="No recent battles" copy="The API did not return any battles for this player." />;

  return (
    <section className="profile-section">
      <div className="section-heading compact-heading"><span className="filter-button static">Recent</span><h2>Battle Log</h2><span /></div>
      <div className="battle-history">
        {battles.map((battle, index) => (
          <article key={`${battle.date}-${battle.opponent}-${index}`} className={`battle-card ${battle.result.toLowerCase()}`}>
            <div className="battle-result"><strong>{battle.result}</strong><span>{battle.mode}</span><small>{battle.date}</small></div>
            <div className="battle-opponent"><span>Opponent</span><strong>{battle.opponent}</strong><small>{battle.opponentClan ?? "No clan"}</small></div>
            <div className="battle-score"><strong>{battle.crowns[0]}–{battle.crowns[1]}</strong><span>{battle.trophyChange > 0 ? "+" : ""}{battle.trophyChange} trophies</span></div>
            <MiniDeck cards={battle.deck} />
          </article>
        ))}
      </div>
    </section>
  );
}

export function DeckOverview({ cards, supportCards = [] }: { cards: Card[]; supportCards?: Card[] }) {
  if (!cards.length) return <EmptyPanel title="No current deck" copy="This player's current deck is private or unavailable." />;
  const average = cards.reduce((sum, card) => sum + card.elixir, 0) / cards.length;
  const cycle = [...cards].map((card) => card.elixir).filter((cost) => cost > 0).sort((a, b) => a - b).slice(0, 4).reduce((total, cost) => total + cost, 0);
  return (
    <section className="profile-section deck-overview">
      <div className="section-heading compact-heading"><span className="filter-button static">{average.toFixed(1)} elixir · {cycle} cycle</span><h2>Current Deck</h2><span /></div>
      <div className="collection-grid deck-collection">
        {cards.map((card, index) => <CollectionCard key={`${card.name}-${index}`} card={card} />)}
      </div>
      {supportCards.length ? (
        <>
          <div className="section-heading compact-heading"><span /><h2>Tower Troop</h2><span /></div>
          <div className="collection-grid deck-collection">
            {supportCards.map((card, index) => <CollectionCard key={`${card.name}-${index}`} card={card} />)}
          </div>
        </>
      ) : null}
    </section>
  );
}

export function DeckAnalyticsSection({ battles }: { battles: Battle[] }) {
  const decks = analyzePlayerBattles(battles).decks;
  if (!decks.length) return <EmptyPanel title="No complete decks in this log" copy="The API has not returned enough eight-card battles to compare this player's decks yet." />;

  return (
    <section className="profile-section deck-analytics-section">
      <div className="section-heading compact-heading">
        <span className="filter-button static">{decks.length} decks</span>
        <h2>Your decks</h2>
        <span />
      </div>
      <div className="members-table-wrap">
        <table className="members-table deck-analytics-table">
          <thead><tr><th>Deck</th><th>Uses</th><th>Win rate</th><th>Avg crowns</th><th>Modes played</th></tr></thead>
          <tbody>
            {decks.map((deck) => (
              <tr key={deck.key}>
                <td><div className="personal-deck-cards">{deck.cards.map((card, index) => <DeckThumbnail key={`${card.name}-${index}`} card={card} />)}</div></td>
                <td>{deck.uses}</td>
                <td><strong>{deck.winRate.toFixed(1)}%</strong><small className="deck-record">{deck.wins}–{deck.uses - deck.wins}</small></td>
                <td>{deck.averageCrowns.toFixed(2)}</td>
                <td className="deck-modes">{deck.modes.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-note">Grouped by the same eight cards, including whether a slot was played as an Evolution or Hero. Sorted by uses across the last {battles.length} battles.</p>
      <DeckAnalyticsStyles />
    </section>
  );
}

function DeckThumbnail({ card }: { card: Card }) {
  const variant = variantArt(card);
  const label = variant ? `${card.name} (${variant.label})` : card.name;
  return <CardArt src={variant?.src ?? card.image} alt={label} width={42} height={52} />;
}

function DeckAnalyticsStyles() {
  return (
    <style>{`
      .deck-analytics-table td:first-child { width: 48%; }
      .personal-deck-cards { display: grid; grid-template-columns: repeat(8, minmax(27px, 1fr)); gap: 4px; align-items: center; min-width: 280px; }
      .personal-deck-cards img { width: 100%; height: auto; max-height: 54px; object-fit: contain; margin: 0; }
      .deck-analytics-table td { vertical-align: middle; }
      .deck-analytics-table td strong { color: #f4fbff; }
      .deck-record { display: block; margin-top: 4px; color: #8ea2c4; font: 10px var(--font-ui); }
      .deck-modes { white-space: normal !important; line-height: 1.5; }
      @media (max-width: 980px) {
        .personal-deck-cards { min-width: 240px; }
      }
      @media (max-width: 680px) {
        .deck-analytics-table th:nth-child(4), .deck-analytics-table td:nth-child(4), .deck-analytics-table th:nth-child(5), .deck-analytics-table td:nth-child(5) { display: none; }
        .deck-analytics-table td:first-child { width: auto; }
        .personal-deck-cards { min-width: 220px; }
      }
    `}</style>
  );
}

export function CardCollection({
  player,
  catalogCards,
  catalogLoading,
  catalogError
}: {
  player: Player;
  catalogCards?: Card[];
  catalogLoading?: boolean;
  catalogError?: boolean;
}) {
  return <PlayerCardCollection player={player} catalogCards={catalogCards} catalogLoading={catalogLoading} catalogError={catalogError} />;
}

function MiniDeck({ cards }: { cards: Card[] }) {
  return <div className="mini-deck">{cards.slice(0, 8).map((card, index) => <DeckThumbnail key={`${card.name}-${index}`} card={card} />)}</div>;
}

function CollectionCard({ card }: { card: Card }) {
  return (
    <Link href={`/cards/${cardSlug(card.name)}`} className="collection-card">
      {card.isEvolution ? <span className="evo-flag">{variantArt(card)?.label === "Hero" ? "HERO" : "EVO"}</span> : null}
      {card.level ? <i className="card-level">{card.level}{card.maxLevel ? `/${card.maxLevel}` : ""}</i> : null}
      <CardArt src={variantArt(card)?.src ?? card.image} alt={card.name} width={82} height={100} />
      <strong>{card.name}</strong>
      <span>{card.rarity} · {card.elixir || "?"} elixir</span>
    </Link>
  );
}

function EmptyPanel({ title, copy }: { title: string; copy: string }) {
  return <section className="profile-section empty-panel"><h2>{title}</h2><p>{copy}</p></section>;
}

function updatedLabel(fetchedAt?: number) {
  if (!fetchedAt) return "demo data";
  const minutes = Math.max(0, Math.floor((Date.now() - fetchedAt) / 60_000));
  return minutes < 1 ? "updated just now" : `updated ${minutes}m ago`;
}

/** A single real snapshot is still more trustworthy than an inferred battle curve. */
const MIN_OBSERVED_POINTS = 1;

/**
 * Trophy chart for the Statistics tab. Prefers the real, visit-triggered
 * snapshots Convex has recorded for this player (`convex/cache.ts`'s
 * `history` query) and only falls back to a battle-derived guess when there
 * are no observed snapshots yet.
 *
 * `useQuery` needs the Convex provider `_app.tsx` only mounts when
 * `isConvexConfigured` (same constraint as `useCardCatalog.ts`), so the
 * branch that calls it is a separate component chosen here rather than a
 * conditional hook call.
 */
export function ProgressionChart({ player }: { player: Player }) {
  if (isConvexConfigured) return <ProgressionChartWithHistory player={player} />;
  return <InferredProgressionChart player={player} />;
}

function ProgressionChartWithHistory({ player }: { player: Player }) {
  const history = useQuery(profileHistoryQuery, { kind: "player", tag: player.tag });
  if (history && history.length >= MIN_OBSERVED_POINTS) return <ObservedProgressionChart history={history} />;
  return <InferredProgressionChart player={player} />;
}

function formatSnapshotDate(recordedAt: number) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(recordedAt));
}

function formatObservationWindow(spanMs: number) {
  const days = spanMs / 86_400_000;
  if (days < 1) return "under a day";
  const rounded = Math.round(days);
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

/**
 * Plots the real snapshots Convex recorded for this profile. Each one was
 * taken the moment somebody viewed it and the trophy count had moved since
 * the last view, so the gaps between points are however long it took for
 * someone to look again — irregular and not meaningful. The line is a compact
 * trend guide between observed points, not a claim of continuous tracking.
 */
function ObservedProgressionChart({ history }: { history: ProfileHistoryPoint[] }) {
  const values = history.map((point) => point.value);
  const times = history.map((point) => point.recordedAt);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1, maximum - minimum);
  const earliest = Math.min(...times);
  const mostRecent = Math.max(...times);
  const timeRange = Math.max(1, mostRecent - earliest);

  const coordinates = history.map((point) => ({
    x: history.length === 1 ? 470 : 22 + ((point.recordedAt - earliest) / timeRange) * 898,
    y: 210 - ((point.value - minimum) / range) * 170,
    value: point.value
  }));
  const linePath = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const latest = coordinates.at(-1) ?? { x: 470, y: 125, value: values.at(-1) ?? 0 };

  return (
    <section className="profile-section chart-section">
      <div className="section-heading">
        <FilterButton label="Observed" />
        <h2>Trophy Activity</h2>
        <span className="chart-range">
          {history.length} snapshots · {formatObservationWindow(mostRecent - earliest)}
        </span>
      </div>
      <div className="line-chart">
        <div className="y-axis">
          <Image src="/images/icons/trophy.png" alt="" width={24} height={24} />
          <span>{maximum.toLocaleString()}</span><span>{Math.round((maximum + minimum) / 2).toLocaleString()}</span><span>{minimum.toLocaleString()}</span>
        </div>
        <svg viewBox="0 0 930 250" aria-label="Observed trophy snapshots trend">
          {Array.from({ length: 10 }).map((_, index) => (
            <line key={index} x1={70 + index * 86} x2={70 + index * 86} y1="18" y2="205" className="grid-line" />
          ))}
          {linePath ? <path d={linePath} /> : null}
          {coordinates.slice(0, -1).map((point, index) => (
            <circle key={index} cx={point.x} cy={point.y} r="5" className="chart-dot" />
          ))}
          <circle cx={latest.x} cy={latest.y} r="8" />
          <foreignObject x={Math.max(0, Math.min(820, latest.x - 50))} y={Math.max(0, latest.y - 58)} width="110" height="42">
            <div className="chart-popover"><Image src="/images/icons/trophy.png" alt="" width={21} height={21} />{latest.value}</div>
          </foreignObject>
        </svg>
        <div className="x-axis">
          <span>{formatSnapshotDate(earliest)}</span>
          <span>{formatSnapshotDate(mostRecent)}</span>
        </div>
      </div>
      <p className="table-note">
        Each dot is a snapshot recorded when someone viewed this profile and the trophy count had changed since
        the last view — not continuous tracking, so the gaps between points don&apos;t show when a rise or fall
        actually happened.
      </p>
    </section>
  );
}

/**
 * Fallback curve, walking the last 10 battles' `trophyChange` deltas
 * backwards from the current trophy count. This is a guess, not observed
 * history, and the note under the chart says so.
 */
function InferredProgressionChart({ player }: { player: Player }) {
  if (player.trophies === undefined) {
    return <EmptyPanel title="No trophy activity available" copy="The API did not report a current trophy count for this player." />;
  }
  const recentBattles = player.battles.slice(0, 10).reverse();
  const startingTrophies = player.trophies - recentBattles.reduce((total, battle) => total + battle.trophyChange, 0);
  const values = recentBattles.reduce<number[]>((points, battle) => {
    points.push((points.at(-1) ?? startingTrophies) + battle.trophyChange);
    return points;
  }, [startingTrophies]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1, maximum - minimum);
  const coordinates = values.map((value, index) => ({
    x: values.length === 1 ? 470 : 22 + (index / (values.length - 1)) * 898,
    y: 210 - ((value - minimum) / range) * 170,
    value
  }));
  const linePath = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coordinates.at(-1)?.x ?? 920} 228 L${coordinates[0]?.x ?? 22} 228 Z`;
  const latest = coordinates.at(-1) ?? { x: 470, y: 125, value: player.trophies };
  const labels = ["Start", ...recentBattles.map((battle) => battle.date)];

  return (
    <section className="profile-section chart-section">
      <div className="section-heading">
        <FilterButton label="Inferred" />
        <h2>Trophy Activity</h2>
        <span className="chart-range">Last {recentBattles.length} battles</span>
      </div>
      <div className="line-chart">
        <div className="y-axis">
          <Image src="/images/icons/trophy.png" alt="" width={24} height={24} />
          <span>{maximum.toLocaleString()}</span><span>{Math.round((maximum + minimum) / 2).toLocaleString()}</span><span>{minimum.toLocaleString()}</span>
        </div>
        <svg viewBox="0 0 930 250" aria-label="Recent trophy activity line chart">
          <defs>
            <linearGradient id="chart-fill-trophies" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1b8cff" stopOpacity=".36" />
              <stop offset="100%" stopColor="#1b8cff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {Array.from({ length: 10 }).map((_, index) => (
            <line key={index} x1={70 + index * 86} x2={70 + index * 86} y1="18" y2="205" className="grid-line" />
          ))}
          <path className="chart-fill" d={areaPath} fill="url(#chart-fill-trophies)" />
          <path d={linePath} />
          <circle cx={latest.x} cy={latest.y} r="8" />
          <foreignObject x={Math.max(0, Math.min(820, latest.x - 50))} y={Math.max(0, latest.y - 58)} width="110" height="42">
            <div className="chart-popover"><Image src="/images/icons/trophy.png" alt="" width={21} height={21} />{latest.value}</div>
          </foreignObject>
        </svg>
        {/* Ten ladder battles are usually one sitting, so every tick carried the
            same date. Print a date only when it changes; the rest stay blank. */}
        <div className="x-axis">
          {labels.map((date, index) => {
            const short = index === 0 ? date : date.replace(/, \d{4}$/, "");
            const repeat = index > 1 && short === labels[index - 1].replace(/, \d{4}$/, "");
            return <span key={`${date}-${index}`}>{repeat ? "" : short}</span>;
          })}
        </div>
      </div>
      <p className="table-note">
        Inferred from this player&apos;s last {recentBattles.length} battles&apos; trophy changes — not observed
        history.
      </p>
    </section>
  );
}

export function ChestList({ chests }: { chests: Chest[] }) {
  if (!chests.length) return null;
  return (
    <section className="chest-footer">
      {/* "My Chests" on someone else's profile read as the viewer's own. */}
      <h2>Upcoming chests</h2>
      <div className="chest-row">
        {chests.map((chest, index) => (
          <div key={`${chest.name}-${index}`} className="chest-item" title={chest.name}>
            <Image src={chest.image} alt={chest.name} width={58} height={58} />
            <strong>+{chest.index}</strong>
          </div>
        ))}
      </div>
      <p className="chest-note">+N is how many more chests this player has to open before that one.</p>
    </section>
  );
}

function FilterButton({ label = "Trophies" }: { label?: string } = {}) {
  return (
    <span className="filter-button static">{label}</span>
  );
}
