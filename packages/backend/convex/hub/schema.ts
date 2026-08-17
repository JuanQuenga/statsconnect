import { defineTable } from "convex/server";
import { v } from "convex/values";

export const gameIdValidator = v.union(
  v.literal("clash-royale"),
  v.literal("brawl-stars"),
);

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
    .index("by_owner_game_and_tag", ["ownerId", "game", "playerTag"])
    .index("by_game_and_player_tag", ["game", "playerTag"]),

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
