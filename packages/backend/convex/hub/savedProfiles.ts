import { ConvexError, v } from "convex/values";
import { authComponent } from "../auth";
import { mutation, query } from "../_generated/server";
import { gameIdValidator } from "./schema";
import {
  registerConnectedProfile,
  unregisterConnectedProfile,
} from "./watchTargetModel";

const savedProfileInput = v.object({
  game: gameIdValidator,
  tag: v.string(),
  name: v.string(),
});

const savedProfileOutput = v.object({
  game: gameIdValidator,
  tag: v.string(),
  name: v.string(),
  updatedAt: v.number(),
});

function normalizeTag(value: string): string {
  const tag = value.trim().replace(/^#/, "").toUpperCase();
  if (!/^[0289PYLQGRJCUV]{3,24}$/.test(tag)) {
    throw new ConvexError("Invalid player tag");
  }
  return tag;
}

function normalizeName(value: string): string {
  const name = value.trim().slice(0, 48);
  if (!name) throw new ConvexError("Player name is required");
  return name;
}

export const accountState = query({
  args: {},
  returns: v.union(
    v.object({
      user: v.object({
        id: v.string(),
        name: v.string(),
        email: v.string(),
        image: v.union(v.string(), v.null()),
      }),
      profiles: v.array(savedProfileOutput),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return null;
    const profiles = await ctx.db
      .query("savedProfiles")
      .withIndex("by_owner_and_updated_at", (index) => index.eq("ownerId", user._id))
      .order("desc")
      .take(16);
    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
      },
      profiles: profiles.map((profile) => ({
        game: profile.game,
        tag: profile.playerTag,
        name: profile.name,
        updatedAt: profile.updatedAt,
      })),
    };
  },
});

export const mergeBrowserProfiles = mutation({
  args: { profiles: v.array(savedProfileInput) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new ConvexError({ code: "AUTH_REQUIRED", message: "Sign in to sync profiles." });
    const now = Date.now();
    for (const profile of args.profiles.slice(0, 16)) {
      const playerTag = normalizeTag(profile.tag);
      const name = normalizeName(profile.name);
      const existing = await ctx.db
        .query("savedProfiles")
        .withIndex("by_owner_game_and_tag", (index) => index
          .eq("ownerId", user._id)
          .eq("game", profile.game)
          .eq("playerTag", playerTag))
        .unique();
      if (existing) {
        const refreshTargetKey = existing.refreshTargetKey ?? await registerConnectedProfile(
          ctx,
          { game: profile.game, entity: "player", tag: playerTag },
          { now, nextDueAt: now },
        );
        if (existing.name !== name || existing.refreshTargetKey === undefined) {
          await ctx.db.patch(existing._id, { name, refreshTargetKey, updatedAt: now });
        }
      } else {
        const refreshTargetKey = await registerConnectedProfile(
          ctx,
          { game: profile.game, entity: "player", tag: playerTag },
          { now, nextDueAt: now },
        );
        await ctx.db.insert("savedProfiles", {
          ownerId: user._id,
          game: profile.game,
          playerTag,
          name,
          refreshTargetKey,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    return null;
  },
});

export const save = mutation({
  args: savedProfileInput,
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new ConvexError({ code: "AUTH_REQUIRED", message: "Sign in to save profiles." });
    const playerTag = normalizeTag(args.tag);
    const name = normalizeName(args.name);
    const now = Date.now();
    const existing = await ctx.db
      .query("savedProfiles")
      .withIndex("by_owner_game_and_tag", (index) => index
        .eq("ownerId", user._id)
        .eq("game", args.game)
        .eq("playerTag", playerTag))
      .unique();
    if (existing) {
      const refreshTargetKey = existing.refreshTargetKey ?? await registerConnectedProfile(
        ctx,
        { game: args.game, entity: "player", tag: playerTag },
        { now, nextDueAt: now },
      );
      await ctx.db.patch(existing._id, { name, refreshTargetKey, updatedAt: now });
    } else {
      const refreshTargetKey = await registerConnectedProfile(
        ctx,
        { game: args.game, entity: "player", tag: playerTag },
        { now, nextDueAt: now },
      );
      await ctx.db.insert("savedProfiles", {
        ownerId: user._id,
        game: args.game,
        playerTag,
        name,
        refreshTargetKey,
        createdAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const remove = mutation({
  args: { game: gameIdValidator, tag: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new ConvexError({ code: "AUTH_REQUIRED", message: "Sign in to manage profiles." });
    const profile = await ctx.db
      .query("savedProfiles")
      .withIndex("by_owner_game_and_tag", (index) => index
        .eq("ownerId", user._id)
        .eq("game", args.game)
        .eq("playerTag", normalizeTag(args.tag)))
      .unique();
    if (profile) {
      if (profile.refreshTargetKey) {
        await unregisterConnectedProfile(ctx, profile.refreshTargetKey, Date.now());
      }
      await ctx.db.delete(profile._id);
    }
    return null;
  },
});
