import { defineTable } from "convex/server";
import { v } from "convex/values";

export const gameIdValidator = v.union(
  v.literal("clash-royale"),
  v.literal("brawl-stars"),
);

export const accessTierValidator = v.union(
  v.literal("free"),
  v.literal("premium"),
);

export const entitlementStatusValidator = v.union(
  v.literal("active"),
  v.literal("grace_period"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("expired"),
);

export const watchEntityValidator = v.union(
  v.literal("player"),
  v.literal("club"),
);

export const watchDemandStatusValidator = v.union(
  v.literal("active"),
  v.literal("canceled"),
  v.literal("expired"),
);

export const refreshCadenceValidator = v.union(
  v.literal("active"),
  v.literal("warm"),
  v.literal("cold"),
);

export const watchTargetStatusValidator = v.union(
  v.literal("active"),
  v.literal("idle"),
  v.literal("paused"),
);

export const hubTables = {
  savedProfiles: defineTable({
    ownerId: v.string(),
    game: gameIdValidator,
    playerTag: v.string(),
    name: v.string(),
    refreshTargetKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_and_updated_at", ["ownerId", "updatedAt"])
    .index("by_owner_game_and_tag", ["ownerId", "game", "playerTag"])
    .index("by_game_and_player_tag", ["game", "playerTag"])
    .index("by_refresh_target_key", ["refreshTargetKey"]),

  connectThrottles: defineTable({
    ownerKey: v.string(),
    attempts: v.array(v.number()),
    updatedAt: v.number(),
  })
    .index("by_owner_key", ["ownerKey"])
    .index("by_updated_at", ["updatedAt"]),

  profileCache: defineTable({
    game: gameIdValidator,
    playerTag: v.string(),
    resource: v.union(v.literal("summary"), v.literal("stats")),
    payload: v.string(),
    schemaVersion: v.number(),
    source: v.union(
      v.literal("direct"),
      v.literal("service"),
      v.literal("stub"),
    ),
    fetchedAt: v.number(),
    expiresAt: v.number(),
    staleUntil: v.number(),
  })
    .index("by_game_and_player_tag_and_resource", [
      "game",
      "playerTag",
      "resource",
    ])
    .index("by_expires_at", ["expiresAt"])
    .index("by_stale_until", ["staleUntil"]),

  /**
   * Free access is derived when this row is absent or inactive. Only verified
   * auth subjects may own premium entitlements; browser viewer UUIDs never
   * appear in this table.
   */
  accountEntitlements: defineTable({
    subject: v.string(),
    plan: v.literal("premium"),
    status: entitlementStatusValidator,
    source: v.union(v.literal("billing"), v.literal("manual")),
    provider: v.optional(v.string()),
    providerCustomerRef: v.optional(v.string()),
    providerSubscriptionRef: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    canceledAt: v.optional(v.number()),
    lastEventAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subject", ["subject"])
    .index("by_provider_and_subscription_ref", [
      "provider",
      "providerSubscriptionRef",
    ]),

  /** Idempotency ledger for verified, provider-specific webhook adapters. */
  billingEventReceipts: defineTable({
    provider: v.string(),
    eventId: v.string(),
    subject: v.string(),
    occurredAt: v.number(),
    receivedAt: v.number(),
    applied: v.boolean(),
  }).index("by_provider_and_event_id", ["provider", "eventId"]),

  /** One subscriber's request to keep a player or club up to date. */
  watchDemands: defineTable({
    subject: v.string(),
    targetKey: v.string(),
    game: gameIdValidator,
    entity: watchEntityValidator,
    tag: v.string(),
    tier: v.literal("premium"),
    status: watchDemandStatusValidator,
    expiresAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subject_and_status", ["subject", "status"])
    .index("by_subject_and_game_and_entity_and_status", [
      "subject",
      "game",
      "entity",
      "status",
    ])
    .index("by_subject_and_target_key_and_status", [
      "subject",
      "targetKey",
      "status",
    ])
    .index("by_status_and_expires_at", ["status", "expiresAt"]),

  /**
   * One upstream polling target per game/entity/tag. Connected browsers and
   * premium subscribers share this row and therefore share upstream work.
   */
  watchTargets: defineTable({
    targetKey: v.string(),
    game: gameIdValidator,
    entity: watchEntityValidator,
    tag: v.string(),
    connectedProfileCount: v.number(),
    watcherCount: v.number(),
    tier: accessTierValidator,
    status: watchTargetStatusValidator,
    cadence: refreshCadenceValidator,
    nextDueAt: v.number(),
    lastActivityAt: v.number(),
    lastPolledAt: v.optional(v.number()),
    consecutiveFailures: v.number(),
    idleAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_target_key", ["targetKey"])
    .index("by_status_and_entity_and_next_due_at", [
      "status",
      "entity",
      "nextDueAt",
    ]),

  /** Atomic daily target-attempt reservations for the shared Hub refresher. */
  hubRefreshBudgets: defineTable({
    dayStartedAt: v.number(),
    reservedTargets: v.number(),
    updatedAt: v.number(),
  }).index("by_day_started_at", ["dayStartedAt"]),
};
