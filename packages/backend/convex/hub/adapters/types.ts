export type GameId = "clash-royale" | "brawl-stars";

export type ProfileDisplay = {
  name: string;
  avatarUrl: string | null;
  headline: { label: string; value: number } | null;
  affiliation: { name: string; tag: string | null } | null;
};

export type ProfileSummary = {
  game: GameId;
  playerTag: string;
  display: ProfileDisplay;
};

export type Metric = {
  key: string;
  label: string;
  value: number;
  format: "integer" | "percent";
};

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

export type CachePrime =
  | { resource: "summary"; data: ProfileSummary }
  | { resource: "stats"; data: ProfileStats };

export type AdapterLoadResult<T> = AdapterResult<T> & {
  primed?: ReadonlyArray<CachePrime>;
};

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

export class AdapterError extends Error {
  readonly code: ProfileErrorCode;

  constructor(code: ProfileErrorCode, message: string) {
    super(message);
    this.name = "AdapterError";
    this.code = code;
  }
}

export interface GameAdapter {
  readonly game: GameId;
  normalizeTag(input: string): string;
  connectProfile(tag: string): Promise<AdapterLoadResult<ProfileSummary>>;
  getProfileSummary(tag: string): Promise<AdapterLoadResult<ProfileSummary>>;
  getStats(tag: string): Promise<AdapterLoadResult<ProfileStats>>;
}
