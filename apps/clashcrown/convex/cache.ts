import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { cacheKind } from "./schema";

export const get = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("apiCache")
      .withIndex("by_key", (query) => query.eq("key", args.key))
      .unique();
  }
});

export const put = internalMutation({
  args: {
    key: v.string(),
    kind: cacheKind,
    payload: v.string(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
    profile: v.optional(
      v.object({
        kind: v.union(v.literal("player"), v.literal("clan")),
        tag: v.string(),
        name: v.string(),
        value: v.number()
      })
    )
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("apiCache")
      .withIndex("by_key", (query) => query.eq("key", args.key))
      .unique();

    const value = {
      key: args.key,
      kind: args.kind,
      payload: args.payload,
      fetchedAt: args.fetchedAt,
      expiresAt: args.expiresAt,
      sourceVersion: "clash-royale-v1"
    };

    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("apiCache", value);

    if (args.profile) {
      // Only record a snapshot when the tracked value actually moved, so the
      // history table doesn't fill with duplicate rows on every cache refresh.
      const latest = await ctx.db
        .query("profileHistory")
        .withIndex("by_profile", (query) => query.eq("kind", args.profile!.kind).eq("tag", args.profile!.tag))
        .order("desc")
        .first();

      if (!latest || latest.value !== args.profile.value) {
        await ctx.db.insert("profileHistory", {
          ...args.profile,
          recordedAt: args.fetchedAt
        });
      }
    }
  }
});

export const logFetch = internalMutation({
  args: {
    endpoint: v.string(),
    status: v.number(),
    ok: v.boolean(),
    fetchedAt: v.number()
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("apiFetchLogs", args);
  }
});

export const history = query({
  args: {
    kind: v.union(v.literal("player"), v.literal("clan")),
    tag: v.string()
  },
  handler: async (ctx, args) => {
    // by_profile is [kind, tag, recordedAt], so this walks the index backwards
    // instead of scanning the whole table the way the old .filter() did.
    const rows = await ctx.db
      .query("profileHistory")
      .withIndex("by_profile", (query) => query.eq("kind", args.kind).eq("tag", args.tag))
      .order("desc")
      .take(60);

    return rows.reverse();
  }
});
