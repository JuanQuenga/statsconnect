import type { Doc } from "../_generated/dataModel";

export type AccessTier = "free" | "premium";

export type PlanLimits = {
  connectedPlayersPerGame: number;
  watchedPlayersPerGame: number;
  watchedClubsPerGame: number;
};

export const planLimits: Readonly<Record<AccessTier, Readonly<PlanLimits>>> = {
  free: {
    connectedPlayersPerGame: 1,
    watchedPlayersPerGame: 0,
    watchedClubsPerGame: 0,
  },
  premium: {
    connectedPlayersPerGame: 1,
    watchedPlayersPerGame: 3,
    watchedClubsPerGame: 1,
  },
};

export const statsConnectPlusOffer = {
  name: "StatsConnect+",
  scope: "All supported StatsConnect game sites",
  availability: "foundation" as const,
  checkoutAvailable: false,
  features: [
    "Ad-free StatsConnect experiences",
    "Background profile snapshots",
    "Priority refresh scheduling",
    "Longer retained history",
    "Watch up to 3 players and 1 club per game",
  ],
  notice:
    "StatsConnect+ checkout is not available yet. Benefits require verified account and billing integrations before activation.",
};

export function entitlementGrantsPremium(
  entitlement: Doc<"accountEntitlements"> | null,
  now: number,
): boolean {
  if (!entitlement) return false;
  if (entitlement.status !== "active" && entitlement.status !== "grace_period") {
    return false;
  }
  return entitlement.expiresAt === undefined || entitlement.expiresAt > now;
}
