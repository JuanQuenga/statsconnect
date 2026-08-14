import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "../_generated/server";
import { cacheKind } from "./schema";

export const get = internalQuery({
  args: { key: v.string() },
  returns: v.union(v.null(), v.object({
    _id: v.id("apiCache"),
    _creationTime: v.number(),
    key: v.string(),
    kind: cacheKind,
    payload: v.string(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
    sourceVersion: v.string()
  })),
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
  returns: v.null(),
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
    return null;
  }
});

export const recordFetches = internalMutation({
  args: {
    fetches: v.array(v.object({
      endpoint: v.string(),
      status: v.number(),
      ok: v.boolean(),
      fetchedAt: v.number()
    }))
  },
  returns: v.object({ buckets: v.number(), requests: v.number() }),
  handler: async (ctx, args) => {
    const aggregates = new Map<string, {
      bucketStart: number;
      endpoint: string;
      statusClass: string;
      requests: number;
      failures: number;
      lastFetchedAt: number;
    }>();
    for (const fetch of args.fetches.slice(0, 100)) {
      const bucketStart = Math.floor(fetch.fetchedAt / 300_000) * 300_000;
      const statusClass = fetch.status > 0 ? `${Math.floor(fetch.status / 100)}xx` : "network";
      const key = `${bucketStart}:${fetch.endpoint}:${statusClass}`;
      const aggregate = aggregates.get(key) ?? {
        bucketStart,
        endpoint: fetch.endpoint,
        statusClass,
        requests: 0,
        failures: 0,
        lastFetchedAt: fetch.fetchedAt
      };
      aggregate.requests += 1;
      aggregate.failures += fetch.ok ? 0 : 1;
      aggregate.lastFetchedAt = Math.max(aggregate.lastFetchedAt, fetch.fetchedAt);
      aggregates.set(key, aggregate);
    }

    for (const aggregate of aggregates.values()) {
      const existing = await ctx.db
        .query("clashApiFetchTelemetry")
        .withIndex("by_bucket_and_endpoint_and_status", (q) =>
          q
            .eq("bucketStart", aggregate.bucketStart)
            .eq("endpoint", aggregate.endpoint)
            .eq("statusClass", aggregate.statusClass)
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          requests: existing.requests + aggregate.requests,
          failures: existing.failures + aggregate.failures,
          lastFetchedAt: Math.max(existing.lastFetchedAt, aggregate.lastFetchedAt)
        });
      } else {
        await ctx.db.insert("clashApiFetchTelemetry", aggregate);
      }
    }
    return { buckets: aggregates.size, requests: Math.min(args.fetches.length, 100) };
  }
});

export const history = query({
  args: {
    kind: v.union(v.literal("player"), v.literal("clan")),
    tag: v.string()
  },
  returns: v.array(v.object({
    _id: v.id("profileHistory"),
    _creationTime: v.number(),
    kind: v.union(v.literal("player"), v.literal("clan")),
    tag: v.string(),
    name: v.string(),
    value: v.number(),
    recordedAt: v.number()
  })),
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
