export const MAX_CRAWL_BATCH_SIZE = 25;
export const MAX_FAILURE_BACKOFF_MS = 24 * 60 * 60 * 1_000;
export const MAX_RETENTION_BATCH_SIZE = 256;

export type PipelineRunState = "running" | "succeeded" | "failed";

export type RunLifecycle = {
  state: PipelineRunState;
  startedAt: number;
  finishedAt?: number;
};

export type TargetLease = {
  runId?: string;
  token?: string;
  claimedAt?: number;
  expiresAt?: number;
};

export type CrawlTargetState = {
  nextDueAt: number;
  lastFetchedAt?: number;
  lastBattleTime?: string;
  consecutiveFailures: number;
  lease: TargetLease;
};

export type CrawlOutcome =
  | { type: "success"; lastBattleTime?: string }
  | { type: "failure" };

export type TargetSettlement =
  | { status: "stale_lease"; target: CrawlTargetState }
  | { status: "accepted"; target: CrawlTargetState; backoffMs?: number };

export type RetentionCategory =
  | "battles"
  | "fetchLogs"
  | "runs"
  | "snapshots"
  | "playerBattles"
  | "dailyBrawlerStats"
  | "dailyMatchups"
  | "clubSnapshots"
  | "clubMemberSnapshots"
  | "clubActivityEvents"
  | "playerCache"
  | "apiBudgets"
  | "apiTelemetry";

export type RetentionAvailability = Record<RetentionCategory, number>;

export type RetentionPlan = {
  delete: RetentionAvailability;
  deleted: number;
  more: boolean;
};

const retentionCategories: readonly RetentionCategory[] = [
  "battles",
  "fetchLogs",
  "runs",
  "snapshots",
  "playerBattles",
  "dailyBrawlerStats",
  "dailyMatchups",
  "clubSnapshots",
  "clubMemberSnapshots",
  "clubActivityEvents",
  "playerCache",
  "apiBudgets",
  "apiTelemetry",
];

function positiveInteger(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.floor(value), 1), maximum);
}

export function beginRun(now: number): RunLifecycle {
  return { state: "running", startedAt: now };
}

export function finishRun(
  run: RunLifecycle,
  outcome: Exclude<PipelineRunState, "running">,
  now: number,
): RunLifecycle {
  if (run.state !== "running") return run;
  return { ...run, state: outcome, finishedAt: now };
}

export function isRunActive(
  run: { state?: PipelineRunState; finishedAt?: number } | null,
): boolean {
  if (!run || run.finishedAt !== undefined) return false;
  return run.state === undefined || run.state === "running";
}

export function claimTarget(
  target: CrawlTargetState,
  claim: { runId: string; token: string; now: number; leaseMs: number },
): CrawlTargetState {
  const leaseMs = positiveInteger(claim.leaseMs, MAX_FAILURE_BACKOFF_MS);
  const expiresAt = claim.now + leaseMs;
  return {
    ...target,
    nextDueAt: expiresAt,
    lease: {
      runId: claim.runId,
      token: claim.token,
      claimedAt: claim.now,
      expiresAt,
    },
  };
}

export function retryBackoffMs(revisitMs: number, consecutiveFailures: number): number {
  const base = positiveInteger(revisitMs, MAX_FAILURE_BACKOFF_MS);
  const exponent = Math.min(Math.max(Math.floor(consecutiveFailures), 0), 6);
  return Math.min(base * 2 ** exponent, MAX_FAILURE_BACKOFF_MS);
}

export function settleTarget(
  target: CrawlTargetState,
  settlement: {
    runId: string;
    token: string;
    now: number;
    revisitMs: number;
    outcome: CrawlOutcome;
  },
): TargetSettlement {
  const lease = target.lease;
  const ownsCurrentLease =
    lease.runId === settlement.runId &&
    lease.token === settlement.token &&
    lease.expiresAt !== undefined &&
    lease.expiresAt >= settlement.now;

  if (!ownsCurrentLease) return { status: "stale_lease", target };

  if (settlement.outcome.type === "success") {
    return {
      status: "accepted",
      target: {
        ...target,
        nextDueAt: settlement.now + positiveInteger(settlement.revisitMs, MAX_FAILURE_BACKOFF_MS),
        lastFetchedAt: settlement.now,
        lastBattleTime: settlement.outcome.lastBattleTime ?? target.lastBattleTime,
        consecutiveFailures: 0,
        lease: {},
      },
    };
  }

  const failures = target.consecutiveFailures + 1;
  const backoffMs = retryBackoffMs(settlement.revisitMs, failures);
  return {
    status: "accepted",
    backoffMs,
    target: {
      ...target,
      nextDueAt: settlement.now + backoffMs,
      consecutiveFailures: failures,
      lease: {},
    },
  };
}

export function retentionCutoffs(now: number): {
  battleCutoff: number;
  telemetryCutoff: number;
  snapshotCutoff: number;
  playerBattleCutoff: number;
  dailyStatsCutoff: number;
  clubHistoryCutoff: number;
} {
  const dayMs = 24 * 60 * 60 * 1_000;
  return {
    battleCutoff: now - 30 * dayMs,
    telemetryCutoff: now - 7 * dayMs,
    snapshotCutoff: now - 365 * dayMs,
    // Per-player battle history keeps a year; aggregates and club history age
    // out faster because their value decays once rollups absorb them.
    playerBattleCutoff: now - 365 * dayMs,
    dailyStatsCutoff: now - 90 * dayMs,
    clubHistoryCutoff: now - 90 * dayMs,
  };
}

export function planRetentionBatch(
  availability: RetentionAvailability,
  requestedLimit: number,
): RetentionPlan {
  const limit = positiveInteger(requestedLimit, MAX_RETENTION_BATCH_SIZE);
  const remaining: RetentionAvailability = { ...availability };
  for (const category of retentionCategories) {
    remaining[category] = Math.max(Math.floor(remaining[category]), 0);
  }
  const deletion: RetentionAvailability = {
    battles: 0,
    fetchLogs: 0,
    runs: 0,
    snapshots: 0,
    playerBattles: 0,
    dailyBrawlerStats: 0,
    dailyMatchups: 0,
    clubSnapshots: 0,
    clubMemberSnapshots: 0,
    clubActivityEvents: 0,
    playerCache: 0,
    apiBudgets: 0,
    apiTelemetry: 0,
  };

  let deleted = 0;
  while (deleted < limit) {
    let allocated = false;
    for (const category of retentionCategories) {
      if (deleted >= limit) break;
      if (remaining[category] === 0) continue;
      remaining[category] -= 1;
      deletion[category] += 1;
      deleted += 1;
      allocated = true;
    }
    if (!allocated) break;
  }

  return {
    delete: deletion,
    deleted,
    more: retentionCategories.some((category) => remaining[category] > 0),
  };
}
