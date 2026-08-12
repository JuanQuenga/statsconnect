import { v } from "convex/values";
import { gameIdValidator } from "./schema";

export { gameIdValidator };

export const publicProfileDisplayValidator = v.object({
  name: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
  headline: v.union(v.object({ label: v.string(), value: v.number() }), v.null()),
  affiliation: v.union(
    v.object({ name: v.string(), tag: v.union(v.string(), v.null()) }),
    v.null(),
  ),
});

export const profileSummaryValidator = v.object({
  game: gameIdValidator,
  playerTag: v.string(),
  display: publicProfileDisplayValidator,
});

export const cacheMetadataValidator = v.object({
  state: v.union(
    v.literal("hit"),
    v.literal("refreshed"),
    v.literal("stale"),
    v.literal("stub"),
  ),
  fetchedAt: v.number(),
  expiresAt: v.number(),
});

export const summaryResultValidator = v.object({
  data: profileSummaryValidator,
  cache: cacheMetadataValidator,
});

export const metricValidator = v.object({
  key: v.string(),
  label: v.string(),
  value: v.number(),
  format: v.union(v.literal("integer"), v.literal("percent")),
});

export const profileItemValidator = v.object({
  kind: v.union(v.literal("card"), v.literal("brawler")),
  id: v.string(),
  name: v.string(),
  level: v.union(v.number(), v.null()),
  rank: v.union(v.number(), v.null()),
  score: v.union(v.number(), v.null()),
  bestScore: v.union(v.number(), v.null()),
  imageUrl: v.union(v.string(), v.null()),
});

export const recentMatchValidator = v.object({
  id: v.string(),
  occurredAt: v.union(v.number(), v.null()),
  mode: v.string(),
  map: v.union(v.string(), v.null()),
  result: v.union(
    v.literal("win"),
    v.literal("loss"),
    v.literal("draw"),
    v.literal("ranked"),
    v.literal("unknown"),
  ),
  rank: v.union(v.number(), v.null()),
  scoreDelta: v.union(v.number(), v.null()),
});

export const profileStatsValidator = v.object({
  game: gameIdValidator,
  playerTag: v.string(),
  summary: profileSummaryValidator,
  metrics: v.array(metricValidator),
  roster: v.array(profileItemValidator),
  currentLoadout: v.array(profileItemValidator),
  recentMatches: v.array(recentMatchValidator),
  upcoming: v.array(v.object({ index: v.number(), label: v.string() })),
  warnings: v.array(v.string()),
});

export const statsResultValidator = v.object({
  data: profileStatsValidator,
  cache: cacheMetadataValidator,
});

export const profileIdValidator = v.id("connectedProfiles");

export const connectedProfileValidator = v.object({
  id: profileIdValidator,
  game: gameIdValidator,
  playerTag: v.string(),
  display: publicProfileDisplayValidator,
  connectedAt: v.number(),
  updatedAt: v.number(),
  lastSyncedAt: v.number(),
});
