import type { Id } from "@statsconnect/backend/data-model";

export type GameId = "clash-royale" | "brawl-stars";
export type ProfileId = Id<"connectedProfiles">;

export type ProfileDisplay = {
  name: string;
  avatarUrl: string | null;
  headline: { label: string; value: number } | null;
  affiliation: { name: string; tag: string | null } | null;
};

export type ProfileSummary = { game: GameId; playerTag: string; display: ProfileDisplay };

export type ConnectedProfile = {
  id: ProfileId;
  game: GameId;
  playerTag: string;
  display: ProfileDisplay;
  connectedAt: number;
  updatedAt: number;
  lastSyncedAt: number;
};

export type Metric = { key: string; label: string; value: number; format: "integer" | "percent" };

export type ProfileItem = {
  kind: "card" | "brawler";
  id: string;
  name: string;
  level: number | null;
  rank: number | null;
  score: number | null;
  bestScore: number | null;
  imageUrl: string | null;
};

export type RecentMatch = {
  id: string;
  occurredAt: number | null;
  mode: string;
  map: string | null;
  result: "win" | "loss" | "draw" | "ranked" | "unknown";
  rank: number | null;
  scoreDelta: number | null;
};

export type UpcomingItem = { index: number; label: string };

export type ProfileStats = {
  game: GameId;
  playerTag: string;
  summary: ProfileSummary;
  metrics: Metric[];
  roster: ProfileItem[];
  currentLoadout: ProfileItem[];
  recentMatches: RecentMatch[];
  upcoming: UpcomingItem[];
  warnings: string[];
};

export type CacheMetadata = {
  state: "hit" | "refreshed" | "stale" | "stub";
  fetchedAt: number;
  expiresAt: number;
};

export type AdapterResult<T> = { data: T; cache: CacheMetadata };
export type HubState = { activeProfileId: ProfileId | null; profiles: ConnectedProfile[] };

export type ProfileErrorCode =
  | "INVALID_VIEWER"
  | "PROFILE_NOT_CONNECTED"
  | "INVALID_TAG"
  | "PROFILE_NOT_FOUND"
  | "NOT_CONFIGURED"
  | "UPSTREAM_FORBIDDEN"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "BAD_UPSTREAM_RESPONSE";

export const games: ReadonlyArray<{ id: GameId; name: string; description: string }> = [
  { id: "clash-royale", name: "Clash Royale", description: "Trophies, battles, cards, deck, and chest cycle." },
  { id: "brawl-stars", name: "Brawl Stars", description: "Trophies, victories, recent battles, and brawler roster." },
];

export function gameName(game: GameId): string {
  return games.find((entry) => entry.id === game)?.name ?? game;
}

export function isGameId(value: string): value is GameId {
  return value === "clash-royale" || value === "brawl-stars";
}
