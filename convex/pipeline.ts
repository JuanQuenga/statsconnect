import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { crawlSource } from "./schema";

const targetInput = v.object({
  tag: v.string(),
  source: crawlSource,
  priority: v.number(),
});

const claimedTarget = v.object({
  id: v.id("crawlTargets"),
  tag: v.string(),
  lastBattleTime: v.optional(v.string()),
});

const counterInput = v.object({
  name: v.string(),
  amount: v.number(),
});

const runSummary = {
  discovered: v.optional(v.number()),
  fetched: v.optional(v.number()),
  battles: v.optional(v.number()),
  failures: v.optional(v.number()),
};

export const upsertTargets = internalMutation({
  args: { targets: v.array(targetInput) },
  returns: v.object({ added: v.number(), seen: v.number() }),
  handler: async (ctx, args) => {
    let added = 0;

    for (const target of args.targets.slice(0, 500)) {
      const existing = await ctx.db
        .query("crawlTargets")
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

      await ctx.db.insert("crawlTargets", {
        ...target,
        nextDueAt: Date.now(),
        consecutiveFailures: 0,
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
  },
  returns: v.array(claimedTarget),
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("crawlTargets")
      .withIndex("by_due", (q) => q.eq("disabled", false).lte("nextDueAt", now))
      .take(Math.min(Math.max(Math.floor(args.limit), 1), 25));

    for (const row of rows) {
      await ctx.db.patch(row._id, { nextDueAt: now + args.leaseMs });
    }

    return rows.map((row) => ({
      id: row._id,
      tag: row.tag,
      lastBattleTime: row.lastBattleTime,
    }));
  },
});

export const completeTarget = internalMutation({
  args: {
    id: v.id("crawlTargets"),
    ok: v.boolean(),
    lastBattleTime: v.optional(v.string()),
    revisitMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.id);
    if (!target) return null;

    const now = Date.now();
    if (args.ok) {
      await ctx.db.patch(args.id, {
        lastFetchedAt: now,
        lastBattleTime: args.lastBattleTime ?? target.lastBattleTime,
        consecutiveFailures: 0,
        nextDueAt: now + args.revisitMs,
      });
      return null;
    }

    const failures = target.consecutiveFailures + 1;
    const backoffMs = Math.min(args.revisitMs * 2 ** Math.min(failures, 6), 24 * 60 * 60 * 1_000);
    await ctx.db.patch(args.id, {
      consecutiveFailures: failures,
      nextDueAt: now + backoffMs,
    });
    return null;
  },
});

export const startRun = internalMutation({
  args: { job: v.string() },
  returns: v.id("pipelineRuns"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("pipelineRuns", {
      job: args.job,
      startedAt: Date.now(),
      ok: false,
    });
  },
});

export const finishRun = internalMutation({
  args: {
    id: v.id("pipelineRuns"),
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
        .query("pipelineCounters")
        .withIndex("by_name", (q) => q.eq("name", counter.name))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          value: existing.value + counter.amount,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("pipelineCounters", {
          name: counter.name,
          value: counter.amount,
          updatedAt: now,
        });
      }
    }
    return null;
  },
});

export const logFetch = internalMutation({
  args: {
    endpoint: v.string(),
    status: v.number(),
    ok: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("apiFetchLogs", {
      ...args,
      fetchedAt: Date.now(),
    });
    return null;
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
      id: v.id("pipelineRuns"),
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
    const [counters, targetProbe, dueProbe, battleProbe, fetchProbe, recentRuns] = await Promise.all([
      ctx.db.query("pipelineCounters").take(50),
      ctx.db.query("crawlTargets").take(1_001),
      ctx.db
        .query("crawlTargets")
        .withIndex("by_due", (q) => q.eq("disabled", false).lte("nextDueAt", now))
        .take(1_001),
      ctx.db
        .query("seenBattles")
        .withIndex("by_ingested_at", (q) => q.gte("ingestedAt", now - 24 * 60 * 60 * 1_000))
        .take(1_001),
      ctx.db
        .query("apiFetchLogs")
        .withIndex("by_fetched_at", (q) => q.gte("fetchedAt", now - 60 * 60 * 1_000))
        .take(1_001),
      ctx.db.query("pipelineRuns").withIndex("by_started_at").order("desc").take(20),
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
    const [battles, fetches, runs, snapshots] = await Promise.all([
      ctx.db
        .query("seenBattles")
        .withIndex("by_ingested_at", (q) => q.lt("ingestedAt", args.battleCutoff))
        .take(limit),
      ctx.db
        .query("apiFetchLogs")
        .withIndex("by_fetched_at", (q) => q.lt("fetchedAt", args.telemetryCutoff))
        .take(limit),
      ctx.db
        .query("pipelineRuns")
        .withIndex("by_started_at", (q) => q.lt("startedAt", args.telemetryCutoff))
        .take(limit),
      ctx.db
        .query("playerSnapshots")
        .withIndex("by_recorded_at", (q) => q.lt("recordedAt", args.snapshotCutoff))
        .take(limit),
    ]);

    for (const row of [...battles, ...fetches, ...runs, ...snapshots]) {
      await ctx.db.delete(row._id);
    }

    return {
      deleted: battles.length + fetches.length + runs.length + snapshots.length,
      more:
        battles.length === limit ||
        fetches.length === limit ||
        runs.length === limit ||
        snapshots.length === limit,
    };
  },
});
