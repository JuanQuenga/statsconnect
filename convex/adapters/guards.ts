import type { ProfileStats, ProfileSummary } from "./types";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function nullableNumber(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function validDisplay(value: unknown): boolean {
  if (!record(value) || typeof value.name !== "string" || !nullableString(value.avatarUrl)) return false;
  if (value.headline !== null && (!record(value.headline) || typeof value.headline.label !== "string" || typeof value.headline.value !== "number")) return false;
  return value.affiliation === null || (
    record(value.affiliation)
    && typeof value.affiliation.name === "string"
    && nullableString(value.affiliation.tag)
  );
}

export function isProfileSummary(value: unknown): value is ProfileSummary {
  return record(value)
    && (value.game === "clash-royale" || value.game === "brawl-stars")
    && typeof value.playerTag === "string"
    && validDisplay(value.display);
}

export function isProfileStats(value: unknown): value is ProfileStats {
  if (!record(value) || !isProfileSummary(value.summary)) return false;
  if (value.game !== value.summary.game || value.playerTag !== value.summary.playerTag) return false;
  return Array.isArray(value.metrics)
    && value.metrics.every((item) => record(item) && typeof item.key === "string" && typeof item.label === "string" && typeof item.value === "number" && (item.format === "integer" || item.format === "percent"))
    && Array.isArray(value.roster)
    && value.roster.every((item) => record(item)
      && (item.kind === "card" || item.kind === "brawler")
      && typeof item.id === "string"
      && typeof item.name === "string"
      && nullableNumber(item.level)
      && nullableNumber(item.rank)
      && nullableNumber(item.score)
      && nullableNumber(item.bestScore)
      && nullableString(item.imageUrl))
    && Array.isArray(value.currentLoadout)
    && value.currentLoadout.every((item) => record(item)
      && (item.kind === "card" || item.kind === "brawler")
      && typeof item.id === "string"
      && typeof item.name === "string"
      && nullableNumber(item.level)
      && nullableNumber(item.rank)
      && nullableNumber(item.score)
      && nullableNumber(item.bestScore)
      && nullableString(item.imageUrl))
    && Array.isArray(value.recentMatches)
    && value.recentMatches.every((match) => record(match)
      && typeof match.id === "string"
      && nullableNumber(match.occurredAt)
      && typeof match.mode === "string"
      && nullableString(match.map)
      && (match.result === "win" || match.result === "loss" || match.result === "draw" || match.result === "ranked" || match.result === "unknown")
      && nullableNumber(match.rank)
      && nullableNumber(match.scoreDelta))
    && Array.isArray(value.upcoming)
    && value.upcoming.every((item) => record(item)
      && typeof item.index === "number"
      && Number.isFinite(item.index)
      && typeof item.label === "string")
    && Array.isArray(value.warnings)
    && value.warnings.every((warning) => typeof warning === "string");
}
