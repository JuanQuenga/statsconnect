import { paginationOptsValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, query, type MutationCtx } from "../_generated/server";

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const KEEP_FOREVER = Number.MAX_SAFE_INTEGER;
const MAX_LEADERBOARD_ENTRIES = 200;

const pathResult = v.object({
  trophies: v.optional(v.number()),
  bestTrophies: v.optional(v.number()),
  rank: v.optional(v.union(v.number(), v.null()))
});

const playerSnapshotInput = v.object({
  tag: v.string(),
  name: v.string(),
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
    current: v.optional(pathResult),
    last: v.optional(pathResult),
    best: v.optional(pathResult)
  }))
});

const leaderboardKind = v.union(
  v.literal("event"),
  v.literal("players"),
  v.literal("clans"),
  v.literal("clanwars")
);

const leaderboardEntryInput = v.object({
  rank: v.number(),
  tag: v.string(),
  name: v.string(),
  score: v.optional(v.number()),
  trophies: v.optional(v.number()),
  clanTag: v.optional(v.string()),
  clanName: v.optional(v.string())
});

function stableFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

type PlayerSnapshotInput = Infer<typeof playerSnapshotInput>;

async function recordPlayerSnapshotValue(
  ctx: MutationCtx,
  args: {
    player: PlayerSnapshotInput;
    source: "api_profile" | "battle_log";
    observedAt: number;
  }
) {
  const player = args.player;
  const fingerprint = stableFingerprint(player);
  const latest = await ctx.db
    .query("clashPlayerSnapshots")
    .withIndex("by_tag_and_source_and_observed_at", (q) => q.eq("tag", player.tag).eq("source", args.source))
    .order("desc")
    .first();

  if (latest?.fingerprint === fingerprint) {
    await ctx.db.patch(latest._id, {
      lastObservedAt: args.observedAt,
      retentionAt: args.observedAt + THREE_YEARS_MS
    });
    return false;
  }

  await ctx.db.insert("clashPlayerSnapshots", {
    ...player,
    source: args.source,
    fingerprint,
    observedAt: args.observedAt,
    lastObservedAt: args.observedAt,
    retentionAt: args.observedAt + THREE_YEARS_MS
  });
  return true;
}

/** Records a profile only when a meaningful field changed since the last API refresh. */
export const recordPlayerSnapshot = internalMutation({
  args: {
    player: playerSnapshotInput,
    source: v.union(v.literal("api_profile"), v.literal("battle_log")),
    observedAt: v.number()
  },
  returns: v.object({ inserted: v.boolean() }),
  handler: async (ctx, args) => {
    return { inserted: await recordPlayerSnapshotValue(ctx, args) };
  }
});

/** One transaction per crawl batch instead of one child mutation per tag. */
export const recordPlayerSnapshots = internalMutation({
  args: {
    snapshots: v.array(v.object({
      player: playerSnapshotInput,
      source: v.union(v.literal("api_profile"), v.literal("battle_log")),
      observedAt: v.number()
    }))
  },
  returns: v.object({ inserted: v.number(), seen: v.number() }),
  handler: async (ctx, args) => {
    const snapshots = args.snapshots.slice(0, 50);
    let inserted = 0;
    for (const snapshot of snapshots) {
      inserted += Number(await recordPlayerSnapshotValue(ctx, snapshot));
    }
    return { inserted, seen: snapshots.length };
  }
});

/**
 * Stores at most the top 200 entries. The cap makes each mutation and every
 * comparison query predictable even when the upstream API allows 1,000 rows.
 */
export const recordLeaderboardSnapshot = internalMutation({
  args: {
    board: v.object({
      key: v.string(),
      kind: leaderboardKind,
      name: v.string(),
      boardId: v.optional(v.number()),
      locationId: v.optional(v.number())
    }),
    entries: v.array(leaderboardEntryInput),
    observedAt: v.number()
  },
  returns: v.object({ inserted: v.boolean(), entryCount: v.number() }),
  handler: async (ctx, args) => {
    const entries = args.entries
      .slice(0, MAX_LEADERBOARD_ENTRIES)
      .map((entry) => withoutUndefined(entry));
    const fingerprint = stableFingerprint(entries);
    const board = await ctx.db
      .query("clashLeaderboardBoards")
      .withIndex("by_key", (q) => q.eq("key", args.board.key))
      .unique();
    const latest = await ctx.db
      .query("clashLeaderboardSnapshots")
      .withIndex("by_board_key_and_observed_at", (q) => q.eq("boardKey", args.board.key))
      .order("desc")
      .first();

    if (latest?.fingerprint === fingerprint) {
      await ctx.db.patch(latest._id, { lastObservedAt: args.observedAt });
      if (board) await ctx.db.patch(board._id, { ...args.board, lastObservedAt: args.observedAt });
      return { inserted: false, entryCount: entries.length };
    }

    const baseline = !latest;
    const snapshotId = await ctx.db.insert("clashLeaderboardSnapshots", {
      boardKey: args.board.key,
      fingerprint,
      observedAt: args.observedAt,
      lastObservedAt: args.observedAt,
      entryCount: entries.length,
      baseline,
      retentionAt: baseline ? KEEP_FOREVER : args.observedAt + TWO_YEARS_MS
    });
    for (const entry of entries) {
      await ctx.db.insert("clashLeaderboardEntries", {
        ...entry,
        snapshotId,
        boardKey: args.board.key,
        observedAt: args.observedAt
      });
    }

    if (board) {
      await ctx.db.patch(board._id, {
        ...args.board,
        lastObservedAt: args.observedAt,
        snapshotCount: board.snapshotCount + 1
      });
    } else {
      await ctx.db.insert("clashLeaderboardBoards", {
        ...args.board,
        firstObservedAt: args.observedAt,
        lastObservedAt: args.observedAt,
        snapshotCount: 1
      });
    }
    return { inserted: true, entryCount: entries.length };
  }
});

const publicPlayerSnapshot = v.object({
  id: v.id("clashPlayerSnapshots"),
  source: v.union(v.literal("api_profile"), v.literal("battle_log"), v.literal("legacy_trophy")),
  observedAt: v.number(),
  lastObservedAt: v.number(),
  name: v.string(),
  trophies: v.optional(v.number()),
  bestTrophies: v.optional(v.number()),
  expLevel: v.optional(v.number()),
  arenaName: v.optional(v.string()),
  clanTag: v.optional(v.string()),
  clanName: v.optional(v.string()),
  currentDeck: v.optional(v.array(v.object({ id: v.number(), level: v.optional(v.number()), evolutionLevel: v.optional(v.number()) }))),
  collection: v.optional(v.object({ cardsOwned: v.number(), totalLevels: v.number(), maxedCards: v.number(), evolvedCards: v.number(), starLevels: v.number() })),
  totals: v.optional(v.object({
    wins: v.optional(v.number()), losses: v.optional(v.number()), battleCount: v.optional(v.number()),
    threeCrownWins: v.optional(v.number()), challengeCardsWon: v.optional(v.number()),
    tournamentCardsWon: v.optional(v.number()), donations: v.optional(v.number()),
    donationsReceived: v.optional(v.number()), totalDonations: v.optional(v.number()),
    warDayWins: v.optional(v.number()), clanCardsCollected: v.optional(v.number())
  })),
  path: v.optional(v.object({ current: v.optional(pathResult), last: v.optional(pathResult), best: v.optional(pathResult) }))
});

export const playerHistory = query({
  args: { tag: v.string(), limit: v.optional(v.number()) },
  returns: v.array(publicPlayerSnapshot),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("clashPlayerSnapshots")
      .withIndex("by_tag_and_observed_at", (q) => q.eq("tag", args.tag.replace(/^#/, "").toUpperCase()))
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 60, 1), 120));
    return rows.map((row) => withoutUndefined({
      id: row._id,
      source: row.source,
      observedAt: row.observedAt,
      lastObservedAt: row.lastObservedAt,
      name: row.name,
      trophies: row.trophies,
      bestTrophies: row.bestTrophies,
      expLevel: row.expLevel,
      arenaName: row.arenaName,
      clanTag: row.clanTag,
      clanName: row.clanName,
      currentDeck: row.currentDeck,
      collection: row.collection,
      totals: row.totals,
      path: row.path
    }));
  }
});

const publicBoard = v.object({
  key: v.string(), kind: leaderboardKind, name: v.string(), boardId: v.optional(v.number()),
  locationId: v.optional(v.number()), firstObservedAt: v.number(), lastObservedAt: v.number(), snapshotCount: v.number()
});

export const listLeaderboardBoards = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(publicBoard),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("clashLeaderboardBoards")
      .withIndex("by_last_observed_at")
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 80, 1), 200));
    return rows.map(({ key, kind, name, boardId, locationId, firstObservedAt, lastObservedAt, snapshotCount }) => withoutUndefined({
      key, kind, name, boardId, locationId, firstObservedAt, lastObservedAt, snapshotCount
    }));
  }
});

const publicLeaderboardSnapshot = v.object({
  id: v.id("clashLeaderboardSnapshots"), observedAt: v.number(), lastObservedAt: v.number(), entryCount: v.number(), baseline: v.boolean()
});

export const listLeaderboardSnapshots = query({
  args: { boardKey: v.string(), limit: v.optional(v.number()) },
  returns: v.array(publicLeaderboardSnapshot),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("clashLeaderboardSnapshots")
      .withIndex("by_board_key_and_observed_at", (q) => q.eq("boardKey", args.boardKey))
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 40, 1), 100));
    return rows.map((row) => ({
      id: row._id,
      observedAt: row.observedAt,
      lastObservedAt: row.lastObservedAt,
      entryCount: row.entryCount,
      baseline: row.baseline
    }));
  }
});

const comparisonEntry = v.object({
  rank: v.number(), previousRank: v.optional(v.number()), rankChange: v.optional(v.number()), tag: v.string(),
  name: v.string(), score: v.optional(v.number()), previousScore: v.optional(v.number()), scoreChange: v.optional(v.number()),
  trophies: v.optional(v.number()), clanTag: v.optional(v.string()), clanName: v.optional(v.string())
});

export const getLeaderboardSnapshot = query({
  args: {
    snapshotId: v.id("clashLeaderboardSnapshots"),
    compareToId: v.optional(v.id("clashLeaderboardSnapshots")),
    limit: v.optional(v.number())
  },
  returns: v.union(
    v.null(),
    v.object({
      board: publicBoard,
      snapshot: publicLeaderboardSnapshot,
      comparedAt: v.union(v.number(), v.null()),
      entries: v.array(comparisonEntry)
    })
  ),
  handler: async (ctx, args) => {
    const snapshot = await ctx.db.get(args.snapshotId);
    if (!snapshot) return null;
    const board = await ctx.db.query("clashLeaderboardBoards").withIndex("by_key", (q) => q.eq("key", snapshot.boardKey)).unique();
    if (!board) return null;
    const limit = Math.min(Math.max(args.limit ?? 100, 1), MAX_LEADERBOARD_ENTRIES);
    const rows = await ctx.db
      .query("clashLeaderboardEntries")
      .withIndex("by_snapshot_id_and_rank", (q) => q.eq("snapshotId", args.snapshotId))
      .take(limit);

    let previous: Doc<"clashLeaderboardSnapshots"> | null = null;
    let previousByTag = new Map<string, Doc<"clashLeaderboardEntries">>();
    if (args.compareToId) {
      const candidate = await ctx.db.get(args.compareToId);
      if (candidate?.boardKey === snapshot.boardKey) {
        previous = candidate;
        const previousRows = await ctx.db
          .query("clashLeaderboardEntries")
          .withIndex("by_snapshot_id_and_rank", (q) => q.eq("snapshotId", args.compareToId!))
          .take(MAX_LEADERBOARD_ENTRIES);
        previousByTag = new Map(previousRows.map((row) => [row.tag, row]));
      }
    }

    return {
      board: withoutUndefined({
        key: board.key, kind: board.kind, name: board.name, boardId: board.boardId, locationId: board.locationId,
        firstObservedAt: board.firstObservedAt, lastObservedAt: board.lastObservedAt, snapshotCount: board.snapshotCount
      }),
      snapshot: {
        id: snapshot._id, observedAt: snapshot.observedAt, lastObservedAt: snapshot.lastObservedAt,
        entryCount: snapshot.entryCount, baseline: snapshot.baseline
      },
      comparedAt: previous?.observedAt ?? null,
      entries: rows.map((row) => {
        const old = previousByTag.get(row.tag);
        return withoutUndefined({
          rank: row.rank,
          previousRank: old?.rank,
          rankChange: old ? old.rank - row.rank : undefined,
          tag: row.tag,
          name: row.name,
          score: row.score,
          previousScore: old?.score,
          scoreChange: old && row.score !== undefined && old.score !== undefined ? row.score - old.score : undefined,
          trophies: row.trophies,
          clanTag: row.clanTag,
          clanName: row.clanName
        });
      })
    };
  }
});

/** Opt-in, resumable migration: only trophy/name/timestamp fields that already exist are copied. */
export const backfillLegacyProfileHistory = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ migrated: v.number(), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args): Promise<{ migrated: number; isDone: boolean; continueCursor: string }> => {
    const page = await ctx.db.query("profileHistory").paginate(args.paginationOpts);
    let migrated = 0;
    for (const row of page.page) {
      if (row.kind !== "player") continue;
      const existing = await ctx.db
        .query("clashPlayerSnapshots")
        .withIndex("by_legacy_history_id", (q) => q.eq("legacyHistoryId", row._id))
        .unique();
      if (existing) continue;
      await ctx.db.insert("clashPlayerSnapshots", {
        tag: row.tag,
        name: row.name,
        source: "legacy_trophy",
        fingerprint: `legacy:${row._id}`,
        observedAt: row.recordedAt,
        lastObservedAt: row.recordedAt,
        retentionAt: Date.now() + THREE_YEARS_MS,
        trophies: row.value,
        legacyHistoryId: row._id
      });
      migrated += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.clash.history.backfillLegacyProfileHistory, {
        paginationOpts: { cursor: page.continueCursor, numItems: args.paginationOpts.numItems }
      });
    }
    return { migrated, isDone: page.isDone, continueCursor: page.continueCursor };
  }
});

/** Public one-click entrypoint is idempotent and only schedules bounded internal batches. */
export const startLegacyBackfill = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.clash.history.backfillLegacyProfileHistory, {
      paginationOpts: { cursor: null, numItems: 100 }
    });
    return null;
  }
});

export const pruneHistoryBatch = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), more: v.boolean() }),
  handler: async (ctx) => {
    const now = Date.now();
    const players = await ctx.db
      .query("clashPlayerSnapshots")
      .withIndex("by_retention_at", (q) => q.lt("retentionAt", now))
      .take(128);
    for (const row of players) await ctx.db.delete(row._id);

    const snapshots = await ctx.db
      .query("clashLeaderboardSnapshots")
      .withIndex("by_retention_at", (q) => q.lt("retentionAt", now))
      .take(10);
    let entriesDeleted = 0;
    for (const snapshot of snapshots) {
      const entries = await ctx.db
        .query("clashLeaderboardEntries")
        .withIndex("by_snapshot_id_and_rank", (q) => q.eq("snapshotId", snapshot._id))
        .take(MAX_LEADERBOARD_ENTRIES);
      for (const entry of entries) await ctx.db.delete(entry._id);
      entriesDeleted += entries.length;
      await ctx.db.delete(snapshot._id);
    }
    return {
      deleted: players.length + snapshots.length + entriesDeleted,
      more: players.length === 128 || snapshots.length === 10
    };
  }
});
