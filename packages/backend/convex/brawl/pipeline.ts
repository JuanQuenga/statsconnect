import { v } from "convex/values";
import { internalMutation, query, type MutationCtx } from "../_generated/server";
import {
  claimTarget,
  isRunActive,
  MAX_CRAWL_BATCH_SIZE,
  MAX_RETENTION_BATCH_SIZE,
  planRetentionBatch,
  retentionCutoffs,
  settleTarget,
} from "./pipelinePolicy";
import {
  crawlSource,
  pipelineRunState,
  upstreamConsumer,
  upstreamErrorCode,
  upstreamOutcome,
  upstreamSource,
} from "./schema";

const targetInput = v.object({
  tag: v.string(),
  source: crawlSource,
  priority: v.number(),
});

const leasedTarget = v.object({
  id: v.id("brawlCrawlTargets"),
  tag: v.string(),
  lastBattleTime: v.optional(v.string()),
  leaseToken: v.string(),
  leaseExpiresAt: v.number(),
});

const crawlOutcome = v.union(
  v.object({
    type: v.literal("success"),
    lastBattleTime: v.optional(v.string()),
    battles: v.number(),
    profileSnapshotCreated: v.boolean(),
  }),
  v.object({
    type: v.literal("failure"),
    note: v.optional(v.string()),
  }),
);

const targetOutcomeResult = v.union(
  v.object({
    status: v.literal("accepted"),
    nextDueAt: v.number(),
    consecutiveFailures: v.number(),
    backoffMs: v.optional(v.number()),
  }),
  v.object({ status: v.literal("stale_lease") }),
  v.object({ status: v.literal("run_inactive") }),
);

async function incrementCounter(
  ctx: MutationCtx,
  name: string,
  amount: number,
  now: number,
): Promise<void> {
  if (amount === 0) return;
  const existing = await ctx.db
    .query("brawlPipelineCounters")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      value: existing.value + amount,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("brawlPipelineCounters", { name, value: amount, updatedAt: now });
}

export const recordUpstreamFetch = internalMutation({
  args: {
    operation: v.string(),
    consumer: upstreamConsumer,
    outcome: upstreamOutcome,
    status: v.optional(v.number()),
    runId: v.optional(v.id("brawlPipelineRuns")),
    source: v.optional(upstreamSource),
    durationMs: v.optional(v.number()),
    errorCode: v.optional(upstreamErrorCode),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const ok = args.outcome === "success";
    await ctx.db.insert("brawlApiFetchLogs", {
      endpoint: args.operation,
      operation: args.operation,
      consumer: args.consumer,
      outcome: args.outcome,
      status: args.status ?? 0,
      ok,
      fetchedAt: now,
      runId: args.runId,
      source: args.source,
      durationMs: args.durationMs,
      errorCode: args.errorCode,
    });
    await incrementCounter(ctx, ok ? "upstream_fetches_succeeded" : "upstream_fetches_failed", 1, now);
    return null;
  },
});

export const beginPipelineRun = internalMutation({
  args: { job: v.string() },
  returns: v.id("brawlPipelineRuns"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("brawlPipelineRuns", {
      job: args.job,
      startedAt: now,
      ok: false,
      state: "running",
      updatedAt: now,
      claimed: 0,
      staleCompletions: 0,
      discovered: 0,
      fetched: 0,
      battles: 0,
      failures: 0,
    });
  },
});

export const recordDiscoveryResult = internalMutation({
  args: {
    runId: v.id("brawlPipelineRuns"),
    targets: v.array(targetInput),
    directorySightings: v.number(),
    failures: v.number(),
  },
  returns: v.union(
    v.object({ status: v.literal("recorded"), discovered: v.number(), added: v.number() }),
    v.object({ status: v.literal("already_recorded"), discovered: v.number(), added: v.number() }),
    v.object({ status: v.literal("run_inactive"), discovered: v.number(), added: v.number() }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!isRunActive(run) || run?.job !== "discover") {
      return { status: "run_inactive" as const, discovered: 0, added: 0 };
    }
    if (run.discoveryRecordedAt !== undefined) {
      return {
        status: "already_recorded" as const,
        discovered: run.discovered ?? 0,
        added: run.added ?? 0,
      };
    }

    const now = Date.now();
    const byTag = new Map<string, (typeof args.targets)[number]>();
    for (const target of args.targets) {
      const existing = byTag.get(target.tag);
      if (!existing || target.priority < existing.priority) byTag.set(target.tag, target);
    }
    const targets = [...byTag.values()].slice(0, 500);
    let added = 0;
    for (const target of targets) {
      const existing = await ctx.db
        .query("brawlCrawlTargets")
        .withIndex("by_tag", (q) => q.eq("tag", target.tag))
        .unique();
      if (existing) {
        if (target.priority < existing.priority || existing.disabled) {
          await ctx.db.patch(existing._id, {
            disabled: false,
            priority: Math.min(existing.priority, target.priority),
            source: target.priority < existing.priority ? target.source : existing.source,
          });
        }
        continue;
      }
      await ctx.db.insert("brawlCrawlTargets", {
        ...target,
        nextDueAt: now,
        consecutiveFailures: 0,
        disabled: false,
      });
      added += 1;
    }
    const discovered = byTag.size;
    const directorySightings = Math.max(Math.floor(args.directorySightings), 0);
    const failures = Math.max(Math.floor(args.failures), 0);
    await ctx.db.patch(args.runId, {
      discovered,
      added,
      directorySightings,
      failures,
      discoveryRecordedAt: now,
      updatedAt: now,
    });
    await incrementCounter(ctx, "targets_discovered", discovered, now);
    await incrementCounter(ctx, "targets_added", added, now);
    await incrementCounter(ctx, "directory_sightings", directorySightings, now);
    await incrementCounter(ctx, "api_failures", failures, now);
    return { status: "recorded" as const, discovered, added };
  },
});

export const claimCrawlBatch = internalMutation({
  args: {
    runId: v.id("brawlPipelineRuns"),
    limit: v.number(),
    leaseMs: v.number(),
  },
  returns: v.union(
    v.object({ status: v.literal("claimed"), targets: v.array(leasedTarget) }),
    v.object({ status: v.literal("run_inactive"), targets: v.array(leasedTarget) }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!isRunActive(run)) return { status: "run_inactive" as const, targets: [] };

    const now = Date.now();
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), MAX_CRAWL_BATCH_SIZE);
    const rows = await ctx.db
      .query("brawlCrawlTargets")
      .withIndex("by_due", (q) => q.eq("disabled", false).lte("nextDueAt", now))
      .take(limit);
    const targets = [];

    for (const row of rows) {
      const leaseToken = `${args.runId}:${row._id}:${now}`;
      const claimed = claimTarget(
        {
          nextDueAt: row.nextDueAt,
          lastFetchedAt: row.lastFetchedAt,
          lastBattleTime: row.lastBattleTime,
          consecutiveFailures: row.consecutiveFailures,
          lease: {},
        },
        { runId: args.runId, token: leaseToken, now, leaseMs: args.leaseMs },
      );
      const leaseExpiresAt = claimed.lease.expiresAt;
      if (leaseExpiresAt === undefined) throw new Error("Claim policy did not create a lease");
      await ctx.db.patch(row._id, {
        nextDueAt: claimed.nextDueAt,
        leaseRunId: args.runId,
        leaseToken,
        leaseClaimedAt: now,
        leaseExpiresAt,
      });
      targets.push({
        id: row._id,
        tag: row.tag,
        lastBattleTime: row.lastBattleTime,
        leaseToken,
        leaseExpiresAt,
      });
    }

    await ctx.db.patch(args.runId, {
      claimed: (run?.claimed ?? 0) + targets.length,
      updatedAt: now,
    });
    await incrementCounter(ctx, "targets_claimed", targets.length, now);
    return { status: "claimed" as const, targets };
  },
});

export const recordCrawlOutcome = internalMutation({
  args: {
    runId: v.id("brawlPipelineRuns"),
    targetId: v.id("brawlCrawlTargets"),
    leaseToken: v.string(),
    revisitMs: v.number(),
    outcome: crawlOutcome,
  },
  returns: targetOutcomeResult,
  handler: async (ctx, args) => {
    const [run, target] = await Promise.all([ctx.db.get(args.runId), ctx.db.get(args.targetId)]);
    if (!isRunActive(run)) return { status: "run_inactive" as const };
    if (!target) return { status: "stale_lease" as const };

    const now = Date.now();
    const settlement = settleTarget(
      {
        nextDueAt: target.nextDueAt,
        lastFetchedAt: target.lastFetchedAt,
        lastBattleTime: target.lastBattleTime,
        consecutiveFailures: target.consecutiveFailures,
        lease: {
          runId: target.leaseRunId,
          token: target.leaseToken,
          claimedAt: target.leaseClaimedAt,
          expiresAt: target.leaseExpiresAt,
        },
      },
      {
        runId: args.runId,
        token: args.leaseToken,
        now,
        revisitMs: args.revisitMs,
        outcome: args.outcome,
      },
    );

    if (settlement.status === "stale_lease") {
      await ctx.db.patch(args.runId, {
        staleCompletions: (run?.staleCompletions ?? 0) + 1,
        updatedAt: now,
      });
      await incrementCounter(ctx, "stale_lease_completions", 1, now);
      return { status: "stale_lease" as const };
    }

    await ctx.db.patch(args.targetId, {
      nextDueAt: settlement.target.nextDueAt,
      lastFetchedAt: settlement.target.lastFetchedAt,
      lastBattleTime: settlement.target.lastBattleTime,
      consecutiveFailures: settlement.target.consecutiveFailures,
      leaseRunId: undefined,
      leaseToken: undefined,
      leaseClaimedAt: undefined,
      leaseExpiresAt: undefined,
    });

    if (args.outcome.type === "success") {
      await ctx.db.patch(args.runId, {
        fetched: (run?.fetched ?? 0) + 1,
        battles: (run?.battles ?? 0) + args.outcome.battles,
        updatedAt: now,
      });
      await incrementCounter(ctx, "player_logs_fetched", 1, now);
      await incrementCounter(ctx, "battles_ingested", args.outcome.battles, now);
      await incrementCounter(
        ctx,
        "profile_snapshots",
        args.outcome.profileSnapshotCreated ? 1 : 0,
        now,
      );
    } else {
      await ctx.db.patch(args.runId, {
        failures: (run?.failures ?? 0) + 1,
        note: args.outcome.note ?? run?.note,
        updatedAt: now,
      });
      await incrementCounter(ctx, "api_failures", 1, now);
    }

    return {
      status: "accepted" as const,
      nextDueAt: settlement.target.nextDueAt,
      consecutiveFailures: settlement.target.consecutiveFailures,
      backoffMs: settlement.backoffMs,
    };
  },
});

export const completePipelineRun = internalMutation({
  args: {
    runId: v.id("brawlPipelineRuns"),
    outcome: v.union(v.literal("succeeded"), v.literal("failed")),
    note: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ status: v.literal("completed"), state: pipelineRunState }),
    v.object({ status: v.literal("already_completed"), state: pipelineRunState }),
    v.object({ status: v.literal("missing") }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return { status: "missing" as const };
    if (!isRunActive(run)) {
      return {
        status: "already_completed" as const,
        state: run.state ?? (run.ok ? "succeeded" : "failed"),
      };
    }

    const now = Date.now();
    const failed = args.outcome === "failed";
    await ctx.db.patch(args.runId, {
      state: args.outcome,
      ok: !failed,
      finishedAt: now,
      updatedAt: now,
      note: args.note ?? run.note,
      failures: (run.failures ?? 0) + (failed ? 1 : 0),
    });
    await incrementCounter(ctx, failed ? "pipeline_runs_failed" : "pipeline_runs_succeeded", 1, now);
    return { status: "completed" as const, state: args.outcome };
  },
});

export const retainPipelineData = internalMutation({
  args: {
    runId: v.id("brawlPipelineRuns"),
    limit: v.optional(v.number()),
  },
  returns: v.union(
    v.object({ status: v.literal("deleted"), deleted: v.number(), more: v.boolean() }),
    v.object({ status: v.literal("run_inactive"), deleted: v.number(), more: v.boolean() }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!isRunActive(run)) {
      return { status: "run_inactive" as const, deleted: 0, more: false };
    }

    const now = Date.now();
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? MAX_RETENTION_BATCH_SIZE), 1),
      MAX_RETENTION_BATCH_SIZE,
    );
    const cutoffs = retentionCutoffs(now);
    const probeSize = limit + 1;
    const [battles, fetchLogs, runs, snapshots] = await Promise.all([
      ctx.db
        .query("brawlSeenBattles")
        .withIndex("by_ingested_at", (q) => q.lt("ingestedAt", cutoffs.battleCutoff))
        .take(probeSize),
      ctx.db
        .query("brawlApiFetchLogs")
        .withIndex("by_fetched_at", (q) => q.lt("fetchedAt", cutoffs.telemetryCutoff))
        .take(probeSize),
      ctx.db
        .query("brawlPipelineRuns")
        .withIndex("by_started_at", (q) => q.lt("startedAt", cutoffs.telemetryCutoff))
        .take(probeSize),
      ctx.db
        .query("playerSnapshots")
        .withIndex("by_recorded_at", (q) => q.lt("recordedAt", cutoffs.snapshotCutoff))
        .take(probeSize),
    ]);
    const plan = planRetentionBatch(
      {
        battles: battles.length,
        fetchLogs: fetchLogs.length,
        runs: runs.length,
        snapshots: snapshots.length,
      },
      limit,
    );

    await Promise.all([
      ...battles.slice(0, plan.delete.battles).map((row) => ctx.db.delete(row._id)),
      ...fetchLogs.slice(0, plan.delete.fetchLogs).map((row) => ctx.db.delete(row._id)),
      ...runs.slice(0, plan.delete.runs).map((row) => ctx.db.delete(row._id)),
      ...snapshots.slice(0, plan.delete.snapshots).map((row) => ctx.db.delete(row._id)),
    ]);
    await ctx.db.patch(args.runId, { updatedAt: now });
    await incrementCounter(ctx, "retention_rows_deleted", plan.deleted, now);
    return { status: "deleted" as const, deleted: plan.deleted, more: plan.more };
  },
});

export const pipelineStatus = query({
  args: {},
  returns: v.object({
    now: v.number(),
    counters: v.array(v.object({ name: v.string(), value: v.number(), updatedAt: v.number() })),
    targets: v.object({ total: v.number(), due: v.number(), capped: v.boolean() }),
    battlesLast24Hours: v.object({ count: v.number(), capped: v.boolean() }),
    apiCallsLastHour: v.object({ total: v.number(), failures: v.number(), capped: v.boolean() }),
    recentRuns: v.array(v.object({
      id: v.id("brawlPipelineRuns"),
      job: v.string(),
      startedAt: v.number(),
      finishedAt: v.optional(v.number()),
      ok: v.boolean(),
      state: v.optional(pipelineRunState),
      claimed: v.optional(v.number()),
      staleCompletions: v.optional(v.number()),
      note: v.optional(v.string()),
      discovered: v.optional(v.number()),
      added: v.optional(v.number()),
      directorySightings: v.optional(v.number()),
      fetched: v.optional(v.number()),
      battles: v.optional(v.number()),
      failures: v.optional(v.number()),
    })),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const [counters, targetProbe, dueProbe, battleProbe, fetchProbe, recentRuns] = await Promise.all([
      ctx.db.query("brawlPipelineCounters").take(50),
      ctx.db.query("brawlCrawlTargets").take(1_001),
      ctx.db
        .query("brawlCrawlTargets")
        .withIndex("by_due", (q) => q.eq("disabled", false).lte("nextDueAt", now))
        .take(1_001),
      ctx.db
        .query("brawlSeenBattles")
        .withIndex("by_ingested_at", (q) => q.gte("ingestedAt", now - 24 * 60 * 60 * 1_000))
        .take(1_001),
      ctx.db
        .query("brawlApiFetchLogs")
        .withIndex("by_fetched_at", (q) => q.gte("fetchedAt", now - 60 * 60 * 1_000))
        .take(1_001),
      ctx.db.query("brawlPipelineRuns").withIndex("by_started_at").order("desc").take(20),
    ]);

    return {
      now,
      counters: counters.map(({ name, value, updatedAt }) => ({ name, value, updatedAt })),
      targets: {
        total: Math.min(targetProbe.length, 1_000),
        due: Math.min(dueProbe.length, 1_000),
        capped: targetProbe.length > 1_000 || dueProbe.length > 1_000,
      },
      battlesLast24Hours: {
        count: Math.min(battleProbe.length, 1_000),
        capped: battleProbe.length > 1_000,
      },
      apiCallsLastHour: {
        total: Math.min(fetchProbe.length, 1_000),
        failures: fetchProbe.slice(0, 1_000).filter((row) => !row.ok).length,
        capped: fetchProbe.length > 1_000,
      },
      recentRuns: recentRuns.map((run) => ({
        id: run._id,
        job: run.job,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        ok: run.ok,
        state: run.state,
        claimed: run.claimed,
        staleCompletions: run.staleCompletions,
        note: run.note,
        discovered: run.discovered,
        added: run.added,
        directorySightings: run.directorySightings,
        fetched: run.fetched,
        battles: run.battles,
        failures: run.failures,
      })),
    };
  },
});
