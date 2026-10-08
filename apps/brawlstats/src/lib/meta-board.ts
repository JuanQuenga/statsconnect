import type { BrawlerMapStat, BrawlerMatchupStat } from "./types.ts";

/**
 * Pure derivations behind the /meta board. Everything here works on the raw
 * `metaTrends` payload so the page needs no backend changes, and stays free of
 * runtime imports so `node --test` can load it with type stripping.
 */

export type Tier = "S" | "A" | "B" | "C" | "D";
export const TIERS: readonly Tier[] = ["S", "A", "B", "C", "D"];
/** Cumulative score-percentile cut-offs for S, A, B, C; everything after is D. */
const TIER_CUTS = [0.1, 0.3, 0.6, 0.85] as const;
/** Share of all in-scope picks a brawler needs before it is ranked. */
export const SAMPLE_SHARE = 0.0025;
export const MATCHUP_MIN_PICKS = 10;

export type BoardSortKey = "score" | "win" | "use" | "star" | "picks" | "delta";
export type SortDirection = "asc" | "desc";
/** mapId -> game mode id, built from the maps catalog. */
export type MapModes = ReadonlyMap<number, number | undefined>;
export type Scope = { mapModes: MapModes; modeId?: number };

type Totals = { wins: number; losses: number; picks: number; starPlayer: number };

export type BoardRow = Totals & {
  brawlerId: number;
  winRate: number;
  useRate: number;
  starRate: number;
  /** Wilson 95% lower bound of win rate, in percent. */
  score: number;
  qualified: boolean;
  tier: Tier | null;
  previousPicks: number;
  previousUseRate: number | null;
  /** Use-rate change in percentage points; null without a comparable sample. */
  useDelta: number | null;
};

export type MetaBoard = {
  rows: BoardRow[];
  totalPicks: number;
  previousTotalPicks: number;
  floor: number;
  previousFloor: number;
  hasPrevious: boolean;
};

export type RatedGroup = Totals & { winRate: number; score: number };

/** Wilson score interval for a binomial proportion, returned in percent. */
export function wilsonBounds(wins: number, decided: number, z = 1.96): [number, number] {
  if (decided <= 0) return [0, 0];
  const p = wins / decided;
  const z2 = z * z;
  const centre = p + z2 / (2 * decided);
  const margin = z * Math.sqrt((p * (1 - p)) / decided + z2 / (4 * decided * decided));
  const denominator = 1 + z2 / decided;
  return [
    Math.max(0, ((centre - margin) / denominator) * 100),
    Math.min(100, ((centre + margin) / denominator) * 100),
  ];
}

export function wilsonLowerBound(wins: number, decided: number, z = 1.96) {
  return wilsonBounds(wins, decided, z)[0];
}

/** Picks a row needs to be ranked: the API floor or 0.25% of the sample, whichever is larger. */
export function sampleFloor(totalPicks: number, minPicks: number) {
  return Math.max(minPicks, Math.ceil(totalPicks * SAMPLE_SHARE));
}

export function inScope(mapId: number, scope: Scope) {
  return scope.modeId === undefined || scope.mapModes.get(mapId) === scope.modeId;
}

function rate(wins: number, losses: number) {
  const decided = wins + losses;
  return decided ? (wins / decided) * 100 : 0;
}

function addTotals(target: Totals, source: Totals) {
  target.wins += source.wins;
  target.losses += source.losses;
  target.picks += source.picks;
  target.starPlayer += source.starPlayer;
}

function emptyTotals(): Totals {
  return { wins: 0, losses: 0, picks: 0, starPlayer: 0 };
}

function rated<T extends Totals>(row: T): T & RatedGroup {
  return { ...row, winRate: rate(row.wins, row.losses), score: wilsonLowerBound(row.wins, row.wins + row.losses) };
}

function totalsByBrawler(stats: readonly BrawlerMapStat[], scope: Scope) {
  const totals = new Map<number, Totals>();
  let picks = 0;
  for (const stat of stats) {
    if (!inScope(stat.mapId, scope)) continue;
    const row = totals.get(stat.brawlerId) || emptyTotals();
    addTotals(row, stat);
    totals.set(stat.brawlerId, row);
    picks += stat.picks;
  }
  return { totals, picks };
}

/** Assigns S–D by score percentile among qualified rows. Mutates and returns `rows`. */
export function assignTiers<T extends { score: number; picks: number; qualified: boolean; tier: Tier | null }>(rows: T[]) {
  const ranked = rows.filter((row) => row.qualified).sort((a, b) => b.score - a.score || b.picks - a.picks);
  ranked.forEach((row, index) => {
    const percentile = index / ranked.length;
    const cut = TIER_CUTS.findIndex((limit) => percentile < limit);
    row.tier = TIERS[cut === -1 ? TIERS.length - 1 : cut];
  });
  return rows;
}

export function buildMetaBoard(input: {
  current: readonly BrawlerMapStat[];
  previous?: readonly BrawlerMapStat[] | null;
  scope: Scope;
  minPicks: number;
}): MetaBoard {
  const current = totalsByBrawler(input.current, input.scope);
  const previous = totalsByBrawler(input.previous || [], input.scope);
  const floor = sampleFloor(current.picks, input.minPicks);
  const previousFloor = sampleFloor(previous.picks, input.minPicks);
  const hasPrevious = Boolean(input.previous) && previous.picks > 0;
  const rows: BoardRow[] = [...current.totals.entries()]
    .filter(([, totals]) => totals.picks > 0)
    .map(([brawlerId, totals]) => {
      const before = previous.totals.get(brawlerId);
      const qualified = totals.picks >= floor;
      const useRate = current.picks ? (totals.picks / current.picks) * 100 : 0;
      const previousUseRate = hasPrevious ? ((before?.picks || 0) / previous.picks) * 100 : null;
      const comparable = hasPrevious && qualified && (before?.picks || 0) >= previousFloor;
      return {
        ...rated(totals),
        brawlerId,
        useRate,
        starRate: totals.picks ? (totals.starPlayer / totals.picks) * 100 : 0,
        qualified,
        tier: null,
        previousPicks: before?.picks || 0,
        previousUseRate,
        useDelta: comparable && previousUseRate !== null ? useRate - previousUseRate : null,
      };
    });
  assignTiers(rows);
  return { rows, totalPicks: current.picks, previousTotalPicks: previous.picks, floor, previousFloor, hasPrevious };
}

function sortValue(row: BoardRow, key: BoardSortKey) {
  if (key === "score") return row.score;
  if (key === "win") return row.winRate;
  if (key === "use") return row.useRate;
  if (key === "star") return row.starRate;
  if (key === "picks") return row.picks;
  return row.useDelta;
}

/** Sorts a copy of `rows`. Rows without a value (e.g. no Δ) always sink to the bottom. */
export function sortBoardRows(rows: readonly BoardRow[], key: BoardSortKey, direction: SortDirection) {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a, key);
    const right = sortValue(b, key);
    if (left === null || right === null) {
      if (left === right) return b.picks - a.picks;
      return left === null ? 1 : -1;
    }
    return sign * (left - right) || b.picks - a.picks;
  });
}

export function median(values: readonly number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export type Quadrant = "staples" | "gems" | "overplayed" | "avoid";

export function quadrantOf(row: Pick<BoardRow, "winRate" | "useRate">, medianUse: number): Quadrant {
  const strong = row.winRate >= 50;
  const popular = row.useRate >= medianUse;
  if (strong) return popular ? "staples" : "gems";
  return popular ? "overplayed" : "avoid";
}

export type MetaHighlights = {
  leaders: BoardRow[];
  best: BoardRow | null;
  mostPicked: BoardRow | null;
  riser: BoardRow | null;
  faller: BoardRow | null;
  /** Highest-scoring winning brawler that sits below the median use rate. */
  gem: BoardRow | null;
  medianUse: number;
  qualifiedCount: number;
};

/** Inputs for the pulse tiles and the plain-language summary. */
export function metaHighlights(board: MetaBoard): MetaHighlights {
  const qualified = board.rows.filter((row) => row.qualified);
  const byScore = [...qualified].sort((a, b) => b.score - a.score || b.picks - a.picks);
  const medianUse = median(qualified.map((row) => row.useRate));
  const moved = qualified.filter((row) => row.useDelta !== null);
  const riser = moved.reduce<BoardRow | null>((top, row) => (row.useDelta! > 0 && (!top || row.useDelta! > top.useDelta!) ? row : top), null);
  const faller = moved.reduce<BoardRow | null>((low, row) => (row.useDelta! < 0 && (!low || row.useDelta! < low.useDelta!) ? row : low), null);
  const leaders = byScore.slice(0, 2);
  return {
    leaders,
    best: byScore[0] || null,
    mostPicked: [...qualified].sort((a, b) => b.picks - a.picks)[0] || null,
    riser,
    faller,
    gem: byScore.find((row) => row.useRate < medianUse && row.winRate > 50 && !leaders.includes(row)) || null,
    medianUse,
    qualifiedCount: qualified.length,
  };
}

export type ModeVolume = { modeId: number; picks: number };

/** Game modes that have picks in `stats`, busiest first. */
export function modesWithData(stats: readonly BrawlerMapStat[], mapModes: MapModes): ModeVolume[] {
  const volumes = new Map<number, number>();
  for (const stat of stats) {
    const modeId = mapModes.get(stat.mapId);
    if (modeId === undefined) continue;
    volumes.set(modeId, (volumes.get(modeId) || 0) + stat.picks);
  }
  return [...volumes.entries()].map(([modeId, picks]) => ({ modeId, picks })).filter((mode) => mode.picks > 0).sort((a, b) => b.picks - a.picks);
}

export type MapPick = RatedGroup & { brawlerId: number };

/** Best brawlers on one map by score, among rows clearing that map's sample floor. */
export function topPicksForMap(stats: readonly BrawlerMapStat[], mapId: number, minPicks: number, count = 3): MapPick[] {
  const rows = stats.filter((stat) => stat.mapId === mapId);
  const floor = sampleFloor(rows.reduce((sum, stat) => sum + stat.picks, 0), minPicks);
  return rows
    .filter((stat) => stat.picks >= floor)
    .map((stat) => rated({ brawlerId: stat.brawlerId, wins: stat.wins, losses: stat.losses, picks: stat.picks, starPlayer: stat.starPlayer }))
    .sort((a, b) => b.score - a.score || b.picks - a.picks)
    .slice(0, count);
}

export type ModeBreakdown = RatedGroup & { modeId: number };

/** A brawler's results per game mode (ignores the mode filter on purpose). */
export function brawlerModes(stats: readonly BrawlerMapStat[], brawlerId: number, mapModes: MapModes, minPicks: number): ModeBreakdown[] {
  const modes = new Map<number, Totals>();
  for (const stat of stats) {
    const modeId = mapModes.get(stat.mapId);
    if (stat.brawlerId !== brawlerId || modeId === undefined) continue;
    const row = modes.get(modeId) || emptyTotals();
    addTotals(row, stat);
    modes.set(modeId, row);
  }
  return [...modes.entries()]
    .map(([modeId, totals]) => rated({ modeId, ...totals }))
    .filter((row) => row.picks >= minPicks)
    .sort((a, b) => b.winRate - a.winRate || b.picks - a.picks);
}

export type MapBreakdown = RatedGroup & { mapId: number };

export function brawlerBestMaps(stats: readonly BrawlerMapStat[], brawlerId: number, scope: Scope, minPicks: number, count = 5): MapBreakdown[] {
  return stats
    .filter((stat) => stat.brawlerId === brawlerId && stat.picks >= minPicks && inScope(stat.mapId, scope))
    .map((stat) => rated({ mapId: stat.mapId, wins: stat.wins, losses: stat.losses, picks: stat.picks, starPlayer: stat.starPlayer }))
    .sort((a, b) => b.score - a.score || b.picks - a.picks)
    .slice(0, count);
}

export type MatchupRow = RatedGroup & { opponentId: number; upper: number };

/**
 * Head-to-head record of `brawlerId` against each opponent across in-scope
 * maps. Best matchups sort by the Wilson lower bound, worst by the upper
 * bound, so a handful of lucky or unlucky games cannot dominate either list.
 */
export function brawlerMatchups(matchups: readonly BrawlerMatchupStat[], brawlerId: number, scope: Scope, count = 5) {
  const opponents = new Map<number, Totals>();
  let total = 0;
  for (const matchup of matchups) {
    if (matchup.brawlerId !== brawlerId || matchup.opponentBrawlerId === brawlerId || !inScope(matchup.mapId, scope)) continue;
    const row = opponents.get(matchup.opponentBrawlerId) || emptyTotals();
    addTotals(row, { wins: matchup.wins, losses: matchup.losses, picks: matchup.picks, starPlayer: 0 });
    opponents.set(matchup.opponentBrawlerId, row);
    total += matchup.picks;
  }
  const floor = Math.max(MATCHUP_MIN_PICKS, Math.ceil(total * 0.005));
  const rows: MatchupRow[] = [...opponents.entries()]
    .filter(([, totals]) => totals.picks >= floor)
    .map(([opponentId, totals]) => ({ ...rated({ opponentId, ...totals }), upper: wilsonBounds(totals.wins, totals.wins + totals.losses)[1] }));
  const best = [...rows].filter((row) => row.winRate > 50).sort((a, b) => b.score - a.score || b.picks - a.picks).slice(0, count);
  const worst = [...rows].filter((row) => row.winRate < 50).sort((a, b) => a.upper - b.upper || b.picks - a.picks).slice(0, count);
  return { best, worst, floor };
}
