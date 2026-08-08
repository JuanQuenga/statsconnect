import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 6;

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
