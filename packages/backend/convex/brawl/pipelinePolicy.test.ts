import type * as PipelinePolicy from "./pipelinePolicy";

const {
  beginRun,
  claimTarget,
  finishRun,
  planRetentionBatch,
  retryBackoffMs,
  settleTarget,
} = (await import(new URL("./pipelinePolicy.ts", import.meta.url).href)) as typeof PipelinePolicy;

type CrawlTargetState = PipelinePolicy.CrawlTargetState;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function scenario(name: string, run: () => void): void {
  run();
  console.log(`ok - ${name}`);
}

function successfulCrawlScenario(): void {
  const startedAt = 1_000;
  const run = beginRun(startedAt);
  const target: CrawlTargetState = {
    nextDueAt: startedAt,
    consecutiveFailures: 2,
    lease: {},
  };
  const claimed = claimTarget(target, {
    runId: "run-success",
    token: "lease-success",
    now: startedAt,
    leaseMs: 300,
  });
  const settled = settleTarget(claimed, {
    runId: "run-success",
    token: "lease-success",
    now: 1_200,
    revisitMs: 1_000,
    outcome: { type: "success", lastBattleTime: "20260816T120000.000Z" },
  });

  equal(settled.status, "accepted", "the current worker completes its target");
  if (settled.status !== "accepted") return;
  equal(settled.target.consecutiveFailures, 0, "success resets target failures");
  equal(settled.target.nextDueAt, 2_200, "success schedules the normal revisit");
  equal(
    settled.target.lastBattleTime,
    "20260816T120000.000Z",
    "success advances the battle cursor",
  );
  equal(settled.target.lease.token, undefined, "completion releases the lease");

  const finished = finishRun(run, "succeeded", 1_250);
  equal(finished.state, "succeeded", "the run reaches the succeeded state");
  equal(finished.finishedAt, 1_250, "the run records its finish time");
}

function retryBackoffScenario(): void {
  const target = claimTarget(
    { nextDueAt: 0, consecutiveFailures: 1, lease: {} },
    { runId: "run-retry", token: "lease-retry", now: 10_000, leaseMs: 500 },
  );
  const settled = settleTarget(target, {
    runId: "run-retry",
    token: "lease-retry",
    now: 10_200,
    revisitMs: 1_000,
    outcome: { type: "failure" },
  });

  equal(settled.status, "accepted", "the lease owner can report a failure");
  if (settled.status !== "accepted") return;
  equal(settled.target.consecutiveFailures, 2, "failure count advances exactly once");
  equal(settled.backoffMs, 4_000, "retry uses exponential backoff");
  equal(settled.target.nextDueAt, 14_200, "failure schedules retry from completion time");
  equal(
    retryBackoffMs(60 * 60 * 1_000, 99),
    24 * 60 * 60 * 1_000,
    "retry backoff is capped at one day",
  );
}

function staleLeaseScenario(): void {
  const target = claimTarget(
    { nextDueAt: 0, consecutiveFailures: 0, lease: {} },
    { runId: "run-old", token: "lease-old", now: 5_000, leaseMs: 100 },
  );
  const expired = settleTarget(target, {
    runId: "run-old",
    token: "lease-old",
    now: 5_101,
    revisitMs: 1_000,
    outcome: { type: "success" },
  });
  equal(expired.status, "stale_lease", "an expired lease cannot complete");
  assert(expired.target === target, "stale completion leaves the target unchanged");

  const reclaimed = claimTarget(target, {
    runId: "run-new",
    token: "lease-new",
    now: 5_101,
    leaseMs: 100,
  });
  const superseded = settleTarget(reclaimed, {
    runId: "run-old",
    token: "lease-old",
    now: 5_150,
    revisitMs: 1_000,
    outcome: { type: "failure" },
  });
  equal(superseded.status, "stale_lease", "a superseded owner cannot mutate a newer lease");
  equal(superseded.target.lease.token, "lease-new", "the newer lease remains intact");
}

function runFailureScenario(): void {
  const running = beginRun(20_000);
  const failed = finishRun(running, "failed", 20_500);
  const duplicate = finishRun(failed, "succeeded", 20_600);

  equal(failed.state, "failed", "failure makes the run terminal");
  equal(failed.finishedAt, 20_500, "failure records its finish time");
  assert(duplicate === failed, "second completion does not change a terminal run");
}

function retentionBatchScenario(): void {
  const plan = planRetentionBatch(
    {
      battles: 10,
      fetchLogs: 10,
      runs: 10,
      snapshots: 10,
      playerBattles: 10,
      dailyBrawlerStats: 10,
      dailyMatchups: 10,
      clubSnapshots: 10,
      clubMemberSnapshots: 10,
      clubActivityEvents: 10,
      playerCache: 10,
      apiBudgets: 10,
      apiTelemetry: 10,
    },
    5,
  );
  equal(plan.deleted, 5, "retention never exceeds the transaction write budget");
  equal(plan.delete.battles, 1, "each live category receives a fair share first");
  equal(plan.delete.fetchLogs, 1, "the batch deletes one fetch log");
  equal(plan.delete.runs, 1, "the batch deletes one old run");
  equal(plan.delete.snapshots, 1, "the batch deletes one snapshot");
  equal(plan.delete.playerBattles, 1, "newer retention categories are not starved");
  equal(plan.more, true, "remaining rows require another batch");

  const finalPlan = planRetentionBatch(
    {
      battles: 1,
      fetchLogs: 0,
      runs: 1,
      snapshots: 0,
      playerBattles: 0,
      dailyBrawlerStats: 0,
      dailyMatchups: 0,
      clubSnapshots: 0,
      clubMemberSnapshots: 0,
      clubActivityEvents: 0,
      playerCache: 3,
      apiBudgets: 0,
      apiTelemetry: 0,
    },
    5,
  );
  equal(finalPlan.deleted, 5, "the final batch deletes only available rows");
  equal(finalPlan.delete.battles, 1, "the original categories still delete");
  equal(finalPlan.delete.runs, 1, "runs still delete");
  equal(finalPlan.delete.playerCache, 3, "player cache rows join the shared budget");
  equal(finalPlan.more, false, "the final batch stops retention scheduling");

  const clubPlan = planRetentionBatch(
    {
      battles: 0,
      fetchLogs: 0,
      runs: 0,
      snapshots: 0,
      playerBattles: 0,
      dailyBrawlerStats: 0,
      dailyMatchups: 0,
      clubSnapshots: 0,
      clubMemberSnapshots: 2,
      clubActivityEvents: 4,
      playerCache: 0,
      apiBudgets: 0,
      apiTelemetry: 0,
    },
    3,
  );
  equal(clubPlan.deleted, 3, "club cleanup counts each concrete table once");
  equal(clubPlan.delete.clubMemberSnapshots, 2, "member snapshots are planned for deletion");
  equal(clubPlan.delete.clubActivityEvents, 1, "activity events are planned for deletion");
  equal(clubPlan.more, true, "remaining activity events keep pagination alive");
}

console.log("TAP version 13");
scenario("successful crawl", successfulCrawlScenario);
scenario("retry and backoff", retryBackoffScenario);
scenario("expired and stale lease completion", staleLeaseScenario);
scenario("run failure", runFailureScenario);
scenario("retention batching", retentionBatchScenario);
