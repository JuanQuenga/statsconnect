import { ConvexError, v } from "convex/values";
import { internalMutation } from "../../_generated/server";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 6;
const MAX_PRUNE_ROWS = 200;
const GLOBAL_KEY = "__global__";
const GLOBAL_MAX_PER_WINDOW = 120;

export const checkAndRecord = internalMutation({
  args: { ownerKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const row = await ctx.db
      .query("connectThrottles")
      .withIndex("by_owner_key", (query) => query.eq("ownerKey", args.ownerKey))
      .unique();
    const attempts = (row?.attempts ?? []).filter((timestamp) => timestamp > cutoff);
    if (attempts.length >= MAX_ATTEMPTS) {
      throw new ConvexError({
        code: "RATE_LIMITED",
        message: "Too many connection attempts. Wait a minute and try again.",
      });
    }
    const next = [...attempts, now];
    if (row) await ctx.db.patch(row._id, { attempts: next, updatedAt: now });
    else await ctx.db.insert("connectThrottles", { ownerKey: args.ownerKey, attempts: next, updatedAt: now });
    return null;
  },
});

/**
 * Shared anonymous ceiling for preview lookups. Spoofable client keys cannot
 * evade the per-viewer limit, so this bounds aggregate unauthenticated
 * upstream proxy traffic per minute regardless of key rotation.
 */
export const checkAndRecordGlobal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const row = await ctx.db
      .query("connectThrottles")
      .withIndex("by_owner_key", (query) => query.eq("ownerKey", GLOBAL_KEY))
      .unique();
    const attempts = (row?.attempts ?? []).filter((timestamp) => timestamp > cutoff);
    if (attempts.length >= GLOBAL_MAX_PER_WINDOW) {
      throw new ConvexError({
        code: "RATE_LIMITED",
        message: "Too many connection attempts right now. Try again shortly.",
      });
    }
    // Keep only a bounded tail; the global row never prunes by age.
    const next = [...attempts.slice(-GLOBAL_MAX_PER_WINDOW), now];
    if (row) await ctx.db.patch(row._id, { attempts: next, updatedAt: now });
    else await ctx.db.insert("connectThrottles", { ownerKey: GLOBAL_KEY, attempts: next, updatedAt: now });
    return null;
  },
});

export const pruneExpired = internalMutation({
  args: { now: v.number(), limit: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const limit = Math.max(0, Math.min(Math.floor(args.limit), MAX_PRUNE_ROWS));
    if (limit === 0) return 0;

    // The global row is long-lived; only stale per-key rows are collected.
    const rows = await ctx.db
      .query("connectThrottles")
      .withIndex("by_updated_at", (query) => query.lte("updatedAt", args.now - WINDOW_MS))
      .order("asc")
      .take(limit);
    for (const row of rows) {
      if (row.ownerKey === GLOBAL_KEY) continue;
      await ctx.db.delete(row._id);
    }
    return rows.length;
  },
});
