import { defineTable } from "convex/server";
import { v } from "convex/values";

export const cacheKind = v.union(
  v.literal("player"),
  v.literal("battles"),
  v.literal("chests"),
  v.literal("clan"),
  v.literal("cards"),
  v.literal("war"),
  v.literal("locations"),
  v.literal("rankings"),
  v.literal("leaderboards"),
  v.literal("leaderboard"),
  v.literal("clanSearch"),
  v.literal("tournaments"),
  v.literal("news")
);

/** Mirrors META_MODES in src/lib/clash/battles.ts. */
export const metaMode = v.union(
  v.literal("ladder"),
  v.literal("pathOfLegends"),
  v.literal("challenge"),
  v.literal("tournament"),
  v.literal("clanWar")
);

export const crawlSource = v.union(
  v.literal("ladder"),
  v.literal("pathOfLegends"),
  /** An event or season board from /leaderboards. */
  v.literal("leaderboard"),
  v.literal("clan"),
  v.literal("manual")
);

export const crawlTier = v.union(
  /** Small, durable sample used to keep the public meta pages useful. */
  v.literal("fixed"),
  /** Recently ranked players, refreshed more often than broad discovery. */
  v.literal("featured"),
  /** Short-lived players discovered through clan rosters. */
  v.literal("community")
);

export const clanEventKind = v.union(
  v.literal("joined"),
  v.literal("left"),
  v.literal("roleChanged"),
  v.literal("becameInactive"),
  v.literal("warDecksMissed")
);

export const clashTables = {
  apiCache: defineTable({
    key: v.string(),
    kind: cacheKind,
    payload: v.string(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
    sourceVersion: v.string()
  })
    .index("by_key", ["key"])
    .index("by_expires_at", ["expiresAt"]),

  profileHistory: defineTable({
    kind: v.union(v.literal("player"), v.literal("clan")),
    tag: v.string(),
    name: v.string(),
    value: v.number(),
    recordedAt: v.number()
  }).index("by_profile", ["kind", "tag", "recordedAt"]),

  /**
   * Meaningful player-profile changes observed by ClashCrown. This intentionally
   * stores compact summaries instead of entire API payloads or card collections.
   */
  clashPlayerSnapshots: defineTable({
    tag: v.string(),
    name: v.string(),
    source: v.union(v.literal("api_profile"), v.literal("battle_log"), v.literal("legacy_trophy")),
    fingerprint: v.string(),
    observedAt: v.number(),
    /** Last API observation that returned the same meaningful state. */
    lastObservedAt: v.number(),
    retentionAt: v.number(),
    trophies: v.optional(v.number()),
    bestTrophies: v.optional(v.number()),
    expLevel: v.optional(v.number()),
    arenaId: v.optional(v.number()),
    arenaName: v.optional(v.string()),
    clanTag: v.optional(v.string()),
    clanName: v.optional(v.string()),
    currentDeck: v.optional(v.array(v.object({
      id: v.number(),
      level: v.optional(v.number()),
      evolutionLevel: v.optional(v.number())
    }))),
    collection: v.optional(v.object({
      cardsOwned: v.number(),
      totalLevels: v.number(),
      maxedCards: v.number(),
      evolvedCards: v.number(),
      starLevels: v.number()
    })),
    totals: v.optional(v.object({
      wins: v.optional(v.number()),
      losses: v.optional(v.number()),
      battleCount: v.optional(v.number()),
      threeCrownWins: v.optional(v.number()),
      challengeCardsWon: v.optional(v.number()),
      tournamentCardsWon: v.optional(v.number()),
      donations: v.optional(v.number()),
      donationsReceived: v.optional(v.number()),
      totalDonations: v.optional(v.number()),
      warDayWins: v.optional(v.number()),
      clanCardsCollected: v.optional(v.number())
    })),
    path: v.optional(v.object({
      current: v.optional(v.object({ trophies: v.optional(v.number()), bestTrophies: v.optional(v.number()), rank: v.optional(v.union(v.number(), v.null())) })),
      last: v.optional(v.object({ trophies: v.optional(v.number()), bestTrophies: v.optional(v.number()), rank: v.optional(v.union(v.number(), v.null())) })),
      best: v.optional(v.object({ trophies: v.optional(v.number()), bestTrophies: v.optional(v.number()), rank: v.optional(v.union(v.number(), v.null())) }))
    })),
    legacyHistoryId: v.optional(v.id("profileHistory"))
  })
    .index("by_tag_and_observed_at", ["tag", "observedAt"])
    .index("by_tag_and_source_and_observed_at", ["tag", "source", "observedAt"])
    .index("by_retention_at", ["retentionAt"])
    .index("by_legacy_history_id", ["legacyHistoryId"]),

  /** Stable catalog for API event boards and location-scoped ranking boards. */
  clashLeaderboardBoards: defineTable({
    key: v.string(),
    kind: v.union(v.literal("event"), v.literal("players"), v.literal("clans"), v.literal("clanwars")),
    name: v.string(),
    boardId: v.optional(v.number()),
    locationId: v.optional(v.number()),
    firstObservedAt: v.number(),
    lastObservedAt: v.number(),
    snapshotCount: v.number()
  })
    .index("by_key", ["key"])
    .index("by_last_observed_at", ["lastObservedAt"]),

  /** Snapshot metadata is separate from entries to stay well below 1 MiB. */
  clashLeaderboardSnapshots: defineTable({
    boardKey: v.string(),
    fingerprint: v.string(),
    observedAt: v.number(),
    lastObservedAt: v.number(),
    entryCount: v.number(),
    /** First observation per API board is retained; later changes roll off. */
    baseline: v.boolean(),
    retentionAt: v.number()
  })
    .index("by_board_key_and_observed_at", ["boardKey", "observedAt"])
    .index("by_retention_at", ["retentionAt"]),

  clashLeaderboardEntries: defineTable({
    snapshotId: v.id("clashLeaderboardSnapshots"),
    boardKey: v.string(),
    observedAt: v.number(),
    rank: v.number(),
    tag: v.string(),
    name: v.string(),
    score: v.optional(v.number()),
    trophies: v.optional(v.number()),
    clanTag: v.optional(v.string()),
    clanName: v.optional(v.string())
  })
    .index("by_snapshot_id_and_rank", ["snapshotId", "rank"])
    .index("by_tag_and_observed_at", ["tag", "observedAt"]),

  clashApiFetchLogs: defineTable({
    endpoint: v.string(),
    status: v.number(),
    ok: v.boolean(),
    fetchedAt: v.number()
  }).index("by_fetched_at", ["fetchedAt"]),

  /** Five-minute fetch aggregates replace the legacy row-per-request log above. */
  clashApiFetchTelemetry: defineTable({
    bucketStart: v.number(),
    endpoint: v.string(),
    statusClass: v.string(),
    requests: v.number(),
    failures: v.number(),
    lastFetchedAt: v.number()
  })
    .index("by_bucket_start", ["bucketStart"])
    .index("by_bucket_and_endpoint_and_status", ["bucketStart", "endpoint", "statusClass"]),

  /** Atomic daily reservations make crawler request budgets hard, not advisory. */
  clashCrawlerBudgets: defineTable({
    day: v.number(),
    job: v.union(v.literal("discover"), v.literal("crawl"), v.literal("clanWatch")),
    reserved: v.number(),
    updatedAt: v.number()
  })
    .index("by_day_and_job", ["day", "job"])
    .index("by_day", ["day"]),

  // --- Battle-log collection pipeline -------------------------------------
  // The official API only exposes battles per player, so deck statistics have
  // to be built by polling many players' battle logs over time.

  /** Player tags the crawler polls, leased through `nextDueAt`. */
  clashCrawlTargets: defineTable({
    tag: v.string(),
    source: crawlSource,
    /** Lower crawls sooner; derived from ladder rank so the top of the ladder stays fresh. */
    priority: v.number(),
    nextDueAt: v.number(),
    lastFetchedAt: v.optional(v.number()),
    /** Newest battle already ingested for this tag, used to skip unchanged logs. */
    lastBattleTime: v.optional(v.number()),
    consecutiveFailures: v.number(),
    disabled: v.boolean(),
    /** Optional while populated rows are migrated by the next discovery pass. */
    tier: v.optional(crawlTier),
    revisitSeconds: v.optional(v.number()),
    lastDiscoveredAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    leaseUntil: v.optional(v.number())
  })
    .index("by_tag", ["tag"])
    .index("by_due", ["disabled", "nextDueAt"])
    .index("by_disabled_and_tier_and_next_due_at", ["disabled", "tier", "nextDueAt"])
    .index("by_expires_at", ["expiresAt"]),

  /**
   * Dedup ledger. A battle appears in both participants' logs, so we key on the
   * battle rather than on one player's view of it. Pruned once battles age out
   * of the API's own 25-battle window.
   */
  clashSeenBattles: defineTable({
    fingerprint: v.string(),
    battleTime: v.number()
  })
    .index("by_fingerprint", ["fingerprint"])
    .index("by_battle_time", ["battleTime"]),

  /** Per-day deck aggregates, incremented at ingest so nothing has to be rescanned. */
  deckStats: defineTable({
    day: v.number(),
    mode: metaMode,
    deckHash: v.string(),
    cardIds: v.array(v.number()),
    evolutionIds: v.array(v.number()),
    uses: v.number(),
    wins: v.number(),
    crowns: v.number(),
    /** Optional because existing aggregates predate trophy/arena capture. */
    trophySum: v.optional(v.number()),
    trophySamples: v.optional(v.number()),
    arenaIds: v.optional(v.array(v.number())),
    arenaNames: v.optional(v.array(v.string()))
  })
    .index("by_day_and_mode_and_deck", ["day", "mode", "deckHash"])
    .index("by_day_and_mode", ["day", "mode"])
    .index("by_day", ["day"]),

  /** Per-day ordered deck-vs-deck aggregates, from deckHash's perspective. */
  matchupStats: defineTable({
    day: v.number(),
    /** Optional only for rows collected before mode-aware matchup analytics shipped. */
    mode: v.optional(metaMode),
    deckHash: v.string(),
    oppDeckHash: v.string(),
    cardIds: v.array(v.number()),
    oppCardIds: v.array(v.number()),
    uses: v.number(),
    wins: v.number()
  })
    .index("by_day_and_deck_hash_and_opp_deck_hash", ["day", "deckHash", "oppDeckHash"])
    .index("by_day_and_deck_hash", ["day", "deckHash"])
    .index("by_day_and_mode_and_deck_hash_and_opp_deck_hash", ["day", "mode", "deckHash", "oppDeckHash"])
    .index("by_day_and_mode", ["day", "mode"])
    .index("by_day", ["day"]),

  /** Per-day card aggregates. Small enough to sum directly in a query. */
  cardStats: defineTable({
    day: v.number(),
    mode: metaMode,
    cardId: v.number(),
    uses: v.number(),
    wins: v.number()
  })
    .index("by_day_and_mode_and_card", ["day", "mode", "cardId"])
    .index("by_day", ["day"]),

  /**
   * Per-day Tower Troop aggregates. Mirrors cardStats exactly, but keyed on
   * the Tower Troop a side brought to the battle instead of one of the eight
   * deck cards — there is exactly one per observation, not eight.
   */
  towerStats: defineTable({
    day: v.number(),
    mode: metaMode,
    towerCardId: v.number(),
    uses: v.number(),
    wins: v.number()
  })
    .index("by_day_and_mode_and_tower", ["day", "mode", "towerCardId"])
    .index("by_day", ["day"]),

  /** Materialised deck leaderboard, recomputed by the rollup cron. */
  deckRankings: defineTable({
    windowDays: v.number(),
    mode: metaMode,
    rank: v.number(),
    deckHash: v.string(),
    cardIds: v.array(v.number()),
    evolutionIds: v.array(v.number()),
    uses: v.number(),
    wins: v.number(),
    winRate: v.number(),
    usageRate: v.number(),
    averageTrophies: v.optional(v.number()),
    trophySamples: v.optional(v.number()),
    arenaIds: v.optional(v.array(v.number())),
    arenaNames: v.optional(v.array(v.string())),
    computedAt: v.number(),
    /** Optional for schema-safe rollout; only true rows are publicly served. */
    complete: v.optional(v.boolean())
  })
    .index("by_window_and_mode_and_rank", ["windowDays", "mode", "rank"])
    .index("by_window_and_mode", ["windowDays", "mode"])
    .index("by_window_and_mode_and_computed_at", ["windowDays", "mode", "computedAt"]),

  /**
   * Incremental seven-day source for exact top-deck materialisation. Stored
   * usage is an upper bound after UTC day rollover until the bounded refresh
   * normalises the row, so rankings are only published after convergence.
   */
  clashDeckRankingCandidates: defineTable({
    mode: metaMode,
    deckHash: v.string(),
    cardIds: v.array(v.number()),
    evolutionIds: v.array(v.number()),
    buckets: v.array(v.object({
      day: v.number(),
      uses: v.number(),
      wins: v.number(),
      trophySum: v.number(),
      trophySamples: v.number(),
      arenaIds: v.array(v.number()),
      arenaNames: v.array(v.string())
    })),
    uses1: v.number(),
    uses7: v.number(),
    materializedDay: v.number(),
    updatedAt: v.number()
  })
    .index("by_mode_and_deck_hash", ["mode", "deckHash"])
    .index("by_mode_and_uses_1", ["mode", "uses1"])
    .index("by_mode_and_uses_7", ["mode", "uses7"])
    .index("by_updated_at", ["updatedAt"]),

  /** One low-contention denominator row per mode for 1/7-day usage rates. */
  clashDeckRankingTotals: defineTable({
    mode: metaMode,
    buckets: v.array(v.object({ day: v.number(), uses: v.number() })),
    uses1: v.number(),
    uses7: v.number(),
    materializedDay: v.number(),
    startedAt: v.number(),
    updatedAt: v.number()
  }).index("by_mode", ["mode"]),

  /** One row per cron execution, so the beta page can show what the pipeline is doing. */
  clashPipelineRuns: defineTable({
    job: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    ok: v.boolean(),
    note: v.optional(v.string()),
    counters: v.optional(v.record(v.string(), v.number()))
  })
    .index("by_started_at", ["startedAt"])
    .index("by_job_and_started_at", ["job", "startedAt"]),

  /** Denormalised counters; Convex has no count operator. */
  clashPipelineCounters: defineTable({
    name: v.string(),
    value: v.number(),
    updatedAt: v.number()
  }).index("by_name", ["name"]),

  /**
   * Name → tag directory, so people can search for a player by name.
   *
   * The official API has no player search — lookup is exact-tag only — so the
   * only honest way to offer one is to remember every (name, tag) pair the site
   * already sees: leaderboard entries, clan rosters, both sides of every battle
   * the crawler reads, and any profile somebody looks up. Nothing here is
   * fetched for its own sake; it is a byproduct of requests already being made.
   */
  clashPlayerDirectory: defineTable({
    tag: v.string(),
    name: v.string(),
    /** Exact-match lane for "I typed my name exactly"; the search index is fuzzy. */
    nameLower: v.string(),
    clanTag: v.optional(v.string()),
    clanName: v.optional(v.string()),
    trophies: v.optional(v.number()),
    /** Distinct sightings. Names are not unique, so this ranks the collisions. */
    sightings: v.number(),
    updatedAt: v.number()
  })
    .index("by_tag", ["tag"])
    .index("by_name_lower", ["nameLower"])
    .index("by_updated_at", ["updatedAt"])
    .searchIndex("search_name", { searchField: "name" }),

  /** Capability-owned personalization account. See docs/personalization-identity-adapter.md. */
  clashPersonalAccounts: defineTable({
    createdAt: v.number(),
    updatedAt: v.number(),
    chestAlerts: v.boolean(),
    progressionAlerts: v.boolean(),
    warAlerts: v.boolean()
  }),

  /** Each browser has an independent high-entropy capability; raw secrets are never stored. */
  clashPersonalDevices: defineTable({
    accountId: v.id("clashPersonalAccounts"),
    secretHash: v.string(),
    label: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number()
  })
    .index("by_secret_hash", ["secretHash"])
    .index("by_account_id", ["accountId"]),

  /** One-time, ten-minute pairing capabilities generated in the browser. */
  clashPersonalPairingCodes: defineTable({
    accountId: v.id("clashPersonalAccounts"),
    codeHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number()
  })
    .index("by_code_hash", ["codeHash"])
    .index("by_account_id", ["accountId"]),

  clashPersonalProfiles: defineTable({
    accountId: v.id("clashPersonalAccounts"),
    kind: v.union(v.literal("players"), v.literal("clans")),
    tag: v.string(),
    name: v.string(),
    clan: v.optional(v.string()),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_account_id", ["accountId"])
    .index("by_account_id_and_kind_and_tag", ["accountId", "kind", "tag"]),

  clashPersonalRecents: defineTable({
    accountId: v.id("clashPersonalAccounts"),
    kind: v.union(v.literal("players"), v.literal("clans")),
    tag: v.string(),
    name: v.string(),
    clan: v.optional(v.string()),
    visitedAt: v.number()
  })
    .index("by_account_id", ["accountId"])
    .index("by_account_id_and_kind_and_tag", ["accountId", "kind", "tag"]),

  /** Last API observation for opt-in, refresh-driven browser alerts. */
  clashPersonalObservations: defineTable({
    accountId: v.id("clashPersonalAccounts"),
    kind: v.union(v.literal("players"), v.literal("clans")),
    tag: v.string(),
    trophies: v.optional(v.number()),
    chestName: v.optional(v.string()),
    chestIndex: v.optional(v.number()),
    warTrophies: v.optional(v.number()),
    observedAt: v.number()
  })
    .index("by_account_id", ["accountId"])
    .index("by_account_id_and_kind_and_tag", ["accountId", "kind", "tag"]),

  /** Clans explicitly opened in the management view; observed at most every six hours. */
  clashTrackedClans: defineTable({
    tag: v.string(),
    name: v.optional(v.string()),
    trackingStartedAt: v.number(),
    lastObservedAt: v.optional(v.number()),
    nextObservationAt: v.number(),
    observationCount: v.number(),
    consecutiveFailures: v.number(),
    lastError: v.optional(v.string()),
    /** Background work exists only while an explicit, renewable watch is live. */
    watchExpiresAt: v.optional(v.number()),
    watchTier: v.optional(v.number()),
    leaseUntil: v.optional(v.number()),
    retainUntil: v.optional(v.number())
  })
    .index("by_tag", ["tag"])
    .index("by_next_observation_at", ["nextObservationAt"])
    .index("by_watch_tier_and_next_observation_at", ["watchTier", "nextObservationAt"])
    .index("by_retain_until", ["retainUntil"]),

  /** One bounded-retention clan-level observation. Member rows live separately. */
  clashClanRosterSnapshots: defineTable({
    clanTag: v.string(),
    clanName: v.string(),
    observedAt: v.number(),
    memberCount: v.number(),
    clanScore: v.number(),
    warTrophies: v.number(),
    donationsPerWeek: v.number(),
    donationsChange: v.optional(v.number())
  })
    .index("by_clan_tag_and_observed_at", ["clanTag", "observedAt"])
    .index("by_observed_at", ["observedAt"]),

  /** Immutable member rows backing joins/leaves and observation-window movement. */
  clashClanMemberSnapshots: defineTable({
    clanTag: v.string(),
    observedAt: v.number(),
    memberTag: v.string(),
    name: v.string(),
    role: v.string(),
    trophies: v.number(),
    trophyChange: v.optional(v.number()),
    donations: v.number(),
    donationChange: v.optional(v.number()),
    donationsReceived: v.number(),
    lastSeenAt: v.optional(v.number())
  })
    .index("by_clan_tag_and_observed_at", ["clanTag", "observedAt"])
    .index("by_observed_at", ["observedAt"]),

  /** Current roster projection, capped naturally by Clash Royale's 50-member limit. */
  clashClanActiveMembers: defineTable({
    clanTag: v.string(),
    memberTag: v.string(),
    name: v.string(),
    role: v.string(),
    trophies: v.number(),
    trophyChange: v.number(),
    donations: v.number(),
    donationChange: v.number(),
    donationsReceived: v.number(),
    lastSeenAt: v.optional(v.number()),
    joinedObservedAt: v.number(),
    lastObservedAt: v.number(),
    inactiveSince: v.optional(v.number())
  }).index("by_clan_tag_and_member_tag", ["clanTag", "memberTag"]),

  /** Sparse, explainable changes used by the timeline and opt-in browser alerts. */
  clashClanManagementEvents: defineTable({
    clanTag: v.string(),
    observedAt: v.number(),
    kind: clanEventKind,
    memberTag: v.string(),
    memberName: v.string(),
    summary: v.string(),
    detail: v.string()
  })
    .index("by_clan_tag_and_observed_at", ["clanTag", "observedAt"])
    .index("by_observed_at", ["observedAt"]),

  /** One member's best-known River Race totals for one observed week. */
  clashClanWarMemberWeeks: defineTable({
    clanTag: v.string(),
    weekKey: v.string(),
    memberTag: v.string(),
    memberName: v.string(),
    seasonId: v.optional(v.number()),
    sectionIndex: v.optional(v.number()),
    completed: v.boolean(),
    fame: v.number(),
    repairPoints: v.number(),
    boatAttacks: v.number(),
    decksUsed: v.number(),
    decksUsedToday: v.optional(v.number()),
    missedDecks: v.optional(v.number()),
    firstObservedAt: v.number(),
    lastObservedAt: v.number()
  })
    .index("by_clan_tag_and_week_key_and_member_tag", ["clanTag", "weekKey", "memberTag"])
    .index("by_clan_tag_and_member_tag", ["clanTag", "memberTag"])
    .index("by_last_observed_at", ["lastObservedAt"])
};
