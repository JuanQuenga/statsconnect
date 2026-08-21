import type { ApiBattle, ApiBattleParticipant } from "./types";

export type PlayerBattleObservation = {
  fingerprint: string;
  battleTime: number;
  result: "win" | "loss" | "draw";
};

function parseBattleDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? undefined : fallback;
  }
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function participantTag(participant: ApiBattleParticipant): string {
  return participant.tag?.trim().replaceAll(" ", "").replace(/^#/, "").toUpperCase() ?? "";
}

/**
 * Extracts one compact activity record for the requested player. Unlike meta
 * observations, activity includes draws, 2v2, and special modes because the
 * calendar answers "did this player battle?", not "is this deck rankable?".
 */
export function playerBattleObservation(
  battle: ApiBattle,
  playerTag: string,
): PlayerBattleObservation | undefined {
  const battleTime = parseBattleDate(battle.battleTime)?.getTime();
  if (!battleTime) return undefined;

  const normalizedTag = playerTag.trim().replaceAll(" ", "").replace(/^#/, "").toUpperCase();
  const team = battle.team ?? [];
  const opponents = battle.opponent ?? [];
  if (!team.length || !opponents.length) return undefined;
  const onTeam = team.some((participant) => participantTag(participant) === normalizedTag);
  const onOpponent = opponents.some((participant) => participantTag(participant) === normalizedTag);
  if (!onTeam && !onOpponent) return undefined;

  const teamCrowns = team[0]?.crowns ?? 0;
  const opponentCrowns = opponents[0]?.crowns ?? 0;
  const ownCrowns = onTeam ? teamCrowns : opponentCrowns;
  const otherCrowns = onTeam ? opponentCrowns : teamCrowns;
  const result = ownCrowns > otherCrowns ? "win" : ownCrowns < otherCrowns ? "loss" : "draw";
  const participants = [...team, ...opponents].map(participantTag).filter(Boolean).sort();
  const fingerprint = [
    battleTime,
    participants.join("~"),
    battle.type ?? "battle",
    battle.gameMode?.id ?? battle.gameMode?.name ?? "mode"
  ].join(":");

  return { fingerprint, battleTime, result };
}
