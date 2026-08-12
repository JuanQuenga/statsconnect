import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";

export type PlayerSighting = {
  tag: string;
  name: string;
  clubTag?: string;
  clubName?: string;
  trophies?: number;
  iconId?: number;
};

const sighting = v.object({
  tag: v.string(),
  name: v.string(),
  clubTag: v.optional(v.string()),
  clubName: v.optional(v.string()),
  trophies: v.optional(v.number()),
  iconId: v.optional(v.number()),
});

const profileSnapshot = v.object({
  tag: v.string(),
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
});

const directoryResult = v.object({
  tag: v.string(),
  name: v.string(),
  clubTag: v.optional(v.string()),
  clubName: v.optional(v.string()),
  trophies: v.optional(v.number()),
  iconId: v.optional(v.number()),
  sightings: v.number(),
  updatedAt: v.number(),
});

const historyResult = v.object({
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
});

function cleanTag(value: string): string | null {
  const tag = value.trim().toUpperCase().replace(/^#/, "");
  return /^[0289PYLQGRJCUV]{3,15}$/.test(tag) ? tag : null;
}

function utcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

export const recordSightings = internalMutation({
  args: { players: v.array(sighting) },
  returns: v.object({ recorded: v.number() }),
  handler: async (ctx, args) => {
    return await recordPlayerSightings(ctx, args.players);
  },
});

export async function recordPlayerSightings(
  ctx: MutationCtx,
  players: PlayerSighting[],
): Promise<{ recorded: number }> {
    const now = Date.now();
    const byTag = new Map<string, PlayerSighting>();
    for (const player of players.slice(0, 500)) {
      const tag = cleanTag(player.tag);
      const name = player.name.trim();
      if (!tag || !name) continue;
      const previous = byTag.get(tag);
      byTag.set(tag, {
        ...previous,
        ...player,
        tag,
        name,
        clubTag: player.clubTag ? cleanTag(player.clubTag) ?? undefined : previous?.clubTag,
      });
    }

    for (const player of byTag.values()) {
      const existing = await ctx.db
        .query("brawlPlayerDirectory")
        .withIndex("by_tag", (q) => q.eq("tag", player.tag))
        .unique();
      const values = {
        name: player.name,
        nameLower: player.name.toLocaleLowerCase(),
        clubTag: player.clubTag ?? existing?.clubTag,
        clubName: player.clubName ?? existing?.clubName,
        trophies: player.trophies ?? existing?.trophies,
        iconId: player.iconId ?? existing?.iconId,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, { ...values, sightings: existing.sightings + 1 });
      } else {
        await ctx.db.insert("brawlPlayerDirectory", {
          tag: player.tag,
          ...values,
          sightings: 1,
        });
      }
    }

    return { recorded: byTag.size };
}

export const recordProfile = internalMutation({
  args: profileSnapshot,
  returns: v.object({ createdSnapshot: v.boolean() }),
  handler: async (ctx, args) => {
    const tag = cleanTag(args.tag);
    if (!tag) return { createdSnapshot: false };

    const now = Date.now();
    const existingPlayer = await ctx.db
      .query("brawlPlayerDirectory")
      .withIndex("by_tag", (q) => q.eq("tag", tag))
      .unique();
    const directoryValues = {
      name: args.name.trim(),
      nameLower: args.name.trim().toLocaleLowerCase(),
      clubTag: args.clubTag ? cleanTag(args.clubTag) ?? undefined : undefined,
      clubName: args.clubName,
      trophies: args.trophies,
      iconId: args.iconId,
      updatedAt: now,
    };
    if (existingPlayer) {
      await ctx.db.patch(existingPlayer._id, {
        ...directoryValues,
        sightings: existingPlayer.sightings + 1,
      });
    } else {
      await ctx.db.insert("brawlPlayerDirectory", {
        tag,
        ...directoryValues,
        sightings: 1,
      });
    }

    const day = utcDay(now);
    const existingSnapshot = await ctx.db
      .query("playerSnapshots")
      .withIndex("by_tag_and_day", (q) => q.eq("tag", tag).eq("day", day))
      .unique();
    const snapshot = {
      recordedAt: now,
      name: args.name.trim(),
      trophies: args.trophies,
      highestTrophies: args.highestTrophies,
      expLevel: args.expLevel,
      victory3v3: args.victory3v3,
      soloVictories: args.soloVictories,
      duoVictories: args.duoVictories,
      clubTag: args.clubTag ? cleanTag(args.clubTag) ?? undefined : undefined,
      clubName: args.clubName,
      iconId: args.iconId,
      brawlerCount: args.brawlerCount,
      power11Count: args.power11Count,
    };
    if (existingSnapshot) {
      await ctx.db.patch(existingSnapshot._id, snapshot);
      return { createdSnapshot: false };
    }
    await ctx.db.insert("playerSnapshots", { tag, day, ...snapshot });
    return { createdSnapshot: true };
  },
});

export const search = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  returns: v.object({
    possibleTag: v.optional(v.string()),
    players: v.array(directoryResult),
  }),
  handler: async (ctx, args) => {
    const raw = args.query.trim();
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 12), 1), 25);
    if (!raw) return { players: [] };

    const possibleTag = cleanTag(raw) ?? undefined;
    const exactName = raw.toLocaleLowerCase();
    const [tagMatch, exactMatches, fuzzyMatches] = await Promise.all([
      possibleTag
        ? ctx.db.query("brawlPlayerDirectory").withIndex("by_tag", (q) => q.eq("tag", possibleTag)).unique()
        : null,
      ctx.db
        .query("brawlPlayerDirectory")
        .withIndex("by_name_lower", (q) => q.eq("nameLower", exactName))
        .take(limit),
      raw.length >= 2
        ? ctx.db.query("brawlPlayerDirectory").withSearchIndex("search_name", (q) => q.search("name", raw)).take(limit)
        : [],
    ]);

    const unique = new Map<string, NonNullable<typeof tagMatch>>();
    if (tagMatch) unique.set(tagMatch.tag, tagMatch);
    for (const player of [...exactMatches, ...fuzzyMatches]) unique.set(player.tag, player);
    const players = [...unique.values()]
      .sort((a, b) => {
        const exactA = a.nameLower === exactName ? 1 : 0;
        const exactB = b.nameLower === exactName ? 1 : 0;
        return exactB - exactA || b.sightings - a.sightings || (b.trophies ?? 0) - (a.trophies ?? 0);
      })
      .slice(0, limit)
      .map(({ tag, name, clubTag, clubName, trophies, iconId, sightings, updatedAt }) => ({
        tag,
        name,
        clubTag,
        clubName,
        trophies,
        iconId,
        sightings,
        updatedAt,
      }));

    return { possibleTag, players };
  },
});

export const history = query({
  args: { tag: v.string(), limit: v.optional(v.number()) },
  returns: v.array(historyResult),
  handler: async (ctx, args) => {
    const tag = cleanTag(args.tag);
    if (!tag) return [];
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 90), 1), 365);
    const rows = await ctx.db
      .query("playerSnapshots")
      .withIndex("by_tag_and_day", (q) => q.eq("tag", tag))
      .order("desc")
      .take(limit);
    return rows.map(({ day, recordedAt, name, trophies, highestTrophies, expLevel, victory3v3, soloVictories, duoVictories, clubTag, clubName, iconId, brawlerCount, power11Count }) => ({
      day,
      recordedAt,
      name,
      trophies,
      highestTrophies,
      expLevel,
      victory3v3,
      soloVictories,
      duoVictories,
      clubTag,
      clubName,
      iconId,
      brawlerCount,
      power11Count,
    }));
  },
});

export const directorySize = query({
  args: {},
  returns: v.object({ count: v.number(), capped: v.boolean() }),
  handler: async (ctx) => {
    const rows = await ctx.db.query("brawlPlayerDirectory").take(10_001);
    return { count: Math.min(rows.length, 10_000), capped: rows.length > 10_000 };
  },
});
