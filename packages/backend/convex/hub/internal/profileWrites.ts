import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalMutation, internalQuery } from "../../_generated/server";
import { ownerKey, toStoredDisplay } from "../model";
import { connectedProfileValidator, gameIdValidator, profileIdValidator, publicProfileDisplayValidator } from "../validators";
import {
  registerConnectedProfile,
  touchTarget,
  unregisterConnectedProfile,
  watchTargetKey,
} from "../watchTargetModel";

export const getOwned = internalQuery({
  args: { viewerId: v.string(), profileId: v.id("connectedProfiles") },
  returns: v.union(
    v.object({
      id: v.id("connectedProfiles"),
      ownerKey: v.string(),
      game: gameIdValidator,
      playerTag: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.ownerKey !== ownerKey(args.viewerId)) return null;
    return { id: profile._id, ownerKey: profile.ownerKey, game: profile.game, playerTag: profile.playerTag };
  },
});

export const upsert = internalMutation({
  args: {
    viewerId: v.string(),
    game: gameIdValidator,
    playerTag: v.string(),
    display: publicProfileDisplayValidator,
    syncedAt: v.number(),
    refreshAfter: v.number(),
  },
  returns: v.object({ profile: connectedProfileValidator, activeProfileId: profileIdValidator }),
  handler: async (ctx, args) => {
    const key = ownerKey(args.viewerId);
    const now = Date.now();
    const existing = await ctx.db
      .query("connectedProfiles")
      .withIndex("by_owner_key_and_game", (query) => query.eq("ownerKey", key).eq("game", args.game))
      .unique();
    const display = toStoredDisplay(args.display);
    const nextTargetKey = watchTargetKey(args.game, "player", args.playerTag);
    let id: Id<"connectedProfiles">;
    let connectedAt = now;
    if (existing) {
      if (existing.refreshTargetKey !== nextTargetKey) {
        if (existing.refreshTargetKey) {
          await unregisterConnectedProfile(ctx, existing.refreshTargetKey, now);
        }
        await registerConnectedProfile(
          ctx,
          { game: args.game, entity: "player", tag: args.playerTag },
          { now, nextDueAt: args.refreshAfter },
        );
      } else {
        await touchTarget(ctx, nextTargetKey, {
          now,
          notBefore: args.refreshAfter,
        });
      }
      connectedAt = existing.playerTag === args.playerTag ? existing.connectedAt : now;
      await ctx.db.patch(existing._id, {
        playerTag: args.playerTag,
        refreshTargetKey: nextTargetKey,
        display,
        connectedAt,
        updatedAt: now,
        lastSyncedAt: args.syncedAt,
      });
      id = existing._id;
    } else {
      await registerConnectedProfile(
        ctx,
        { game: args.game, entity: "player", tag: args.playerTag },
        { now, nextDueAt: args.refreshAfter },
      );
      id = await ctx.db.insert("connectedProfiles", {
        ownerKey: key,
        game: args.game,
        playerTag: args.playerTag,
        refreshTargetKey: nextTargetKey,
        display,
        connectedAt,
        updatedAt: now,
        lastSyncedAt: args.syncedAt,
      });
    }
    const settings = await ctx.db.query("viewerSettings").withIndex("by_owner_key", (query) => query.eq("ownerKey", key)).unique();
    if (settings) await ctx.db.patch(settings._id, { activeProfileId: id, updatedAt: now });
    else await ctx.db.insert("viewerSettings", { ownerKey: key, activeProfileId: id, createdAt: now, updatedAt: now });
    return {
      profile: {
        id,
        game: args.game,
        playerTag: `#${args.playerTag}`,
        display: args.display,
        connectedAt,
        updatedAt: now,
        lastSyncedAt: args.syncedAt,
      },
      activeProfileId: id,
    };
  },
});

export const refreshSnapshot = internalMutation({
  args: {
    profileId: v.id("connectedProfiles"),
    ownerKey: v.string(),
    display: publicProfileDisplayValidator,
    syncedAt: v.number(),
    refreshAfter: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (profile && profile.ownerKey === args.ownerKey) {
      const now = Date.now();
      const refreshTargetKey = profile.refreshTargetKey ?? await registerConnectedProfile(
        ctx,
        { game: profile.game, entity: "player", tag: profile.playerTag },
        { now, nextDueAt: args.refreshAfter },
      );
      await ctx.db.patch(profile._id, {
        refreshTargetKey,
        display: toStoredDisplay(args.display),
        updatedAt: now,
        lastSyncedAt: args.syncedAt,
      });
      if (profile.refreshTargetKey) {
        await touchTarget(ctx, profile.refreshTargetKey, {
          now,
          notBefore: args.refreshAfter,
        });
      }
    }
    return null;
  },
});

export const touch = internalMutation({
  args: {
    profileId: v.id("connectedProfiles"),
    ownerKey: v.string(),
    refreshAfter: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (profile && profile.ownerKey === args.ownerKey) {
      const now = Date.now();
      const refreshTargetKey = profile.refreshTargetKey ?? await registerConnectedProfile(
        ctx,
        { game: profile.game, entity: "player", tag: profile.playerTag },
        { now, nextDueAt: args.refreshAfter },
      );
      await ctx.db.patch(profile._id, { refreshTargetKey, updatedAt: now });
      if (profile.refreshTargetKey) {
        await touchTarget(ctx, profile.refreshTargetKey, {
          now,
          notBefore: args.refreshAfter,
        });
      }
    }
    return null;
  },
});
