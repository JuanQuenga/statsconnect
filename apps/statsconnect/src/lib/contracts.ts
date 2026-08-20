export type GameId = "clash-royale" | "brawl-stars";

export type ProfileDisplay = {
  name: string;
  avatarUrl: string | null;
  headline: { label: string; value: number } | null;
  affiliation: { name: string; tag: string | null } | null;
};

export type ProfileSummary = { game: GameId; playerTag: string; display: ProfileDisplay };

export type CacheMetadata = {
  state: "hit" | "refreshed" | "stale" | "stub";
  fetchedAt: number;
  expiresAt: number;
};

export type AdapterResult<T> = { data: T; cache: CacheMetadata };

export type AccessTier = "free" | "premium";
export type PlanLimits = {
  connectedPlayersPerGame: number;
  watchedPlayersPerGame: number;
  watchedClubsPerGame: number;
};
export type StatsConnectPlusOffer = {
  name: string;
  scope: string;
  availability: "foundation";
  checkoutAvailable: boolean;
  features: string[];
  notice: string;
};
export type AccessSnapshot = {
  authenticated: boolean;
  tier: AccessTier;
  limits: PlanLimits;
  entitlement: {
    status: "active" | "grace_period" | "past_due" | "canceled" | "expired";
    expiresAt: number | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  offer: StatsConnectPlusOffer;
};

export type ProfileErrorCode =
  | "INVALID_VIEWER"
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
