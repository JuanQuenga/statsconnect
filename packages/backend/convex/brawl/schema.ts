import { defineTable } from "convex/server";
import { v } from "convex/values";

export const crawlSource = v.union(
  v.literal("ranking"),
  v.literal("club"),
  v.literal("lookup"),
  v.literal("manual"),
);

export const clubActivityType = v.union(
  v.literal("join"),
  v.literal("leave"),
  v.literal("role_change"),
  v.literal("trophy_change"),
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
  })
    .index("by_tag_and_day", ["tag", "day"])
    .index("by_recorded_at", ["recordedAt"]),

  brawlClubDirectory: defineTable({
    tag: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    badgeId: v.optional(v.number()),
    requiredTrophies: v.optional(v.number()),
    trophies: v.number(),
    memberCount: v.number(),
    trackedSinceAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_tag", ["tag"])
    .index("by_last_seen_at", ["lastSeenAt"]),

  brawlClubSnapshots: defineTable({
    tag: v.string(),
    day: v.number(),
    recordedAt: v.number(),
    name: v.string(),
    trophies: v.number(),
    memberCount: v.number(),
    requiredTrophies: v.optional(v.number()),
  })
    .index("by_tag_and_day", ["tag", "day"])
    .index("by_recorded_at", ["recordedAt"]),

  brawlClubMemberStates: defineTable({
    clubTag: v.string(),
    playerTag: v.string(),
    name: v.string(),
    role: v.string(),
    trophies: v.number(),
    iconId: v.optional(v.number()),
    active: v.boolean(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
  })
    .index("by_club_tag_and_player_tag", ["clubTag", "playerTag"])
    .index("by_club_tag_and_active", ["clubTag", "active"])
    .index("by_player_tag", ["playerTag"]),

  brawlClubMemberSnapshots: defineTable({
    dedupeKey: v.string(),
    clubTag: v.string(),
    playerTag: v.string(),
    recordedAt: v.number(),
    name: v.string(),
    role: v.string(),
    trophies: v.number(),
    iconId: v.optional(v.number()),
    present: v.boolean(),
  })
    .index("by_dedupe_key", ["dedupeKey"])
    .index("by_club_tag_and_recorded_at", ["clubTag", "recordedAt"])
    .index("by_player_tag_and_recorded_at", ["playerTag", "recordedAt"]),

  brawlClubActivityEvents: defineTable({
    dedupeKey: v.string(),
    clubTag: v.string(),
    playerTag: v.string(),
    playerName: v.string(),
    recordedAt: v.number(),
    type: clubActivityType,
    fromRole: v.optional(v.string()),
    toRole: v.optional(v.string()),
    fromTrophies: v.optional(v.number()),
    toTrophies: v.optional(v.number()),
    trophyDelta: v.optional(v.number()),
  })
    .index("by_dedupe_key", ["dedupeKey"])
    .index("by_club_tag_and_recorded_at", ["clubTag", "recordedAt"])
    .index("by_player_tag_and_recorded_at", ["playerTag", "recordedAt"])
    .index("by_type_and_recorded_at", ["type", "recordedAt"]),

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
