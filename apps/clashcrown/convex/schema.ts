import { defineSchema, defineTable } from "convex/server";
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
  v.literal("tournaments")
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

export default defineSchema({
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

  apiFetchLogs: defineTable({
    endpoint: v.string(),
    status: v.number(),
    ok: v.boolean(),
    fetchedAt: v.number()
  }).index("by_fetched_at", ["fetchedAt"]),

  // --- Battle-log collection pipeline -------------------------------------
  // The official API only exposes battles per player, so deck statistics have
  // to be built by polling many players' battle logs over time.

  /** Player tags the crawler polls, leased through `nextDueAt`. */
  crawlTargets: defineTable({
    tag: v.string(),
    source: crawlSource,
    /** Lower crawls sooner; derived from ladder rank so the top of the ladder stays fresh. */
    priority: v.number(),
    nextDueAt: v.number(),
    lastFetchedAt: v.optional(v.number()),
    /** Newest battle already ingested for this tag, used to skip unchanged logs. */
    lastBattleTime: v.optional(v.number()),
    consecutiveFailures: v.number(),
    disabled: v.boolean()
  })
    .index("by_tag", ["tag"])
    .index("by_due", ["disabled", "nextDueAt"]),

  /**
   * Dedup ledger. A battle appears in both participants' logs, so we key on the
   * battle rather than on one player's view of it. Pruned once battles age out
   * of the API's own 25-battle window.
   */
  seenBattles: defineTable({
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
    crowns: v.number()
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
    computedAt: v.number()
  })
    .index("by_window_and_mode_and_rank", ["windowDays", "mode", "rank"])
    .index("by_window_and_mode", ["windowDays", "mode"])
    .index("by_window_and_mode_and_computed_at", ["windowDays", "mode", "computedAt"]),

  /** One row per cron execution, so the beta page can show what the pipeline is doing. */
  pipelineRuns: defineTable({
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
  pipelineCounters: defineTable({
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
  playerDirectory: defineTable({
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
    .searchIndex("search_name", { searchField: "name" })
});
