/**
 * Pure helpers for compact player snapshots.
 *
 * recordProfile used to read and rewrite the full nested brawler roster on
 * every call. The roster now lives in its own table and a short fingerprint on
 * the snapshot document decides whether the roster actually changed, so a
 * trophy-level update patches a few hundred bytes instead of tens of KB.
 */

export type RosterEntryLike = {
  id: number;
  name: string;
  power: number;
  rank: number;
  trophies: number;
  highestTrophies: number;
  gadgets: Array<{ id: number }>;
  starPowers: Array<{ id: number }>;
  gears: Array<{ id: number }>;
  hypercharges: Array<{ id: number }>;
};

/** FNV-1a over a canonical serialization, plus length and id-sum guards. */
export function rosterFingerprint(brawlers: RosterEntryLike[] | null | undefined): string {
  const roster = brawlers ?? [];
  const canonical = JSON.stringify(
    roster
      .map((brawler) => [
        brawler.id,
        brawler.name,
        brawler.power,
        brawler.rank,
        brawler.trophies,
        brawler.highestTrophies,
        brawler.gadgets.map((item) => item.id),
        brawler.starPowers.map((item) => item.id),
        brawler.gears.map((item) => item.id),
        brawler.hypercharges.map((item) => item.id),
      ])
      .sort((left, right) => Number(left[0]) - Number(right[0])),
  );
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const idSum = roster.reduce((sum, brawler) => sum + brawler.id, 0);
  return `${(hash >>> 0).toString(16)}:${roster.length}:${idSum}`;
}

/** True when the stored fingerprint does not already describe this roster. */
export function rosterNeedsWrite(
  storedFingerprint: string | undefined,
  fingerprint: string,
): boolean {
  return storedFingerprint !== fingerprint;
}

/** Every snapshot field the daily doc carries besides the roster itself. */
export type SnapshotScalars = {
  recordedAt: number;
  name: string;
  trophies: number;
  highestTrophies: number;
  expLevel: number;
  victory3v3: number;
  soloVictories: number;
  duoVictories: number;
  clubTag: string | undefined;
  clubName: string | undefined;
  iconId: number | undefined;
  brawlerCount: number;
  power11Count: number;
  rankedCurrent: number | undefined;
  rankedCurrentName: string | undefined;
  rankedSeasonBest: number | undefined;
  rankedSeasonBestName: string | undefined;
  rankedBest: number | undefined;
  rankedBestName: string | undefined;
};

const SCALAR_FIELDS = [
  "recordedAt",
  "name",
  "trophies",
  "highestTrophies",
  "expLevel",
  "victory3v3",
  "soloVictories",
  "duoVictories",
  "clubTag",
  "clubName",
  "iconId",
  "brawlerCount",
  "power11Count",
  "rankedCurrent",
  "rankedCurrentName",
  "rankedSeasonBest",
  "rankedSeasonBestName",
  "rankedBest",
  "rankedBestName",
] as const;

/** Same field-by-field comparison recordProfile has always used. */
export function snapshotScalarsChanged(
  existing: Partial<Record<(typeof SCALAR_FIELDS)[number], unknown>>,
  incoming: SnapshotScalars,
): boolean {
  return SCALAR_FIELDS.some((field) => existing[field] !== incoming[field]);
}
