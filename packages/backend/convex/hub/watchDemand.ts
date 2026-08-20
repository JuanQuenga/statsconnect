import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { entitlementGrantsPremium, planLimits } from "./accessModel";
import { AdapterError } from "./adapters/types";
import { normalizeTag } from "./adapters/tags";
import { requireVerifiedSubject, verifiedSubjectOrNull } from "./auth";
import {
  gameIdValidator,
  watchDemandStatusValidator,
  watchEntityValidator,
} from "./schema";
import {
  registerWatcher,
  unregisterWatcher,
  watchTargetKey,
} from "./watchTargetModel";

const publicDemandValidator = v.object({
  id: v.id("watchDemands"),
  game: gameIdValidator,
  entity: watchEntityValidator,
  tag: v.string(),
  tier: v.literal("premium"),
  status: watchDemandStatusValidator,
  expiresAt: v.union(v.number(), v.null()),
  canceledAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

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

function toPublicDemand(demand: Doc<"watchDemands">) {
  return {
    id: demand._id,
    game: demand.game,
    entity: demand.entity,
    tag: `#${demand.tag}`,
    tier: demand.tier,
    status: demand.status,
    expiresAt: demand.expiresAt ?? null,
    canceledAt: demand.canceledAt ?? null,
    createdAt: demand.createdAt,
    updatedAt: demand.updatedAt,
  };
}

export const listMine = query({
  args: {},
  returns: v.object({
    authenticated: v.boolean(),
    demands: v.array(publicDemandValidator),
  }),
  handler: async (ctx) => {
    const subject = await verifiedSubjectOrNull(ctx);
    if (!subject) return { authenticated: false, demands: [] };
    const demands = await ctx.db
      .query("watchDemands")
      .withIndex("by_subject_and_status", (index) =>
        index.eq("subject", subject).eq("status", "active"),
      )
      .take(20);
    return { authenticated: true, demands: demands.map(toPublicDemand) };
  },
});

export const request = mutation({
  args: {
    game: gameIdValidator,
    entity: watchEntityValidator,
    tag: v.string(),
  },
  returns: publicDemandValidator,
  handler: async (ctx, args) => {
    const subject = await requireVerifiedSubject(ctx);
    const entitlement = await ctx.db
      .query("accountEntitlements")
      .withIndex("by_subject", (index) => index.eq("subject", subject))
      .unique();
    if (!entitlementGrantsPremium(entitlement, Date.now())) {
      throw new ConvexError({
        code: "PREMIUM_REQUIRED",
        message: "Watching players and clubs requires an active StatsConnect+ entitlement.",
      });
    }

    const tag = publicTag(args.tag);
    const targetKey = watchTargetKey(args.game, args.entity, tag);
    const existing = await ctx.db
      .query("watchDemands")
      .withIndex("by_subject_and_target_key_and_status", (index) =>
        index
          .eq("subject", subject)
          .eq("targetKey", targetKey)
          .eq("status", "active"),
      )
      .unique();
    if (existing) return toPublicDemand(existing);

    const limit =
      args.entity === "player"
        ? planLimits.premium.watchedPlayersPerGame
        : planLimits.premium.watchedClubsPerGame;
    const used = await ctx.db
      .query("watchDemands")
      .withIndex("by_subject_and_game_and_entity_and_status", (index) =>
        index
          .eq("subject", subject)
          .eq("game", args.game)
          .eq("entity", args.entity)
          .eq("status", "active"),
      )
      .take(limit);
    if (used.length >= limit) {
      throw new ConvexError({
        code: "WATCH_LIMIT_REACHED",
        message: `StatsConnect+ supports up to ${limit} ${args.entity}${limit === 1 ? "" : "s"} per game.`,
      });
    }

    const now = Date.now();
    await registerWatcher(ctx, { game: args.game, entity: args.entity, tag }, now);
    const id = await ctx.db.insert("watchDemands", {
      subject,
      targetKey,
      game: args.game,
      entity: args.entity,
      tag,
      tier: "premium",
      status: "active",
      ...(entitlement?.expiresAt === undefined
        ? {}
        : { expiresAt: entitlement.expiresAt }),
      createdAt: now,
      updatedAt: now,
    });
    const demand = await ctx.db.get(id);
    if (!demand) throw new Error("Watch demand was not persisted.");
    return toPublicDemand(demand);
  },
});

export const cancel = mutation({
  args: { demandId: v.id("watchDemands") },
  returns: v.object({ canceled: v.boolean() }),
  handler: async (ctx, args) => {
    const subject = await requireVerifiedSubject(ctx);
    const demand = await ctx.db.get(args.demandId);
    if (!demand || demand.subject !== subject || demand.status !== "active") {
      return { canceled: false };
    }
    const now = Date.now();
    await ctx.db.patch(demand._id, {
      status: "canceled",
      canceledAt: now,
      updatedAt: now,
    });
    await unregisterWatcher(ctx, demand.targetKey, now);
    return { canceled: true };
  },
});
