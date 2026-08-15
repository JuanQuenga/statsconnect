import { defineTable } from "convex/server";
import { v } from "convex/values";

export const gameIdValidator = v.union(
  v.literal("clash-royale"),
  v.literal("brawl-stars"),
);

export const profileDisplayValidator = v.object({
  name: v.string(),
  avatarUrl: v.optional(v.string()),
  headline: v.optional(
    v.object({
      label: v.string(),
      value: v.number(),
    }),
  ),
  affiliation: v.optional(
    v.object({
      name: v.string(),
      tag: v.optional(v.string()),
    }),
  ),
});

export const hubTables = {
  savedProfiles: defineTable({
    ownerId: v.string(),
    game: gameIdValidator,
    playerTag: v.string(),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_and_updated_at", ["ownerId", "updatedAt"])
    .index("by_owner_game_and_tag", ["ownerId", "game", "playerTag"]),

  connectedProfiles: defineTable({
    ownerKey: v.string(),
    game: gameIdValidator,
    playerTag: v.string(),
    display: profileDisplayValidator,
    connectedAt: v.number(),
    updatedAt: v.number(),
    lastSyncedAt: v.number(),
  })
    .index("by_owner_key_and_game", ["ownerKey", "game"])
    .index("by_owner_key_and_connected_at", ["ownerKey", "connectedAt"])
    .index("by_game_and_player_tag", ["game", "playerTag"]),

  viewerSettings: defineTable({
    ownerKey: v.string(),
    activeProfileId: v.union(v.id("connectedProfiles"), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_key", ["ownerKey"]),

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
};
