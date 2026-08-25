import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { clubActivityType } from "./schema";

const memberInput = v.object({
  tag: v.string(),
  name: v.string(),
  role: v.optional(v.string()),
  trophies: v.number(),
  iconId: v.optional(v.number()),
});

const clubInput = v.object({
  tag: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  type: v.optional(v.string()),
  badgeId: v.optional(v.number()),
  requiredTrophies: v.optional(v.number()),
  trophies: v.number(),
  members: v.array(memberInput),
});

const clubSnapshot = v.object({
  day: v.number(),
  recordedAt: v.number(),
  name: v.string(),
  trophies: v.number(),
  memberCount: v.number(),
  requiredTrophies: v.optional(v.number()),
});

const clubEvent = v.object({
  recordedAt: v.number(),
  playerTag: v.string(),
  playerName: v.string(),
  type: clubActivityType,
  fromRole: v.optional(v.string()),
  toRole: v.optional(v.string()),
  fromTrophies: v.optional(v.number()),
  toTrophies: v.optional(v.number()),
  trophyDelta: v.optional(v.number()),
});

const rosterMember = v.object({
  tag: v.string(),
  name: v.string(),
  role: v.string(),
  trophies: v.number(),
  iconId: v.optional(v.number()),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  joinedAt: v.number(),
  lastProfileAt: v.optional(v.number()),
});

function normalizedTag(value: string): string {
  const tag = value.trim().toUpperCase().replace(/^#/, "");
  return `#${tag}`;
}

function utcDay(timestamp: number): number {
  return Math.floor(timestamp / 86_400_000);
}

export const recordClub = internalMutation({
  args: { club: clubInput, observedAt: v.optional(v.number()) },
  returns: v.object({
    createdSnapshot: v.boolean(),
    events: v.number(),
    members: v.number(),
  }),
  handler: async (ctx, args) => {
    const observedAt = Math.min(args.observedAt ?? Date.now(), Date.now());
    const clubTag = normalizedTag(args.club.tag);
    const directory = await ctx.db
      .query("brawlClubDirectory")
      .withIndex("by_tag", (q) => q.eq("tag", clubTag))
      .unique();
    const isBaseline = directory === null;
    const members = args.club.members.slice(0, 30).map((member) => ({
      ...member,
      tag: normalizedTag(member.tag),
      name: member.name.trim() || member.tag,
      role: member.role?.trim() || "member",
    }));

    const directoryValue = {
      tag: clubTag,
      name: args.club.name.trim() || clubTag,
      description: args.club.description,
      type: args.club.type,
      badgeId: args.club.badgeId,
      requiredTrophies: args.club.requiredTrophies,
      trophies: args.club.trophies,
      memberCount: members.length,
      lastSeenAt: observedAt,
    };
    if (directory) {
      await ctx.db.patch(directory._id, directoryValue);
    } else {
      await ctx.db.insert("brawlClubDirectory", {
        ...directoryValue,
        trackedSinceAt: observedAt,
      });
    }

    const day = utcDay(observedAt);
    const snapshot = await ctx.db
      .query("brawlClubSnapshots")
      .withIndex("by_tag_and_day", (q) => q.eq("tag", clubTag).eq("day", day))
      .unique();
    const snapshotValue = {
      tag: clubTag,
      day,
      recordedAt: observedAt,
      name: directoryValue.name,
      trophies: args.club.trophies,
      memberCount: members.length,
      requiredTrophies: args.club.requiredTrophies,
    };
    if (snapshot) await ctx.db.patch(snapshot._id, snapshotValue);
    else await ctx.db.insert("brawlClubSnapshots", snapshotValue);

    const activeStates = await ctx.db
      .query("brawlClubMemberStates")
      .withIndex("by_club_tag_and_active", (q) => q.eq("clubTag", clubTag).eq("active", true))
      .take(31);
    const observedTags = new Set(members.map((member) => member.tag));
    let eventCount = 0;

    for (const member of members) {
      const state = await ctx.db
        .query("brawlClubMemberStates")
        .withIndex("by_club_tag_and_player_tag", (q) =>
          q.eq("clubTag", clubTag).eq("playerTag", member.tag),
        )
        .unique();
      const rejoined = state !== null && !state.active;
      const joined = state === null || rejoined;
      const roleChanged = state !== null && state.active && state.role !== member.role;
      const trophyDelta = state !== null && state.active ? member.trophies - state.trophies : 0;
      const changed = joined || roleChanged || trophyDelta !== 0 || state?.name !== member.name;

      if (state) {
        await ctx.db.patch(state._id, {
          name: member.name,
          role: member.role,
          trophies: member.trophies,
          iconId: member.iconId,
          active: true,
          lastSeenAt: observedAt,
          joinedAt: rejoined ? observedAt : state.joinedAt,
          leftAt: undefined,
        });
      } else {
        await ctx.db.insert("brawlClubMemberStates", {
          clubTag,
          playerTag: member.tag,
          name: member.name,
          role: member.role,
          trophies: member.trophies,
          iconId: member.iconId,
          active: true,
          firstSeenAt: observedAt,
          lastSeenAt: observedAt,
          joinedAt: observedAt,
        });
      }

      if (changed) {
        const transitionKey = `${clubTag}:${member.tag}:${state?.lastSeenAt ?? "initial"}:${observedAt}`;
        await ctx.db.insert("brawlClubMemberSnapshots", {
          dedupeKey: transitionKey,
          clubTag,
          playerTag: member.tag,
          recordedAt: observedAt,
          name: member.name,
          role: member.role,
          trophies: member.trophies,
          iconId: member.iconId,
          present: true,
        });

        if (joined && !isBaseline) {
          await ctx.db.insert("brawlClubActivityEvents", {
            dedupeKey: `${transitionKey}:join`,
            clubTag,
            playerTag: member.tag,
            playerName: member.name,
            recordedAt: observedAt,
            type: "join",
            toRole: member.role,
            toTrophies: member.trophies,
          });
          eventCount += 1;
        }
        if (roleChanged && state) {
          await ctx.db.insert("brawlClubActivityEvents", {
            dedupeKey: `${transitionKey}:role`,
            clubTag,
            playerTag: member.tag,
            playerName: member.name,
            recordedAt: observedAt,
            type: "role_change",
            fromRole: state.role,
            toRole: member.role,
          });
          eventCount += 1;
        }
        if (trophyDelta !== 0 && state) {
          await ctx.db.insert("brawlClubActivityEvents", {
            dedupeKey: `${transitionKey}:trophies`,
            clubTag,
            playerTag: member.tag,
            playerName: member.name,
            recordedAt: observedAt,
            type: "trophy_change",
            fromTrophies: state.trophies,
            toTrophies: member.trophies,
            trophyDelta,
          });
          eventCount += 1;
        }
      }
    }

    for (const state of activeStates) {
      if (observedTags.has(state.playerTag)) continue;
      const transitionKey = `${clubTag}:${state.playerTag}:${state.lastSeenAt}:${observedAt}`;
      await ctx.db.patch(state._id, { active: false, leftAt: observedAt });
      await ctx.db.insert("brawlClubMemberSnapshots", {
        dedupeKey: transitionKey,
        clubTag,
        playerTag: state.playerTag,
        recordedAt: observedAt,
        name: state.name,
        role: state.role,
        trophies: state.trophies,
        iconId: state.iconId,
        present: false,
      });
      if (!isBaseline) {
        await ctx.db.insert("brawlClubActivityEvents", {
          dedupeKey: `${transitionKey}:leave`,
          clubTag,
          playerTag: state.playerTag,
          playerName: state.name,
          recordedAt: observedAt,
          type: "leave",
          fromRole: state.role,
          fromTrophies: state.trophies,
        });
        eventCount += 1;
      }
    }

    return { createdSnapshot: snapshot === null, events: eventCount, members: members.length };
  },
});

export const history = query({
  args: {
    tag: v.string(),
    snapshotLimit: v.optional(v.number()),
    eventLimit: v.optional(v.number()),
  },
  returns: v.object({
    trackedSinceAt: v.optional(v.number()),
    lastSeenAt: v.optional(v.number()),
    snapshots: v.array(clubSnapshot),
    events: v.array(clubEvent),
    roster: v.array(rosterMember),
    summary: v.object({
      joins: v.number(),
      leaves: v.number(),
      roleChanges: v.number(),
      trophyChange: v.number(),
      activeMembers: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    const tag = normalizedTag(args.tag);
    const snapshotLimit = Math.min(Math.max(Math.floor(args.snapshotLimit ?? 180), 1), 365);
    const eventLimit = Math.min(Math.max(Math.floor(args.eventLimit ?? 250), 1), 500);
    const [directory, snapshotRows, eventRows, stateRows] = await Promise.all([
      ctx.db.query("brawlClubDirectory").withIndex("by_tag", (q) => q.eq("tag", tag)).unique(),
      ctx.db
        .query("brawlClubSnapshots")
        .withIndex("by_tag_and_day", (q) => q.eq("tag", tag))
        .order("desc")
        .take(snapshotLimit),
      ctx.db
        .query("brawlClubActivityEvents")
        .withIndex("by_club_tag_and_recorded_at", (q) => q.eq("clubTag", tag))
        .order("desc")
        .take(eventLimit),
      ctx.db
        .query("brawlClubMemberStates")
        .withIndex("by_club_tag_and_active", (q) => q.eq("clubTag", tag).eq("active", true))
        .take(31),
    ]);

    const roster = await Promise.all(
      stateRows.map(async (state) => {
        const latestProfile = await ctx.db
          .query("playerSnapshots")
          .withIndex("by_tag_and_day", (q) => q.eq("tag", state.playerTag.replace(/^#/, "")))
          .order("desc")
          .take(1);
        return {
          tag: state.playerTag,
          name: state.name,
          role: state.role,
          trophies: state.trophies,
          iconId: state.iconId,
          firstSeenAt: state.firstSeenAt,
          lastSeenAt: state.lastSeenAt,
          joinedAt: state.joinedAt,
          lastProfileAt: latestProfile[0]?.recordedAt,
        };
      }),
    );
    const events = eventRows.map((event) => ({
      recordedAt: event.recordedAt,
      playerTag: event.playerTag,
      playerName: event.playerName,
      type: event.type,
      fromRole: event.fromRole,
      toRole: event.toRole,
      fromTrophies: event.fromTrophies,
      toTrophies: event.toTrophies,
      trophyDelta: event.trophyDelta,
    }));

    return {
      trackedSinceAt: directory?.trackedSinceAt,
      lastSeenAt: directory?.lastSeenAt,
      snapshots: snapshotRows.reverse().map((snapshot) => ({
        day: snapshot.day,
        recordedAt: snapshot.recordedAt,
        name: snapshot.name,
        trophies: snapshot.trophies,
        memberCount: snapshot.memberCount,
        requiredTrophies: snapshot.requiredTrophies,
      })),
      events,
      roster,
      summary: {
        joins: events.filter((event) => event.type === "join").length,
        leaves: events.filter((event) => event.type === "leave").length,
        roleChanges: events.filter((event) => event.type === "role_change").length,
        trophyChange: events.reduce((total, event) => total + (event.trophyDelta ?? 0), 0),
        activeMembers: roster.length,
      },
    };
  },
});

export const communityActivity = query({
  args: { limit: v.optional(v.number()), now: v.optional(v.number()) },
  returns: v.object({
    clubs: v.array(v.object({
      tag: v.string(),
      name: v.string(),
      badgeId: v.optional(v.number()),
      trophies: v.number(),
      memberCount: v.number(),
      trackedSinceAt: v.number(),
      lastSeenAt: v.number(),
      activity7d: v.number(),
      trophyChange7d: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 20), 1), 50);
    // Caller-supplied time keeps the query deterministic for caching.
    const cutoff = Math.min(args.now ?? Date.now(), Date.now()) - 7 * 86_400_000;
    const directories = await ctx.db
      .query("brawlClubDirectory")
      .withIndex("by_last_seen_at")
      .order("desc")
      .take(limit);
    const clubs = await Promise.all(
      directories.map(async (club) => {
        const events = await ctx.db
          .query("brawlClubActivityEvents")
          .withIndex("by_club_tag_and_recorded_at", (q) =>
            q.eq("clubTag", club.tag).gte("recordedAt", cutoff),
          )
          .take(200);
        return {
          tag: club.tag,
          name: club.name,
          badgeId: club.badgeId,
          trophies: club.trophies,
          memberCount: club.memberCount,
          trackedSinceAt: club.trackedSinceAt,
          lastSeenAt: club.lastSeenAt,
          activity7d: events.length,
          trophyChange7d: events.reduce((total, event) => total + (event.trophyDelta ?? 0), 0),
        };
      }),
    );
    return { clubs };
  },
});
