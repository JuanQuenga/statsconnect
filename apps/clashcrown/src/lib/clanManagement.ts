import { makeFunctionReference } from "convex/server";

export type ClanAttention = "recognition" | "checkIn" | null;
export type ClanEventKind = "joined" | "left" | "roleChanged" | "becameInactive" | "warDecksMissed";

export type ClanManagementMember = {
  tag: string;
  name: string;
  role: string;
  trophies: number;
  trophyChange: number;
  donations: number;
  donationChange: number;
  donationsReceived: number;
  lastSeenAt: number | null;
  joinedObservedAt: number;
  inactivityDays: number | null;
  warWeeksObserved: number;
  warWeeksParticipated: number;
  participationConsistency: number | null;
  recentFame: number | null;
  recentRepairPoints: number | null;
  recentBoatAttacks: number | null;
  recentDecksUsed: number | null;
  recentMissedDecks: number | null;
  fameTrend: number | null;
  attention: ClanAttention;
  attentionReasons: string[];
};

export type ClanManagementEvent = {
  id: string;
  observedAt: number;
  kind: ClanEventKind;
  memberTag: string;
  memberName: string;
  summary: string;
  detail: string;
};

export type ClanManagementDashboard = {
  clan: {
    tag: string;
    name: string | null;
    trackingStartedAt: number;
    lastObservedAt: number | null;
    nextObservationAt: number;
    observationCount: number;
    consecutiveFailures: number;
    lastError: string | null;
    watchExpiresAt: number | null;
  };
  observationWindow: {
    firstObservedAt: number | null;
    lastObservedAt: number | null;
    retainedWeeks: number;
    snapshotsRead: number;
  };
  members: ClanManagementMember[];
  events: ClanManagementEvent[];
  weeks: Array<{
    weekKey: string;
    completed: boolean;
    seasonId: number | null;
    sectionIndex: number | null;
    firstObservedAt: number;
    lastObservedAt: number;
  }>;
};

export const observeClanManagementAction = makeFunctionReference<
  "action",
  { tag: string },
  { observed: boolean; observedAt: number | null }
>("clash/clanManagementActions:observe");

export const watchClanManagementAction = makeFunctionReference<
  "action",
  { tag: string },
  { observed: boolean; observedAt: number | null; watchExpiresAt: number }
>("clash/clanManagementActions:watch");

export const clanManagementDashboardQuery = makeFunctionReference<
  "query",
  { tag: string },
  ClanManagementDashboard | null
>("clash/clanManagement:dashboard");
