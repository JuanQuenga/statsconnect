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

export type CacheMetadata = {
  state: "hit" | "refreshed" | "stale" | "stub";
  fetchedAt: number;
  expiresAt: number;
};

export type AdapterResult<T> = { data: T; cache: CacheMetadata };

export type ProfileErrorCode =
  | "INVALID_VIEWER"
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
  getProfileSummary(tag: string): Promise<AdapterResult<ProfileSummary>>;
}
