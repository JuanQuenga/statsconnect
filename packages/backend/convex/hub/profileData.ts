import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { isProfileStats, isProfileSummary } from "./adapters/guards";
import type { AdapterResult, ProfileStats, ProfileSummary } from "./adapters/types";
import { getAdapter } from "./adapters/registry";
import { readThrough } from "./cacheAccess";
import { statsResultValidator, summaryResultValidator } from "./validators";

export const getSummary = action({
  args: { viewerId: v.string(), profileId: v.id("connectedProfiles") },
  returns: summaryResultValidator,
  handler: async (ctx, args): Promise<AdapterResult<ProfileSummary>> => {
    const profile = await ctx.runQuery(internal.hub.internal.profileWrites.getOwned, args);
    if (!profile) {
      throw new ConvexError({ code: "PROFILE_NOT_CONNECTED", message: "That profile is not connected to this browser." });
    }
    const adapter = getAdapter(profile.game);
    const { result, synced } = await readThrough(ctx, {
      game: profile.game,
      playerTag: profile.playerTag,
      resource: "summary",
      guard: isProfileSummary,
      load: () => adapter.getProfileSummary(profile.playerTag),
    });
    if (synced) {
      await ctx.runMutation(internal.hub.internal.profileWrites.refreshSnapshot, {
        profileId: profile.id,
        ownerKey: profile.ownerKey,
        display: result.data.display,
        syncedAt: result.cache.fetchedAt,
      });
    } else {
      await ctx.runMutation(internal.hub.internal.profileWrites.touch, {
        profileId: profile.id,
        ownerKey: profile.ownerKey,
      });
    }
    return result;
  },
});

export const getStats = action({
  args: { viewerId: v.string(), profileId: v.id("connectedProfiles") },
  returns: statsResultValidator,
  handler: async (ctx, args): Promise<AdapterResult<ProfileStats>> => {
    const profile = await ctx.runQuery(internal.hub.internal.profileWrites.getOwned, args);
    if (!profile) {
      throw new ConvexError({ code: "PROFILE_NOT_CONNECTED", message: "That profile is not connected to this browser." });
    }
    const adapter = getAdapter(profile.game);
    const { result, synced } = await readThrough(ctx, {
      game: profile.game,
      playerTag: profile.playerTag,
      resource: "stats",
      guard: isProfileStats,
      load: () => adapter.getStats(profile.playerTag),
    });
    if (synced) {
      await ctx.runMutation(internal.hub.internal.profileWrites.refreshSnapshot, {
        profileId: profile.id,
        ownerKey: profile.ownerKey,
        display: result.data.summary.display,
        syncedAt: result.cache.fetchedAt,
      });
    } else {
      await ctx.runMutation(internal.hub.internal.profileWrites.touch, {
        profileId: profile.id,
        ownerKey: profile.ownerKey,
      });
    }
    return result;
  },
});
