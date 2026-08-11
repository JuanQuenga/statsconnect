import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const crawlSource = v.union(
  v.literal("ranking"),
  v.literal("club"),
  v.literal("lookup"),
  v.literal("manual"),
);

export default defineSchema({
  seenBattles: defineTable({
    dedupeKey: v.string(),
    mapId: v.number(),
    mode: v.string(),
    battleType: v.optional(v.string()),
    result: v.optional(v.string()),
    trophyBucket: v.string(),
    brawlerIds: v.array(v.number()),
    starBrawlerId: v.optional(v.number()),
    battleTime: v.string(),
    ingestedAt: v.number(),
  })
    .index("by_dedupe", ["dedupeKey"])
    .index("by_map", ["mapId"])
    .index("by_ingested_at", ["ingestedAt"]),

  mapBrawlerStats: defineTable({
    mapId: v.number(),
    brawlerId: v.number(),
    trophyBucket: v.string(),
    wins: v.number(),
    losses: v.number(),
    picks: v.number(),
    starPlayer: v.number(),
  })
    .index("by_map_bucket", ["mapId", "trophyBucket"])
    .index("by_map_brawler_bucket", ["mapId", "brawlerId", "trophyBucket"]),

  mapTeamStats: defineTable({
    mapId: v.number(),
    teamHash: v.string(),
    brawlerIds: v.array(v.number()),
    trophyBucket: v.string(),
    wins: v.number(),
    losses: v.number(),
    picks: v.number(),
  }).index("by_map_bucket_hash", ["mapId", "trophyBucket", "teamHash"]),

  playerDirectory: defineTable({
    tag: v.string(),
    name: v.string(),
    nameLower: v.string(),
    clubTag: v.optional(v.string()),
    clubName: v.optional(v.string()),
    trophies: v.optional(v.number()),
    iconId: v.optional(v.number()),
    sightings: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tag", ["tag"])
    .index("by_name_lower", ["nameLower"])
    .index("by_updated_at", ["updatedAt"])
    .searchIndex("search_name", { searchField: "name" }),

  playerSnapshots: defineTable({
    tag: v.string(),
    day: v.number(),
    recordedAt: v.number(),
    name: v.string(),
    trophies: v.number(),
    highestTrophies: v.number(),
    expLevel: v.number(),
    victory3v3: v.number(),
    soloVictories: v.number(),
    duoVictories: v.number(),
    clubTag: v.optional(v.string()),
    clubName: v.optional(v.string()),
    iconId: v.optional(v.number()),
    brawlerCount: v.number(),
    power11Count: v.number(),
  })
    .index("by_tag_and_day", ["tag", "day"])
    .index("by_recorded_at", ["recordedAt"]),

  ingestCursors: defineTable({
    key: v.string(),
    offset: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  crawlTargets: defineTable({
    tag: v.string(),
    source: crawlSource,
    priority: v.number(),
    nextDueAt: v.number(),
    lastFetchedAt: v.optional(v.number()),
    lastBattleTime: v.optional(v.string()),
    consecutiveFailures: v.number(),
    disabled: v.boolean(),
  })
    .index("by_tag", ["tag"])
    .index("by_due", ["disabled", "nextDueAt"]),

  pipelineRuns: defineTable({
    job: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    ok: v.boolean(),
    note: v.optional(v.string()),
    discovered: v.optional(v.number()),
    fetched: v.optional(v.number()),
    battles: v.optional(v.number()),
    failures: v.optional(v.number()),
  }).index("by_started_at", ["startedAt"]),

  pipelineCounters: defineTable({
    name: v.string(),
    value: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  apiFetchLogs: defineTable({
    endpoint: v.string(),
    status: v.number(),
    ok: v.boolean(),
    fetchedAt: v.number(),
  }).index("by_fetched_at", ["fetchedAt"]),
});
