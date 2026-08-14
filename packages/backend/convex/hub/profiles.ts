import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import { action, mutation, query } from "../_generated/server";
import { isProfileSummary } from "./adapters/guards";
import { getAdapter } from "./adapters/registry";
import { normalizeTag } from "./adapters/tags";
import { AdapterError, type AdapterResult, type ProfileSummary } from "./adapters/types";
import { readThrough } from "./cacheAccess";
import { ownerKey, toPublicDisplay } from "./model";
import {
  registerConnectedProfile,
  touchTarget,
  unregisterConnectedProfile,
} from "./watchTargetModel";
import {
  connectedProfileValidator,
  gameIdValidator,
  profileIdValidator,
  summaryResultValidator,
} from "./validators";

function publicTag(input: string): string {
  try {
    return normalizeTag(input);
  } catch (error) {
    if (error instanceof AdapterError) {
      throw new ConvexError({ code: error.code, message: error.message });
    }
    throw error;
  }
}

export const getHubState = query({
  args: { viewerId: v.string() },
  returns: v.object({
    activeProfileId: v.union(profileIdValidator, v.null()),
    profiles: v.array(connectedProfileValidator),
  }),
  handler: async (ctx, args) => {
    const key = ownerKey(args.viewerId);
    const [profiles, settings] = await Promise.all([
      ctx.db
        .query("connectedProfiles")
        .withIndex("by_owner_key_and_connected_at", (index) => index.eq("ownerKey", key))
        .order("desc")
        .take(2),
      ctx.db.query("viewerSettings").withIndex("by_owner_key", (index) => index.eq("ownerKey", key)).unique(),
    ]);
    return {
      activeProfileId: settings?.activeProfileId ?? null,
      profiles: profiles.map((profile) => ({
        id: profile._id,
        game: profile.game,
        playerTag: `#${profile.playerTag}`,
        display: toPublicDisplay(profile.display),
        connectedAt: profile.connectedAt,
        updatedAt: profile.updatedAt,
        lastSyncedAt: profile.lastSyncedAt,
      })),
    };
  },
});

export const preview = action({
  args: { viewerId: v.string(), game: gameIdValidator, playerTag: v.string() },
  returns: summaryResultValidator,
  handler: async (ctx, args) => {
    const key = ownerKey(args.viewerId);
    const tag = publicTag(args.playerTag);
    await ctx.runMutation(internal.hub.internal.connectThrottle.checkAndRecord, { ownerKey: key });
    const adapter = getAdapter(args.game);
    const { result } = await readThrough(ctx, {
      game: args.game,
      playerTag: tag,
      resource: "summary",
      guard: isProfileSummary,
      load: () => adapter.connectProfile(tag),
    });
    return result;
  },
});

export const connect = action({
  args: { viewerId: v.string(), game: gameIdValidator, playerTag: v.string() },
  returns: v.object({
    profile: connectedProfileValidator,
    activeProfileId: profileIdValidator,
    summary: summaryResultValidator,
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    profile: Infer<typeof connectedProfileValidator>;
    activeProfileId: Infer<typeof profileIdValidator>;
    summary: AdapterResult<ProfileSummary>;
  }> => {
    const key = ownerKey(args.viewerId);
    const tag = publicTag(args.playerTag);
    await ctx.runMutation(internal.hub.internal.connectThrottle.checkAndRecord, { ownerKey: key });
    const adapter = getAdapter(args.game);
    const { result: summary } = await readThrough(ctx, {
      game: args.game,
      playerTag: tag,
      resource: "summary",
      guard: isProfileSummary,
      load: () => adapter.connectProfile(tag),
    });
    const saved = await ctx.runMutation(internal.hub.internal.profileWrites.upsert, {
      viewerId: args.viewerId,
      game: args.game,
      playerTag: tag,
      display: summary.data.display,
      syncedAt: summary.cache.fetchedAt,
      refreshAfter: summary.cache.expiresAt,
    });
    return { ...saved, summary };
  },
});

export const disconnect = mutation({
  args: { viewerId: v.string(), profileId: v.id("connectedProfiles") },
  returns: v.object({ removed: v.boolean(), activeProfileId: v.union(profileIdValidator, v.null()) }),
  handler: async (ctx, args) => {
    const key = ownerKey(args.viewerId);
    const settings = await ctx.db.query("viewerSettings").withIndex("by_owner_key", (index) => index.eq("ownerKey", key)).unique();
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.ownerKey !== key) {
      return { removed: false, activeProfileId: settings?.activeProfileId ?? null };
    }
    await ctx.db.delete(profile._id);
    if (profile.refreshTargetKey) {
      await unregisterConnectedProfile(ctx, profile.refreshTargetKey, Date.now());
    }
    let activeProfileId = settings?.activeProfileId ?? null;
    if (activeProfileId === profile._id) {
      const newest = await ctx.db
        .query("connectedProfiles")
        .withIndex("by_owner_key_and_connected_at", (index) => index.eq("ownerKey", key))
        .order("desc")
        .take(1);
      activeProfileId = newest[0]?._id ?? null;
    }
    if (settings) await ctx.db.patch(settings._id, { activeProfileId, updatedAt: Date.now() });
    return { removed: true, activeProfileId };
  },
});

export const setActive = mutation({
  args: { viewerId: v.string(), profileId: v.id("connectedProfiles") },
  returns: v.object({ activeProfileId: profileIdValidator }),
  handler: async (ctx, args) => {
    const key = ownerKey(args.viewerId);
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.ownerKey !== key) {
      throw new ConvexError({ code: "PROFILE_NOT_CONNECTED", message: "That profile is not connected to this browser." });
    }
    const now = Date.now();
    const settings = await ctx.db.query("viewerSettings").withIndex("by_owner_key", (index) => index.eq("ownerKey", key)).unique();
    if (settings) await ctx.db.patch(settings._id, { activeProfileId: profile._id, updatedAt: now });
    else await ctx.db.insert("viewerSettings", { ownerKey: key, activeProfileId: profile._id, createdAt: now, updatedAt: now });
    const refreshTargetKey = profile.refreshTargetKey ?? await registerConnectedProfile(
      ctx,
      { game: profile.game, entity: "player", tag: profile.playerTag },
      { now, nextDueAt: now },
    );
    await ctx.db.patch(profile._id, { refreshTargetKey, updatedAt: now });
    if (profile.refreshTargetKey) {
      await touchTarget(ctx, profile.refreshTargetKey, {
        now,
        notBefore: now,
        preserveEarlier: true,
      });
    }
    return { activeProfileId: profile._id };
  },
});
