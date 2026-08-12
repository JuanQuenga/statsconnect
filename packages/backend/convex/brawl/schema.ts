import { defineTable } from "convex/server";
import { v } from "convex/values";

export const crawlSource = v.union(
  v.literal("ranking"),
  v.literal("club"),
  v.literal("lookup"),
  v.literal("manual"),
);

export const brawlTables = {
  brawlSeenBattles: defineTable({
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

  mapBrawlerMatchups: defineTable({
    mapId: v.number(),
    trophyBucket: v.string(),
    brawlerId: v.number(),
    opponentBrawlerId: v.number(),
    wins: v.number(),
    losses: v.number(),
    picks: v.number(),
  }).index("by_map_bucket_brawler_opponent", [
    "mapId",
    "trophyBucket",
    "brawlerId",
    "opponentBrawlerId",
  ]),

  brawlPlayerDirectory: defineTable({
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
    rankedCurrent: v.optional(v.number()),
    rankedCurrentName: v.optional(v.string()),
    rankedSeasonBest: v.optional(v.number()),
    rankedSeasonBestName: v.optional(v.string()),
    rankedBest: v.optional(v.number()),
    rankedBestName: v.optional(v.string()),
    brawlers: v.optional(v.array(v.object({
      id: v.number(),
      name: v.string(),
      power: v.number(),
      rank: v.number(),
      trophies: v.number(),
      highestTrophies: v.number(),
      gadgets: v.array(v.object({ id: v.number(), name: v.string() })),
      starPowers: v.array(v.object({ id: v.number(), name: v.string() })),
      gears: v.array(v.object({ id: v.number(), name: v.string() })),
      hypercharges: v.array(v.object({ id: v.number(), name: v.string() })),
    }))),
  })
    .index("by_tag_and_day", ["tag", "day"])
    .index("by_recorded_at", ["recordedAt"]),

  playerBattles: defineTable({
    playerTag: v.string(),
    dedupeKey: v.string(),
    battleTime: v.string(),
    battleTimestamp: v.number(),
    ingestedAt: v.number(),
    mapId: v.optional(v.number()),
    mapName: v.optional(v.string()),
    mode: v.string(),
    battleType: v.optional(v.string()),
    result: v.union(v.literal("victory"), v.literal("defeat"), v.literal("draw"), v.literal("unknown")),
    rank: v.optional(v.number()),
    trophyChange: v.optional(v.number()),
    brawlerId: v.optional(v.number()),
    brawlerName: v.optional(v.string()),
    brawlerPower: v.optional(v.number()),
    brawlerTrophies: v.optional(v.number()),
    starPlayer: v.boolean(),
  })
    .index("by_player_and_dedupe", ["playerTag", "dedupeKey"])
    .index("by_player_and_battle_time", ["playerTag", "battleTimestamp"])
    .index("by_ingested_at", ["ingestedAt"]),

  ingestCursors: defineTable({
    key: v.string(),
    offset: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  brawlCrawlTargets: defineTable({
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

  brawlPipelineRuns: defineTable({
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

  brawlPipelineCounters: defineTable({
    name: v.string(),
    value: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  brawlApiFetchLogs: defineTable({
    endpoint: v.string(),
    status: v.number(),
    ok: v.boolean(),
    fetchedAt: v.number(),
  }).index("by_fetched_at", ["fetchedAt"]),
};
