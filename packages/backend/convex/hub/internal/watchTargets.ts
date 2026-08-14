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

export const claimDuePlayerTargets = internalMutation({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(
    v.object({
      targetKey: v.string(),
      game: gameIdValidator,
      playerTag: v.string(),
      cadence: refreshCadenceValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.max(0, Math.min(Math.floor(args.limit), MAX_DUE_TARGETS));
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
        query.eq("status", "active").lte("expiresAt", now),
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
