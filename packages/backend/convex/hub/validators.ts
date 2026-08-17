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
