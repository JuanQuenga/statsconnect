import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { entitlementStatusValidator } from "../schema";
import { unregisterWatcher } from "../watchTargetModel";

const MAX_ACCOUNT_WATCHES = 100;

/**
 * The future HTTP/provider adapter must verify its webhook signature before it
 * calls this normalized, idempotent mutation.
 */
export const applyBillingUpdate = internalMutation({
  args: {
    provider: v.string(),
    eventId: v.string(),
    occurredAt: v.number(),
    subject: v.string(),
    customerRef: v.optional(v.string()),
    subscriptionRef: v.optional(v.string()),
    status: entitlementStatusValidator,
    expiresAt: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    canceledAt: v.optional(v.number()),
  },
  returns: v.object({ duplicate: v.boolean(), applied: v.boolean() }),
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("billingEventReceipts")
      .withIndex("by_provider_and_event_id", (index) =>
        index.eq("provider", args.provider).eq("eventId", args.eventId),
      )
      .unique();
    if (duplicate) return { duplicate: true, applied: duplicate.applied };

    const now = Date.now();
    const existing = await ctx.db
      .query("accountEntitlements")
      .withIndex("by_subject", (index) => index.eq("subject", args.subject))
      .unique();
    const applied = !existing || args.occurredAt >= existing.lastEventAt;

    if (applied) {
      const entitlement = {
        subject: args.subject,
        plan: "premium" as const,
        status: args.status,
        source: "billing" as const,
        provider: args.provider,
        ...(args.customerRef === undefined
          ? {}
          : { providerCustomerRef: args.customerRef }),
        ...(args.subscriptionRef === undefined
          ? {}
          : { providerSubscriptionRef: args.subscriptionRef }),
        ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        ...(args.canceledAt === undefined ? {} : { canceledAt: args.canceledAt }),
        lastEventAt: args.occurredAt,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      if (existing) await ctx.db.replace(existing._id, entitlement);
      else await ctx.db.insert("accountEntitlements", entitlement);

      const stillPremium =
        (args.status === "active" || args.status === "grace_period") &&
        (args.expiresAt === undefined || args.expiresAt > now);
      const activeDemands = await ctx.db
        .query("watchDemands")
        .withIndex("by_subject_and_status", (index) =>
          index.eq("subject", args.subject).eq("status", "active"),
        )
        .take(MAX_ACCOUNT_WATCHES);
      if (stillPremium) {
        for (const demand of activeDemands) {
          await ctx.db.patch(demand._id, {
            expiresAt: args.expiresAt,
            updatedAt: now,
          });
        }
      } else if (!stillPremium) {
        for (const demand of activeDemands) {
          await ctx.db.patch(demand._id, {
            status: args.status === "expired" ? "expired" : "canceled",
            ...(args.status === "expired" ? {} : { canceledAt: now }),
            updatedAt: now,
          });
          await unregisterWatcher(ctx, demand.targetKey, now);
        }
      }
    }

    await ctx.db.insert("billingEventReceipts", {
      provider: args.provider,
      eventId: args.eventId,
      subject: args.subject,
      occurredAt: args.occurredAt,
      receivedAt: now,
      applied,
    });
    return { duplicate: false, applied };
  },
});
