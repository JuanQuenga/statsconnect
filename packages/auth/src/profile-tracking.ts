import type { ConnectedProfile, ConnectedProfileGame } from "./connected-profiles";

export type ProfileTrackingStatus = "unauthenticated" | "loading" | "ready" | "error";

/**
 * Headless state shared by the Hub and both Game Sites. The profile list is
 * the established connected-profile list: membership means this profile is
 * tracked for ongoing refresh demand. It does not claim game-account proof.
 */
export type ProfileTrackingState = {
  status: ProfileTrackingStatus;
  authenticated: boolean;
  profiles: readonly ConnectedProfile[];
  error: string | null;
  isTracked: (game: ConnectedProfileGame, tag: string) => boolean;
};

export type ProfileTrackingActions = {
  trackProfile: (profile: ConnectedProfile) => Promise<void>;
  untrackProfile: (game: ConnectedProfileGame, tag: string) => Promise<void>;
};

export type ProfileTrackingInterface = ProfileTrackingState & ProfileTrackingActions;

export class ProfileTrackingAuthRequiredError extends Error {
  readonly code = "AUTH_REQUIRED" as const;

  constructor() {
    super("Sign in to track profiles across StatsConnect.");
    this.name = "ProfileTrackingAuthRequiredError";
  }
}

export class StatsConnectAuthConfigurationError extends Error {
  readonly code = "AUTH_NOT_CONFIGURED" as const;

  constructor() {
    super("StatsConnect authentication is not configured for this deployment.");
    this.name = "StatsConnectAuthConfigurationError";
  }
}

export function requireProfileTrackingAuth(authenticated: boolean): void {
  if (!authenticated) throw new ProfileTrackingAuthRequiredError();
}

export function profileTrackingKey(
  game: ConnectedProfileGame,
  tag: string,
): string {
  return `${game}:${tag.trim().replace(/^#/, "").toUpperCase()}`;
}

export function createProfileTrackingState({
  status,
  authenticated,
  profiles,
  error,
}: Pick<ProfileTrackingState, "status" | "authenticated" | "profiles" | "error">): ProfileTrackingState {
  const trackedKeys = new Set(profiles.map((profile) => profileTrackingKey(profile.game, profile.tag)));
  return {
    status,
    authenticated,
    profiles,
    error,
    isTracked: (game, tag) => trackedKeys.has(profileTrackingKey(game, tag)),
  };
}
