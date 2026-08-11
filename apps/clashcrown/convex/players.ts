import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { bump } from "./meta";

/**
 * The player-name directory.
 *
 * The Clash Royale API can only look a player up by exact tag — there is no
 * name search — so this table is assembled from (name, tag) pairs the site
 * already receives for other reasons: leaderboard entries, clan rosters, both
 * participants in every battle the crawler reads, and profiles people visit.
 * No request is made purely to fill it.
 */

const TAG_PATTERN = /^[0289PYLQGRJCUV]{3,15}$/;

/** Re-writing an unchanged row is pure write amplification, so throttle it. */
const REFRESH_MS = 6 * 60 * 60 * 1000;
/** Keeps one call inside Convex's per-transaction document budget. */
const MAX_RECORD_BATCH = 300;

const sighting = v.object({
  tag: v.string(),
  name: v.string(),
  clanTag: v.optional(v.string()),
  clanName: v.optional(v.string()),
  trophies: v.optional(v.number())
});

function cleanTag(input: string) {
  const tag = input.trim().replaceAll(" ", "").replace(/^#/, "").toUpperCase();
  return TAG_PATTERN.test(tag) ? tag : undefined;
}

/**
 * Upserts a batch of sightings. Callers hand over whatever they happened to
 * see; duplicates within a batch and across batches are both expected.
 */
export const record = internalMutation({
  args: { players: v.array(sighting) },
  handler: async (ctx, args) => {
    const now = Date.now();

    // One crawl tick sees the same tags many times over. Fold first so the
    // transaction touches each document once.
    const unique = new Map<string, { tag: string; name: string; clanTag?: string; clanName?: string; trophies?: number }>();
    for (const player of args.players) {
      const tag = cleanTag(player.tag);
      const name = player.name.trim();
      if (!tag || !name) continue;
      unique.set(tag, { ...player, tag, name, clanTag: player.clanTag ? cleanTag(player.clanTag) : undefined });
    }

    let added = 0;
    let updated = 0;
    for (const player of [...unique.values()].slice(0, MAX_RECORD_BATCH)) {
      const existing = await ctx.db
        .query("playerDirectory")
        .withIndex("by_tag", (q) => q.eq("tag", player.tag))
        .unique();

      if (!existing) {
        await ctx.db.insert("playerDirectory", {
          tag: player.tag,
          name: player.name,
          nameLower: player.name.toLowerCase(),
          clanTag: player.clanTag,
          clanName: player.clanName,
          trophies: player.trophies,
          sightings: 1,
          updatedAt: now
        });
        added += 1;
        continue;
      }

      // A rename or a clan move has to land immediately — that is the whole
      // point of re-seeing a player. An identical sighting can wait.
      const moved =
        existing.name !== player.name ||
        (player.clanTag !== undefined && existing.clanTag !== player.clanTag) ||
        (player.trophies !== undefined && existing.trophies !== player.trophies);
      if (!moved && now - existing.updatedAt < REFRESH_MS) continue;

      await ctx.db.patch(existing._id, {
        name: player.name,
        nameLower: player.name.toLowerCase(),
        clanTag: player.clanTag ?? existing.clanTag,
        clanName: player.clanName ?? existing.clanName,
        trophies: player.trophies ?? existing.trophies,
        sightings: existing.sightings + 1,
        updatedAt: now
      });
      updated += 1;
    }

    await bump(ctx, "directoryPlayers", added);
    return { added, updated, seen: unique.size };
  }
});

// --- Public read API ------------------------------------------------------

export type DirectoryHit = {
  tag: string;
  name: string;
  clanTag?: string;
  clanName?: string;
  trophies?: number;
  sightings: number;
  /** True when the query matched the name exactly, which sorts it to the top. */
  exact: boolean;
};

/**
 * Resolves whatever somebody typed into profiles they can click.
 *
 * A tag and a name are not cleanly separable — Clash tags use a 14-character
 * alphabet, so short names like "CLQ" are valid tags too. Rather than guess,
 * this returns both: `tag` when the input could be one, alongside any name
 * matches, and the UI offers each as its own row.
 */
export const search = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const raw = args.query.trim();
    const limit = Math.min(Math.max(args.limit ?? 8, 1), 25);
    if (!raw) return { tag: null, players: [] as DirectoryHit[] };

    const asTag = cleanTag(raw) ?? null;
    const lower = raw.toLowerCase();

    const [exact, fuzzy] = await Promise.all([
      ctx.db
        .query("playerDirectory")
        .withIndex("by_name_lower", (q) => q.eq("nameLower", lower))
        .take(limit * 2),
      ctx.db
        .query("playerDirectory")
        .withSearchIndex("search_name", (q) => q.search("name", raw))
        .take(limit * 3)
    ]);

    const merged = new Map<string, DirectoryHit>();
    for (const row of [...exact, ...fuzzy]) {
      // The exact lane runs first, so an entry already present keeps `exact`.
      if (merged.has(row.tag)) continue;
      merged.set(row.tag, {
        tag: row.tag,
        name: row.name,
        clanTag: row.clanTag,
        clanName: row.clanName,
        trophies: row.trophies,
        sightings: row.sightings,
        exact: row.nameLower === lower
      });
    }

    // Exact names first, then the players we have seen most — a name shared by
    // a top-ladder player and a lapsed account should resolve to the former.
    const players = [...merged.values()]
      .sort(
        (a, b) =>
          Number(b.exact) - Number(a.exact) ||
          b.sightings - a.sightings ||
          (b.trophies ?? 0) - (a.trophies ?? 0)
      )
      .slice(0, limit);

    return { tag: asTag, players };
  }
});

/** Powers the "searching N players" note under the search box. */
export const directorySize = query({
  args: {},
  handler: async (ctx) => {
    const counter = await ctx.db
      .query("pipelineCounters")
      .withIndex("by_name", (q) => q.eq("name", "directoryPlayers"))
      .unique();
    return counter?.value ?? 0;
  }
});
