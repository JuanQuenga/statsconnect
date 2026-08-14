import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  adaptivePollDelayMs,
  boundedInteger,
  envEnabled,
  hourBucket,
  lookupExpiry,
  telemetryBucket,
} from "./controls";
import { apiBudgetScope, crawlSource } from "./schema";

declare const process: { env: Record<string, string | undefined> };

const targetInput = v.object({
  tag: v.string(),
  source: crawlSource,
  priority: v.number(),
  expiresAt: v.optional(v.number()),
});

const claimedTarget = v.object({
  id: v.id("brawlCrawlTargets"),
  tag: v.string(),
  lastBattleTime: v.optional(v.string()),
  fetchProfile: v.boolean(),
});

const counterInput = v.object({
  name: v.string(),
  amount: v.number(),
});

const fetchTelemetryInput = v.object({
  endpoint: v.string(),
  status: v.number(),
});

const runSummary = {
  discovered: v.optional(v.number()),
  fetched: v.optional(v.number()),
  battles: v.optional(v.number()),
  failures: v.optional(v.number()),
};

type BudgetScope = "crawl" | "public";
type BudgetState = {
  id: Id<"brawlApiBudgets"> | null;
  key: string;
  scope: BudgetScope;
  bucketStartedAt: number;
  reserved: number;
  remaining: number;
};

async function readBudget(
  ctx: MutationCtx,
  scope: BudgetScope,
  now: number,
  rawLimit: number,
): Promise<BudgetState> {
  const bucketStartedAt = hourBucket(now);
  const key = `${scope}:${bucketStartedAt}`;
  const existing = await ctx.db
    .query("brawlApiBudgets")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  const limit = Math.max(0, Math.floor(rawLimit));
  const reserved = existing?.reserved ?? 0;
  return {
    id: existing?._id ?? null,
    key,
    scope,
    bucketStartedAt,
    reserved,
    remaining: Math.max(0, limit - reserved),
  };
}

async function commitBudget(
  ctx: MutationCtx,
  budget: BudgetState,
  amount: number,
  now: number,
): Promise<void> {
  if (amount <= 0) return;
  if (budget.id) {
    await ctx.db.patch(budget.id, { reserved: budget.reserved + amount, updatedAt: now });
    return;
  }
  await ctx.db.insert("brawlApiBudgets", {
    key: budget.key,
    scope: budget.scope,
    bucketStartedAt: budget.bucketStartedAt,
    reserved: amount,
    updatedAt: now,
  });
}

async function recordFetchTelemetry(
  ctx: MutationCtx,
  scope: BudgetScope,
  fetches: Array<{ endpoint: string; status: number }>,
): Promise<void> {
  const now = Date.now();
  const bucketStartedAt = telemetryBucket(now);
  const grouped = new Map<string, { calls: number; failures: number; rateLimited: number; serverErrors: number }>();
  for (const fetch of fetches.slice(0, 100)) {
    const values = grouped.get(fetch.endpoint) ?? { calls: 0, failures: 0, rateLimited: 0, serverErrors: 0 };
    values.calls += 1;
    values.failures += fetch.status >= 200 && fetch.status < 300 ? 0 : 1;
    values.rateLimited += fetch.status === 429 ? 1 : 0;
    values.serverErrors += fetch.status === 0 || fetch.status >= 500 ? 1 : 0;
    grouped.set(fetch.endpoint, values);
  }

  for (const [endpoint, values] of grouped) {
    const key = `${scope}:${bucketStartedAt}:${endpoint}`;
    const existing = await ctx.db
      .query("brawlApiTelemetryBuckets")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        calls: existing.calls + values.calls,
        failures: existing.failures + values.failures,
        rateLimited: existing.rateLimited + values.rateLimited,
        serverErrors: existing.serverErrors + values.serverErrors,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("brawlApiTelemetryBuckets", {
        key,
        scope,
        endpoint,
        bucketStartedAt,
        ...values,
        updatedAt: now,
      });
    }
  }
}

export const upsertTargets = internalMutation({
  args: { targets: v.array(targetInput) },
  returns: v.object({ added: v.number(), seen: v.number() }),
  handler: async (ctx, args) => {
    let added = 0;

    for (const target of args.targets.slice(0, 500)) {
      const existing = await ctx.db
        .query("brawlCrawlTargets")
        .withIndex("by_tag", (q) => q.eq("tag", target.tag))
        .unique();

      if (existing) {
        const durable = target.source !== "lookup";
        const improvesPriority = target.priority < existing.priority;
        if (improvesPriority || existing.disabled || (existing.source === "lookup" && durable)) {
          await ctx.db.patch(existing._id, {
            disabled: false,
            priority: Math.min(existing.priority, target.priority),
            source: durable || improvesPriority ? target.source : existing.source,
            expiresAt: durable ? undefined : target.expiresAt ?? existing.expiresAt,
          });
        }
        continue;
      }

      await ctx.db.insert("brawlCrawlTargets", {
        ...target,
        nextDueAt: Date.now(),
        consecutiveFailures: 0,
        consecutiveEmptyPolls: 0,
        expiresAt: target.source === "lookup" ? target.expiresAt : undefined,
        disabled: false,
      });
      added += 1;
    }

    return { added, seen: args.targets.length };
  },
});

export const claimTargets = internalMutation({
  args: {
    limit: v.number(),
    leaseMs: v.number(),
    profileRevisitMs: v.number(),
    budgetLimit: v.number(),
  },
  returns: v.object({
    targets: v.array(claimedTarget),
    budgetRemaining: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), 25);
    const rows = await ctx.db
      .query("brawlCrawlTargets")
      .withIndex("by_due", (q) => q.eq("disabled", false).lte("nextDueAt", now))
      .take(Math.min(limit * 4, 100));

    const budget = await readBudget(ctx, "crawl", now, args.budgetLimit);
    let reserved = 0;
    const claimed: Array<{
      id: Id<"brawlCrawlTargets">;
      tag: string;
      lastBattleTime?: string;
      fetchProfile: boolean;
    }> = [];

    for (const row of rows) {
      const expiry = lookupExpiry(row.source, row._creationTime, row.expiresAt);
      if (expiry !== undefined && expiry <= now) {
        await ctx.db.patch(row._id, { disabled: true, expiresAt: expiry });
        continue;
      }
      if (claimed.length >= limit || reserved >= budget.remaining) break;

      const lastProfileAttempt = row.lastProfileAttemptAt ?? row.lastProfileFetchedAt ?? 0;
      const profileDue = lastProfileAttempt <= now - args.profileRevisitMs;
      const fetchProfile = profileDue && reserved + 2 <= budget.remaining;
      reserved += fetchProfile ? 2 : 1;
      claimed.push({
        id: row._id,
        tag: row.tag,
        lastBattleTime: row.lastBattleTime,
        fetchProfile,
      });
    }

    for (const row of claimed) {
      await ctx.db.patch(row.id, { nextDueAt: now + args.leaseMs });
    }
    await commitBudget(ctx, budget, reserved, now);

    return { targets: claimed, budgetRemaining: Math.max(0, budget.remaining - reserved) };
  },
});

export const completeTarget = internalMutation({
  args: {
    id: v.id("brawlCrawlTargets"),
    ok: v.boolean(),
    lastBattleTime: v.optional(v.string()),
    baseRevisitMs: v.number(),
    battlesInserted: v.number(),
    profileAttempted: v.boolean(),
    profileOk: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.id);
    if (!target) return null;

    const now = Date.now();
    if (args.ok) {
      const emptyPolls = args.battlesInserted > 0 ? 0 : (target.consecutiveEmptyPolls ?? 0) + 1;
      await ctx.db.patch(args.id, {
        lastFetchedAt: now,
        lastProfileAttemptAt: args.profileAttempted ? now : target.lastProfileAttemptAt,
        lastProfileFetchedAt: args.profileOk ? now : target.lastProfileFetchedAt,
        lastBattleTime: args.lastBattleTime ?? target.lastBattleTime,
        consecutiveFailures: 0,
        consecutiveEmptyPolls: emptyPolls,
        nextDueAt: now + adaptivePollDelayMs(args.baseRevisitMs, emptyPolls, target.priority),
      });
      return null;
    }

    const failures = target.consecutiveFailures + 1;
    const backoffMs = Math.min(args.baseRevisitMs * 2 ** Math.min(failures, 6), 24 * 60 * 60 * 1_000);
    await ctx.db.patch(args.id, {
      consecutiveFailures: failures,
      lastProfileAttemptAt: args.profileAttempted ? now : target.lastProfileAttemptAt,
      lastProfileFetchedAt: args.profileOk ? now : target.lastProfileFetchedAt,
      nextDueAt: now + backoffMs,
    });
    return null;
  },
});

export const startRun = internalMutation({
  args: { job: v.string() },
  returns: v.id("brawlPipelineRuns"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("brawlPipelineRuns", {
      job: args.job,
      startedAt: Date.now(),
      ok: false,
    });
  },
});

export const finishRun = internalMutation({
  args: {
    id: v.id("brawlPipelineRuns"),
    ok: v.boolean(),
    note: v.optional(v.string()),
    ...runSummary,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      finishedAt: Date.now(),
      ok: args.ok,
      note: args.note,
      discovered: args.discovered,
      fetched: args.fetched,
      battles: args.battles,
      failures: args.failures,
    });
    return null;
  },
});

export const bumpCounters = internalMutation({
  args: { counters: v.array(counterInput) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const counter of args.counters.slice(0, 20)) {
      const existing = await ctx.db
        .query("brawlPipelineCounters")
        .withIndex("by_name", (q) => q.eq("name", counter.name))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          value: existing.value + counter.amount,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("brawlPipelineCounters", {
          name: counter.name,
          value: counter.amount,
          updatedAt: now,
        });
      }
    }
    return null;
  },
});

export const recordFetchBatch = internalMutation({
  args: {
    scope: apiBudgetScope,
    fetches: v.array(fetchTelemetryInput),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordFetchTelemetry(ctx, args.scope, args.fetches);
    return null;
  },
});

export const reserveBudget = internalMutation({
  args: {
    scope: apiBudgetScope,
    requested: v.number(),
    limit: v.number(),
  },
  returns: v.object({ granted: v.number(), remaining: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const budget = await readBudget(ctx, args.scope, now, args.limit);
    const granted = Math.min(Math.max(Math.floor(args.requested), 0), budget.remaining);
    await commitBudget(ctx, budget, granted, now);
    return { granted, remaining: Math.max(0, budget.remaining - granted) };
  },
});

export const pipelineStatus = query({
  args: {},
  returns: v.object({
    now: v.number(),
    counters: v.array(v.object({ name: v.string(), value: v.number(), updatedAt: v.number() })),
    targets: v.object({ total: v.number(), due: v.number(), expiring: v.number(), capped: v.boolean() }),
    battlesLast24Hours: v.object({ count: v.number(), capped: v.boolean() }),
    apiCallsLastHour: v.object({
      total: v.number(),
      failures: v.number(),
      rateLimited: v.number(),
      serverErrors: v.number(),
      capped: v.boolean(),
      windowStartedAt: v.number(),
    }),
    controls: v.object({
      crawlerEnabled: v.boolean(),
      publicUpstreamEnabled: v.boolean(),
      crawlHourlyLimit: v.number(),
      publicHourlyLimit: v.number(),
      crawlReserved: v.number(),
      publicReserved: v.number(),
    }),
    recentRuns: v.array(v.object({
      id: v.id("brawlPipelineRuns"),
      job: v.string(),
      startedAt: v.number(),
      finishedAt: v.optional(v.number()),
      ok: v.boolean(),
      note: v.optional(v.string()),
      discovered: v.optional(v.number()),
      fetched: v.optional(v.number()),
      battles: v.optional(v.number()),
      failures: v.optional(v.number()),
    })),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const windowStartedAt = hourBucket(now);
    const crawlBudgetKey = `crawl:${windowStartedAt}`;
    const publicBudgetKey = `public:${windowStartedAt}`;
    const [counters, targetProbe, dueProbe, lookupProbe, battleProbe, telemetryProbe, crawlBudget, publicBudget, recentRuns] = await Promise.all([
      ctx.db.query("brawlPipelineCounters").take(50),
      ctx.db.query("brawlCrawlTargets").take(1_001),
      ctx.db
        .query("brawlCrawlTargets")
        .withIndex("by_due", (q) => q.eq("disabled", false).lte("nextDueAt", now))
        .take(1_001),
      ctx.db
        .query("brawlCrawlTargets")
        .withIndex("by_source", (q) => q.eq("source", "lookup"))
        .take(1_001),
      ctx.db
        .query("brawlSeenBattles")
        .withIndex("by_ingested_at", (q) => q.gte("ingestedAt", now - 24 * 60 * 60 * 1_000))
        .take(1_001),
      ctx.db
        .query("brawlApiTelemetryBuckets")
        .withIndex("by_bucket_started_at", (q) => q.gte("bucketStartedAt", windowStartedAt))
        .take(201),
      ctx.db.query("brawlApiBudgets").withIndex("by_key", (q) => q.eq("key", crawlBudgetKey)).unique(),
      ctx.db.query("brawlApiBudgets").withIndex("by_key", (q) => q.eq("key", publicBudgetKey)).unique(),
      ctx.db.query("brawlPipelineRuns").withIndex("by_started_at").order("desc").take(20),
    ]);

    const telemetry = telemetryProbe.slice(0, 200).reduce(
      (total, row) => ({
        calls: total.calls + row.calls,
        failures: total.failures + row.failures,
        rateLimited: total.rateLimited + row.rateLimited,
        serverErrors: total.serverErrors + row.serverErrors,
      }),
      { calls: 0, failures: 0, rateLimited: 0, serverErrors: 0 },
    );

    return {
      now,
      counters: counters.map(({ name, value, updatedAt }) => ({ name, value, updatedAt })),
      targets: {
        total: Math.min(targetProbe.length, 1_000),
        due: Math.min(dueProbe.length, 1_000),
        expiring: Math.min(lookupProbe.filter((row) => !row.disabled).length, 1_000),
        capped: targetProbe.length > 1_000 || dueProbe.length > 1_000 || lookupProbe.length > 1_000,
      },
      battlesLast24Hours: {
        count: Math.min(battleProbe.length, 1_000),
        capped: battleProbe.length > 1_000,
      },
      apiCallsLastHour: {
        total: telemetry.calls,
        failures: telemetry.failures,
        rateLimited: telemetry.rateLimited,
        serverErrors: telemetry.serverErrors,
        capped: telemetryProbe.length > 200,
        windowStartedAt,
      },
      controls: {
        crawlerEnabled: envEnabled(process.env.BRAWL_CRAWLER_ENABLED),
        publicUpstreamEnabled: envEnabled(process.env.BRAWL_PUBLIC_API_ENABLED),
        crawlHourlyLimit: boundedInteger(process.env.BRAWL_CRAWL_MAX_CALLS_PER_HOUR, 500, 0, 10_000),
        publicHourlyLimit: boundedInteger(process.env.BRAWL_PUBLIC_MAX_CALLS_PER_HOUR, 1_000, 0, 20_000),
        crawlReserved: crawlBudget?.reserved ?? 0,
        publicReserved: publicBudget?.reserved ?? 0,
      },
      recentRuns: recentRuns.map((run) => ({
        id: run._id,
        job: run.job,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        ok: run.ok,
        note: run.note,
        discovered: run.discovered,
        fetched: run.fetched,
        battles: run.battles,
        failures: run.failures,
      })),
    };
  },
});

export const pruneBatch = internalMutation({
  args: {
    battleCutoff: v.number(),
    telemetryCutoff: v.number(),
    snapshotCutoff: v.number(),
    limit: v.number(),
  },
  returns: v.object({ deleted: v.number(), more: v.boolean() }),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), 256);
    const [battles, fetches, telemetry, budgets, cache, runs, snapshots] = await Promise.all([
      ctx.db
        .query("brawlSeenBattles")
        .withIndex("by_ingested_at", (q) => q.lt("ingestedAt", args.battleCutoff))
        .take(limit),
      ctx.db
        .query("brawlApiFetchLogs")
        .withIndex("by_fetched_at", (q) => q.lt("fetchedAt", args.telemetryCutoff))
        .take(limit),
      ctx.db
        .query("brawlApiTelemetryBuckets")
        .withIndex("by_bucket_started_at", (q) => q.lt("bucketStartedAt", args.telemetryCutoff))
        .take(limit),
      ctx.db
        .query("brawlApiBudgets")
        .withIndex("by_bucket_started_at", (q) => q.lt("bucketStartedAt", args.telemetryCutoff))
        .take(limit),
      ctx.db
        .query("brawlPlayerCache")
        .withIndex("by_updated_at", (q) => q.lt("updatedAt", args.telemetryCutoff))
        .take(limit),
      ctx.db
        .query("brawlPipelineRuns")
        .withIndex("by_started_at", (q) => q.lt("startedAt", args.telemetryCutoff))
        .take(limit),
      ctx.db
        .query("playerSnapshots")
        .withIndex("by_recorded_at", (q) => q.lt("recordedAt", args.snapshotCutoff))
        .take(limit),
    ]);

    for (const row of [...battles, ...fetches, ...telemetry, ...budgets, ...cache, ...runs, ...snapshots]) {
      await ctx.db.delete(row._id);
    }

    return {
      deleted:
        battles.length +
        fetches.length +
        telemetry.length +
        budgets.length +
        cache.length +
        runs.length +
        snapshots.length,
      more:
        battles.length === limit ||
        fetches.length === limit ||
        telemetry.length === limit ||
        budgets.length === limit ||
        cache.length === limit ||
        runs.length === limit ||
        snapshots.length === limit,
    };
  },
});
