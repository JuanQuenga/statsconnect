import { parseApiDate } from "./format";
import type { Battle, Card } from "@/lib/mock-data";
import type { ApiBattle, ApiBattleParticipant } from "./types";

/**
 * Battle modes worth aggregating into meta statistics. Every one of these is a
 * 1v1 fought with a deck the player chose, so the deck is a real signal.
 */
export const META_MODES = ["ladder", "pathOfLegends", "challenge", "tournament", "clanWar"] as const;

export type MetaMode = (typeof META_MODES)[number];

/** `battle.type` as returned by the API, mapped onto the buckets we report on. */
const MODE_BY_TYPE: Record<string, MetaMode> = {
  PvP: "ladder",
  pathOfLegend: "pathOfLegends",
  pathOfLegend1v1: "pathOfLegends",
  challenge: "challenge",
  tournament: "tournament",
  riverRacePvP: "clanWar"
};

/**
 * Modes that hand the player a deck (draft, mirror) or change the game enough
 * that deck performance does not transfer. `deckSelection` covers the first
 * group; the rest are matched on the game mode name.
 */
const EXCLUDED_GAME_MODES = /draft|mirror|touchdown|rage|ramp|duel|megadeck|triplee?lixir/i;

export type DeckObservation = {
  /** Identifies the battle itself, not one side of it, so both players' logs dedupe to one row. */
  fingerprint: string;
  battleTime: number;
  mode: MetaMode;
  gameMode: string;
  deckHash: string;
  cardIds: number[];
  evolutionIds: number[];
  towerCardId?: number;
  won: boolean;
  crowns: number;
  opponentCrowns: number;
};

export type BattleModePerformance = {
  mode: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
};

export type PersonalDeckPerformance = {
  key: string;
  cards: Card[];
  uses: number;
  wins: number;
  winRate: number;
  averageCrowns: number;
  modes: string[];
};

export type PersonalBattlePerformance = {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  threeCrownWins: number;
  threeCrownRate: number;
  currentWinStreak: number;
  bestWinStreak: number;
  recent: Battle[];
  modes: BattleModePerformance[];
  decks: PersonalDeckPerformance[];
};

function percentage(wins: number, games: number) {
  return games ? (wins / games) * 100 : 0;
}

function personalCardKey(card: Card) {
  const identity = typeof card.id === "number" ? String(card.id) : card.name.trim().toLowerCase();
  const variant = card.isEvolution || (card.evolutionLevel ?? 0) > 0 ? "variant" : "base";
  return `${identity}:${variant}`;
}

/** Stable identity for one of this player's eight-card decks. */
export function personalDeckKey(cards: Card[]) {
  return cards.map(personalCardKey).sort().join("|");
}

/**
 * Aggregates the battle log already returned for a player. The API returns
 * newest battles first, which lets `currentWinStreak` start at the first row.
 * Decks with anything other than eight cards are intentionally left out of the
 * deck view, but still count toward the overall battle performance.
 */
export function analyzePlayerBattles(battles: Battle[]): PersonalBattlePerformance {
  const wins = battles.filter((battle) => battle.result === "Win").length;
  const recent = battles.slice(0, 10);
  const modeMap = new Map<string, { games: number; wins: number }>();
  const deckMap = new Map<string, PersonalDeckPerformance>();

  let currentWinStreak = 0;
  let bestWinStreak = 0;
  let runningStreak = 0;

  for (const battle of battles) {
    const mode = modeMap.get(battle.mode) ?? { games: 0, wins: 0 };
    mode.games += 1;
    mode.wins += battle.result === "Win" ? 1 : 0;
    modeMap.set(battle.mode, mode);

    if (battle.result === "Win") {
      runningStreak += 1;
      bestWinStreak = Math.max(bestWinStreak, runningStreak);
    } else {
      runningStreak = 0;
    }

    if (battle.deck.length !== 8) continue;
    const key = personalDeckKey(battle.deck);
    const deck = deckMap.get(key) ?? {
      key,
      cards: battle.deck,
      uses: 0,
      wins: 0,
      winRate: 0,
      averageCrowns: 0,
      modes: []
    };
    deck.uses += 1;
    deck.wins += battle.result === "Win" ? 1 : 0;
    deck.averageCrowns += battle.crowns[0];
    if (!deck.modes.includes(battle.mode)) deck.modes.push(battle.mode);
    deckMap.set(key, deck);
  }

  for (const battle of battles) {
    if (battle.result !== "Win") break;
    currentWinStreak += 1;
  }

  const modes = [...modeMap.entries()]
    .map(([mode, stats]) => ({
      mode,
      games: stats.games,
      wins: stats.wins,
      losses: stats.games - stats.wins,
      winRate: percentage(stats.wins, stats.games)
    }))
    .sort((left, right) => right.games - left.games || right.winRate - left.winRate || left.mode.localeCompare(right.mode));

  const decks = [...deckMap.values()]
    .map((deck) => ({
      ...deck,
      winRate: percentage(deck.wins, deck.uses),
      averageCrowns: deck.averageCrowns / deck.uses,
      modes: [...deck.modes].sort((left, right) => left.localeCompare(right))
    }))
    .sort((left, right) => right.uses - left.uses || right.winRate - left.winRate || left.key.localeCompare(right.key));

  const threeCrownWins = battles.filter((battle) => battle.result === "Win" && battle.crowns[0] === 3).length;
  return {
    games: battles.length,
    wins,
    losses: battles.length - wins,
    winRate: percentage(wins, battles.length),
    threeCrownWins,
    threeCrownRate: percentage(threeCrownWins, battles.length),
    currentWinStreak,
    bestWinStreak,
    recent,
    modes,
    decks
  };
}

/** Stable identity for a deck. Evolved cards are distinct from their base card. */
export function deckHash(cardIds: number[], evolutionIds: number[]) {
  const evolved = new Set(evolutionIds);
  return cardIds
    .map((id) => (evolved.has(id) ? `${id}e` : `${id}`))
    .sort()
    .join("-");
}

/** UTC day bucket as `YYYYMMDD`, the grain every aggregate is stored at. */
export function dayKey(timestamp: number) {
  return Number(new Date(timestamp).toISOString().slice(0, 10).replace(/-/g, ""));
}

export function dayKeysBack(days: number, now = Date.now()) {
  return Array.from({ length: days }, (_, offset) => dayKey(now - offset * 86_400_000));
}

function side(participant: ApiBattleParticipant) {
  const cards = participant.cards ?? [];
  if (cards.length !== 8) return undefined;
  const cardIds = cards.map((card) => card.id).filter((id): id is number => typeof id === "number");
  if (cardIds.length !== 8) return undefined;

  const evolutionIds = cards
    .filter((card) => (card.evolutionLevel ?? 0) > 0)
    .map((card) => card.id)
    .filter((id): id is number => typeof id === "number");

  return {
    tag: participant.tag ?? "",
    cardIds,
    evolutionIds,
    towerCardId: participant.supportCards?.[0]?.id,
    crowns: participant.crowns ?? 0
  };
}

/**
 * Turns one battle into up to two observations — one per side. A battle we
 * fetched from either player's log yields the same pair, and the fingerprint is
 * side-independent so ingesting it twice is a no-op.
 *
 * Returns an empty array for anything that cannot inform deck statistics:
 * 2v2, draft and mirror modes, unrecognised battle types, and draws.
 */
export function battleObservations(battle: ApiBattle): DeckObservation[] {
  const mode = MODE_BY_TYPE[battle.type ?? ""];
  if (!mode) return [];

  // "collection" is the player's own deck. Anything else was handed to them.
  if (battle.deckSelection && battle.deckSelection !== "collection") return [];

  const gameMode = battle.gameMode?.name ?? "";
  if (EXCLUDED_GAME_MODES.test(gameMode)) return [];

  const team = battle.team ?? [];
  const opponent = battle.opponent ?? [];
  if (team.length !== 1 || opponent.length !== 1) return [];

  const left = side(team[0]);
  const right = side(opponent[0]);
  if (!left || !right) return [];
  if (left.crowns === right.crowns) return [];

  const battleTime = parseApiDate(battle.battleTime)?.getTime();
  if (!battleTime) return [];

  const fingerprint = `${battleTime}:${[left.tag, right.tag].sort().join("~")}`;

  return [left, right].map((self, index) => {
    const other = index === 0 ? right : left;
    return {
      fingerprint,
      battleTime,
      mode,
      gameMode,
      deckHash: deckHash(self.cardIds, self.evolutionIds),
      cardIds: self.cardIds,
      evolutionIds: self.evolutionIds,
      towerCardId: self.towerCardId,
      won: self.crowns > other.crowns,
      crowns: self.crowns,
      opponentCrowns: other.crowns
    };
  });
}

export function modeLabel(mode: MetaMode) {
  const labels: Record<MetaMode, string> = {
    ladder: "Trophy Road",
    pathOfLegends: "Path of Legends",
    challenge: "Challenges",
    tournament: "Tournaments",
    clanWar: "Clan Wars"
  };
  return labels[mode];
}
