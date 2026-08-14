import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { gameIdValidator, refreshCadenceValidator } from "../schema";
import {
  completeTargetPoll,
  registerConnectedProfile,
  unregisterWatcher,
} from "../watchTargetModel";

const MAX_DUE_TARGETS = 20;
const BACKFILL_BATCH = 100;
const EXPIRY_BATCH = 100;
const LEASE_MS = 10 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export const claimDuePlayerTargets = internalMutation({
  args: { now: v.number(), limit: v.number(), dailyLimit: v.number() },
  returns: v.array(
    v.object({
      targetKey: v.string(),
      game: gameIdValidator,
      playerTag: v.string(),
      cadence: refreshCadenceValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const requestedLimit = Math.max(0, Math.min(Math.floor(args.limit), MAX_DUE_TARGETS));
    const dailyLimit = Math.max(0, Math.floor(args.dailyLimit));
    const dayStartedAt = Math.floor(args.now / DAY_MS) * DAY_MS;
    const budget = await ctx.db
      .query("hubRefreshBudgets")
      .withIndex("by_day_started_at", (query) =>
        query.eq("dayStartedAt", dayStartedAt),
      )
      .unique();
    const remaining = Math.max(0, dailyLimit - (budget?.reservedTargets ?? 0));
    const limit = Math.min(requestedLimit, remaining);
    if (limit === 0) return [];
    const rows = await ctx.db
      .query("watchTargets")
      .withIndex("by_status_and_entity_and_next_due_at", (query) =>
        query
          .eq("status", "active")
          .eq("entity", "player")
          .lte("nextDueAt", args.now),
      )
      .order("asc")
      .take(limit);

    for (const row of rows) {
      await ctx.db.patch(row._id, {
        nextDueAt: args.now + LEASE_MS,
        updatedAt: args.now,
      });
    }
    if (rows.length > 0) {
      if (budget) {
        await ctx.db.patch(budget._id, {
          reservedTargets: budget.reservedTargets + rows.length,
          updatedAt: args.now,
        });
      } else {
        await ctx.db.insert("hubRefreshBudgets", {
          dayStartedAt,
          reservedTargets: rows.length,
          updatedAt: args.now,
        });
      }
    }

    return rows.map((row) => ({
      targetKey: row.targetKey,
      game: row.game,
      playerTag: row.tag,
      cadence: row.cadence,
    }));
  },
});

export const recordPoll = internalMutation({
  args: {
    targetKey: v.string(),
    attemptedAt: v.number(),
    succeeded: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await completeTargetPoll(ctx, args.targetKey, {
      now: args.attemptedAt,
      succeeded: args.succeeded,
    });
    return null;
  },
});

/**
 * Migration-safe registration for connectedProfiles created before shared
 * watch targets existed. Missing optional index values sort together, so each
 * run moves one bounded batch out of the migration range.
 */
export const backfillConnectedProfiles = internalMutation({
  args: {},
  returns: v.object({ migrated: v.number(), remaining: v.boolean() }),
  handler: async (ctx) => {
    const profiles = await ctx.db
      .query("connectedProfiles")
      .withIndex("by_refresh_target_key", (query) =>
        query.eq("refreshTargetKey", undefined),
      )
      .take(BACKFILL_BATCH);
    const now = Date.now();

    for (const profile of profiles) {
      const targetKey = await registerConnectedProfile(
        ctx,
        { game: profile.game, entity: "player", tag: profile.playerTag },
        { now, nextDueAt: now },
      );
      await ctx.db.patch(profile._id, { refreshTargetKey: targetKey });
    }

    return {
      migrated: profiles.length,
      remaining: profiles.length === BACKFILL_BATCH,
    };
  },
});

export const expireWatchDemands = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const demands = await ctx.db
      .query("watchDemands")
      .withIndex("by_status_and_expires_at", (query) =>
        query
          .eq("status", "active")
          .gt("expiresAt", 0)
          .lte("expiresAt", now),
      )
      .order("asc")
      .take(EXPIRY_BATCH);

    for (const demand of demands) {
      await ctx.db.patch(demand._id, {
        status: "expired",
        updatedAt: now,
      });
      await unregisterWatcher(ctx, demand.targetKey, now);
    }
    return demands.length;
  },
});

export const pruneRefreshBudgets = internalMutation({
  args: { now: v.number(), limit: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const currentDay = Math.floor(args.now / DAY_MS) * DAY_MS;
    const limit = Math.max(0, Math.min(Math.floor(args.limit), 32));
    if (limit === 0) return 0;
    const rows = await ctx.db
      .query("hubRefreshBudgets")
      .withIndex("by_day_started_at", (query) =>
        query.lt("dayStartedAt", currentDay - DAY_MS),
      )
      .take(limit);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
