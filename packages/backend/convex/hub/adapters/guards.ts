import type { ProfileSummary } from "./types";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
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
