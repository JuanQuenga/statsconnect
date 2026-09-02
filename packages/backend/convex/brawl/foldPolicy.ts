/**
 * Pure aggregation folding for battle-log ingest.
 *
 * Each battle folds one delta row per (map, brawler, trophy bucket). The
 * bucket rows partition the data — every pick has exactly one trophy bucket —
 * so the old "all + personal bucket" double fold was a fully redundant copy.
 * The "all" view is reconstructed by summing bucket rows at read time
 * (see bucketPolicy.ts), which halves the ingest fan-out: a fresh 3v3 battle
 * now folds 50 read/write pairs instead of ~100.
 */

export type TrophyBucket = "0-499" | "500-999" | "1000+";

export type StatDelta = {
  picks: number;
  wins: number;
  losses: number;
  starPlayer: number;
  firstBattleAt?: number;
  lastBattleAt?: number;
};

export type TeamStatDelta = StatDelta & {
  brawlerIds: number[];
};

export function newDelta(won: boolean | null, isStar: boolean, observedAt?: number): StatDelta {
  return {
    picks: 1,
    wins: won === true ? 1 : 0,
    losses: won === false ? 1 : 0,
    starPlayer: isStar ? 1 : 0,
    ...(observedAt !== undefined
      ? { firstBattleAt: observedAt, lastBattleAt: observedAt }
      : {}),
  };
}

export function newTeamDelta(won: boolean | null, brawlerIds: number[]): TeamStatDelta {
  return {
    ...newDelta(won, false),
    brawlerIds: [...brawlerIds],
  };
}

export function foldDelta<T extends StatDelta>(map: Map<string, T>, key: string, delta: T): void {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, delta);
    return;
  }
  existing.picks += delta.picks;
  existing.wins += delta.wins;
  existing.losses += delta.losses;
  existing.starPlayer += delta.starPlayer;
  if (delta.firstBattleAt !== undefined) {
    existing.firstBattleAt = Math.min(existing.firstBattleAt ?? delta.firstBattleAt, delta.firstBattleAt);
  }
  if (delta.lastBattleAt !== undefined) {
    existing.lastBattleAt = Math.max(existing.lastBattleAt ?? delta.lastBattleAt, delta.lastBattleAt);
  }
}

export function teamHash(ids: number[]) {
  return [...ids].sort((a, b) => a - b).join("-");
}

export type FoldPerson = {
  brawlerId: number;
  bucket: TrophyBucket;
  won: boolean | null;
  isStar: boolean;
};

export type FoldTeam = {
  bucket: TrophyBucket;
  brawlerIds: number[];
  /** null only for draws in the matchup fold. */
  won: boolean | null;
  people: FoldPerson[];
};

export type FoldMaps = {
  brawlerDeltas: Map<string, StatDelta>;
  dailyBrawlerDeltas: Map<string, StatDelta>;
  teamDeltas: Map<string, TeamStatDelta>;
  matchupDeltas: Map<string, StatDelta>;
  dailyMatchupDeltas: Map<string, StatDelta>;
};

export function newFoldMaps(): FoldMaps {
  return {
    brawlerDeltas: new Map(),
    dailyBrawlerDeltas: new Map(),
    teamDeltas: new Map(),
    matchupDeltas: new Map(),
    dailyMatchupDeltas: new Map(),
  };
}

export type FoldInput = {
  mapId: number;
  trendDay: number | null;
  observedAt: number | null;
  /** Every participant with a valid brawler, both teams or a solo lobby. */
  people: FoldPerson[];
  /** Teams folded into lifetime team stats; decided results only. */
  statTeams: FoldTeam[] | null;
  /** Teams folded into matchup stats; draws included with won = null. */
  matchupTeams: FoldTeam[] | null;
};

export function foldBattle(maps: FoldMaps, input: FoldInput): void {
  const { mapId, trendDay, observedAt, people } = input;
  const decided = observedAt !== null && trendDay !== null;

  for (const person of people) {
    foldDelta(
      maps.brawlerDeltas,
      `${mapId}|${person.brawlerId}|${person.bucket}`,
      newDelta(person.won, person.isStar, decided ? observedAt! : undefined),
    );
    if (decided) {
      foldDelta(
        maps.dailyBrawlerDeltas,
        `${mapId}|${person.brawlerId}|${person.bucket}|${trendDay}`,
        newDelta(person.won, person.isStar, observedAt!),
      );
    }
  }

  for (const team of input.statTeams ?? []) {
    foldDelta(
      maps.teamDeltas,
      `${mapId}|${team.bucket}|${teamHash(team.brawlerIds)}`,
      newTeamDelta(team.won, team.brawlerIds),
    );
  }

  for (const team of input.matchupTeams ?? []) {
    for (const opponent of input.matchupTeams ?? []) {
      if (opponent === team) continue;
      for (const person of team.people) {
        for (const opponentBrawlerId of opponent.brawlerIds) {
          foldDelta(
            maps.matchupDeltas,
            `${mapId}|${person.bucket}|${person.brawlerId}|${opponentBrawlerId}`,
            newDelta(team.won, false),
          );
          if (decided) {
            foldDelta(
              maps.dailyMatchupDeltas,
              `${mapId}|${person.bucket}|${person.brawlerId}|${opponentBrawlerId}|${trendDay}`,
              newDelta(team.won, false, observedAt!),
            );
          }
        }
      }
    }
  }
}
