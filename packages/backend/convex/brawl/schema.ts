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

export const pipelineRunState = v.union(
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
);

export const upstreamConsumer = v.union(
  v.literal("interactive"),
  v.literal("crawler"),
);

export const upstreamSource = v.union(
  v.literal("official"),
  v.literal("public_metadata"),
);

export const upstreamErrorCode = v.union(
  v.literal("invalid_tag"),
  v.literal("not_configured"),
  v.literal("unauthorized"),
  v.literal("not_found"),
  v.literal("rate_limited"),
  v.literal("upstream_rejected"),
  v.literal("unavailable"),
  v.literal("invalid_response"),
);

export const upstreamOutcome = v.union(
  v.literal("success"),
  v.literal("upstream_rejected"),
  v.literal("transport_failure"),
  v.literal("configuration_error"),
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
    .index("by_map_brawler_bucket", ["mapId", "brawlerId", "trophyBucket"])
    .index("by_brawler_and_bucket", ["brawlerId", "trophyBucket"])
    .index("by_trophy_bucket", ["trophyBucket"]),

  mapTeamStats: defineTable({
    mapId: v.number(),
    teamHash: v.string(),
    brawlerIds: v.array(v.number()),
    trophyBucket: v.string(),
    wins: v.number(),
    losses: v.number(),
    picks: v.number(),
  })
    .index("by_map_bucket_hash", ["mapId", "trophyBucket", "teamHash"])
    .index("by_trophy_bucket", ["trophyBucket"]),

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
  ]).index("by_brawler_and_bucket", ["brawlerId", "trophyBucket"]),

  dailyMapBrawlerStats: defineTable({
    day: v.number(),
    mapId: v.number(),
    brawlerId: v.number(),
    trophyBucket: v.string(),
    wins: v.number(),
    losses: v.number(),
    picks: v.number(),
    starPlayer: v.number(),
    firstBattleAt: v.number(),
    lastBattleAt: v.number(),
  })
    .index("by_map_brawler_bucket_and_day", ["mapId", "brawlerId", "trophyBucket", "day"])
    .index("by_bucket_and_day", ["trophyBucket", "day"])
    .index("by_brawler_bucket_and_day", ["brawlerId", "trophyBucket", "day"]),

  dailyBrawlerMatchups: defineTable({
    day: v.number(),
    mapId: v.number(),
    trophyBucket: v.string(),
    brawlerId: v.number(),
    opponentBrawlerId: v.number(),
    wins: v.number(),
    losses: v.number(),
    picks: v.number(),
    firstBattleAt: v.number(),
    lastBattleAt: v.number(),
  })
    .index("by_map_bucket_brawler_opponent_and_day", [
      "mapId",
      "trophyBucket",
      "brawlerId",
      "opponentBrawlerId",
      "day",
    ])
    .index("by_brawler_bucket_and_day", ["brawlerId", "trophyBucket", "day"]),

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
    leaseRunId: v.optional(v.id("brawlPipelineRuns")),
    leaseToken: v.optional(v.string()),
    leaseClaimedAt: v.optional(v.number()),
    leaseExpiresAt: v.optional(v.number()),
  })
    .index("by_tag", ["tag"])
    .index("by_due", ["disabled", "nextDueAt"]),

  brawlPipelineRuns: defineTable({
    job: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    ok: v.boolean(),
    state: v.optional(pipelineRunState),
    updatedAt: v.optional(v.number()),
    claimed: v.optional(v.number()),
    staleCompletions: v.optional(v.number()),
    discoveryRecordedAt: v.optional(v.number()),
    added: v.optional(v.number()),
    directorySightings: v.optional(v.number()),
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
    operation: v.optional(v.string()),
    consumer: v.optional(upstreamConsumer),
    outcome: v.optional(upstreamOutcome),
    source: v.optional(upstreamSource),
    durationMs: v.optional(v.number()),
    errorCode: v.optional(upstreamErrorCode),
    runId: v.optional(v.id("brawlPipelineRuns")),
  }).index("by_fetched_at", ["fetchedAt"]),
};
