import { v } from "convex/values";
import { query } from "../_generated/server";
import {
  entitlementGrantsPremium,
  planLimits,
  statsConnectPlusOffer,
  type AccessTier,
} from "./accessModel";
import { verifiedSubjectOrNull } from "./auth";
import { entitlementStatusValidator } from "./schema";

const planLimitsValidator = v.object({
  connectedPlayersPerGame: v.number(),
  watchedPlayersPerGame: v.number(),
  watchedClubsPerGame: v.number(),
});

export const getAccess = query({
  args: {},
  returns: v.object({
    authenticated: v.boolean(),
    tier: v.union(v.literal("free"), v.literal("premium")),
    limits: planLimitsValidator,
    entitlement: v.union(
      v.object({
        status: entitlementStatusValidator,
        expiresAt: v.union(v.number(), v.null()),
        cancelAtPeriodEnd: v.boolean(),
      }),
      v.null(),
    ),
    offer: v.object({
      name: v.string(),
      scope: v.string(),
      availability: v.literal("foundation"),
      checkoutAvailable: v.boolean(),
      features: v.array(v.string()),
      notice: v.string(),
    }),
  }),
  handler: async (ctx) => {
    const subject = await verifiedSubjectOrNull(ctx);
    const entitlement = subject
      ? await ctx.db
          .query("accountEntitlements")
          .withIndex("by_subject", (index) => index.eq("subject", subject))
          .unique()
      : null;
    const tier: AccessTier = entitlementGrantsPremium(entitlement, Date.now())
      ? "premium"
      : "free";
    return {
      authenticated: subject !== null,
      tier,
      limits: planLimits[tier],
      entitlement: entitlement
        ? {
            status: entitlement.status,
            expiresAt: entitlement.expiresAt ?? null,
            cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
          }
        : null,
      offer: {
        ...statsConnectPlusOffer,
        features: [...statsConnectPlusOffer.features],
      },
    };
  },
});
