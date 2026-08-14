import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "../_generated/server";

const SIX_HOURS = 6 * 60 * 60 * 1_000;
const OBSERVATION_LEASE_MS = 15 * 60 * 1_000;
const WATCH_LEASE_MS = 7 * 24 * 60 * 60 * 1_000;
const ON_DEMAND_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1_000;
const RETENTION_MS = 12 * 7 * 24 * 60 * 60 * 1_000;
const MAX_MEMBERS = 50;
const MAX_WAR_WEEKS = 8;

const rosterMember = v.object({
  tag: v.string(),
  name: v.string(),
  role: v.string(),
  trophies: v.number(),
  donations: v.number(),
  donationsReceived: v.number(),
  lastSeenAt: v.optional(v.number())
});

const warWeekMember = v.object({
  tag: v.string(),
  name: v.string(),
  fame: v.number(),
  repairPoints: v.number(),
  boatAttacks: v.number(),
  decksUsed: v.number(),
  decksUsedToday: v.optional(v.number())
});

const warWeek = v.object({
  weekKey: v.string(),
  seasonId: v.optional(v.number()),
  sectionIndex: v.optional(v.number()),
  completed: v.boolean(),
  members: v.array(warWeekMember)
});

const attention = v.union(v.literal("recognition"), v.literal("checkIn"), v.null());
const eventKind = v.union(
  v.literal("joined"),
  v.literal("left"),
  v.literal("roleChanged"),
  v.literal("becameInactive"),
  v.literal("warDecksMissed")
);

const dashboardMember = v.object({
  tag: v.string(),
  name: v.string(),
  role: v.string(),
  trophies: v.number(),
  trophyChange: v.number(),
  donations: v.number(),
  donationChange: v.number(),
  donationsReceived: v.number(),
  lastSeenAt: v.union(v.number(), v.null()),
  joinedObservedAt: v.number(),
  inactivityDays: v.union(v.number(), v.null()),
  warWeeksObserved: v.number(),
  warWeeksParticipated: v.number(),
  participationConsistency: v.union(v.number(), v.null()),
  recentFame: v.union(v.number(), v.null()),
  recentRepairPoints: v.union(v.number(), v.null()),
  recentBoatAttacks: v.union(v.number(), v.null()),
  recentDecksUsed: v.union(v.number(), v.null()),
  recentMissedDecks: v.union(v.number(), v.null()),
  fameTrend: v.union(v.number(), v.null()),
  attention,
  attentionReasons: v.array(v.string())
});

const dashboardEvent = v.object({
  id: v.string(),
  observedAt: v.number(),
  kind: eventKind,
  memberTag: v.string(),
  memberName: v.string(),
  summary: v.string(),
  detail: v.string()
});

const dashboardWeek = v.object({
  weekKey: v.string(),
  completed: v.boolean(),
  seasonId: v.union(v.number(), v.null()),
  sectionIndex: v.union(v.number(), v.null()),
  firstObservedAt: v.number(),
  lastObservedAt: v.number()
});

const dashboardResult = v.union(
  v.null(),
  v.object({
    clan: v.object({
      tag: v.string(),
      name: v.union(v.string(), v.null()),
      trackingStartedAt: v.number(),
      lastObservedAt: v.union(v.number(), v.null()),
      nextObservationAt: v.number(),
      observationCount: v.number(),
      consecutiveFailures: v.number(),
      lastError: v.union(v.string(), v.null()),
      watchExpiresAt: v.union(v.number(), v.null())
    }),
    observationWindow: v.object({
      firstObservedAt: v.union(v.number(), v.null()),
      lastObservedAt: v.union(v.number(), v.null()),
      retainedWeeks: v.number(),
      snapshotsRead: v.number()
    }),
    members: v.array(dashboardMember),
    events: v.array(dashboardEvent),
    weeks: v.array(dashboardWeek)
  })
);

type ObservationMember = {
  tag: string;
  name: string;
  role: string;
  trophies: number;
  donations: number;
  donationsReceived: number;
  lastSeenAt?: number;
};

type ObservationWeek = {
  weekKey: string;
  seasonId?: number;
  sectionIndex?: number;
  completed: boolean;
  members: Array<{
    tag: string;
    name: string;
    fame: number;
    repairPoints: number;
    boatAttacks: number;
    decksUsed: number;
    decksUsedToday?: number;
  }>;
};

function positiveObservationDelta(current: number, previous: number): number {
  return current >= previous ? current - previous : current;
}

function roleLabel(role: string): string {
  return role.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

export const prepareObservation = internalMutation({
  args: {
    tag: v.string(),
    requestedAt: v.number(),
    demand: v.union(v.literal("oneOff"), v.literal("watch"), v.literal("scheduled"))
  },
  returns: v.object({ shouldObserve: v.boolean(), lastObservedAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("clashTrackedClans")
      .withIndex("by_tag", (q) => q.eq("tag", args.tag))
      .unique();

    if (args.demand === "scheduled" && (!existing?.watchExpiresAt || existing.watchExpiresAt <= args.requestedAt)) {
      return { shouldObserve: false, lastObservedAt: existing?.lastObservedAt ?? null };
    }

    const watchPatch = args.demand === "watch"
      ? { watchExpiresAt: args.requestedAt + WATCH_LEASE_MS, watchTier: 0 }
      : {};
    if (existing && existing.nextObservationAt > args.requestedAt) {
      if (args.demand === "watch") {
        await ctx.db.patch(existing._id, {
          ...watchPatch,
          retainUntil: args.requestedAt + ON_DEMAND_RETENTION_MS
        });
      }
      return { shouldObserve: false, lastObservedAt: existing.lastObservedAt ?? null };
    }

    const leaseUntil = args.requestedAt + OBSERVATION_LEASE_MS;
    if (existing) {
      await ctx.db.patch("clashTrackedClans", existing._id, {
        ...watchPatch,
        nextObservationAt: leaseUntil,
        leaseUntil,
        retainUntil: args.requestedAt + ON_DEMAND_RETENTION_MS,
        lastError: undefined
      });
      return { shouldObserve: true, lastObservedAt: existing.lastObservedAt ?? null };
    }

    await ctx.db.insert("clashTrackedClans", {
      tag: args.tag,
      trackingStartedAt: args.requestedAt,
      nextObservationAt: leaseUntil,
      leaseUntil,
      retainUntil: args.requestedAt + ON_DEMAND_RETENTION_MS,
      ...watchPatch,
      observationCount: 0,
      consecutiveFailures: 0
    });
    return { shouldObserve: true, lastObservedAt: null };
  }
});

export const dueTrackedClans = internalQuery({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(v.object({ tag: v.string() })),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(10, Math.floor(args.limit)));
    const rows = await ctx.db
      .query("clashTrackedClans")
      .withIndex("by_watch_tier_and_next_observation_at", (q) =>
        q.eq("watchTier", 0).lte("nextObservationAt", args.now)
      )
      .take(Math.min(50, limit * 5));
    return rows
      .filter((row) => (row.watchExpiresAt ?? 0) > args.now && (row.leaseUntil ?? 0) <= args.now)
      .slice(0, limit)
      .map((row) => ({ tag: row.tag }));
  }
});

export const recordObservationFailure = internalMutation({
  args: { tag: v.string(), failedAt: v.number(), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tracked = await ctx.db.query("clashTrackedClans").withIndex("by_tag", (q) => q.eq("tag", args.tag)).unique();
    if (tracked) {
      await ctx.db.patch("clashTrackedClans", tracked._id, {
        consecutiveFailures: tracked.consecutiveFailures + 1,
        lastError: args.message.slice(0, 240),
        nextObservationAt: args.failedAt + 60 * 60 * 1_000
      });
    }
    return null;
  }
});

export const recordObservation = internalMutation({
  args: {
    clan: v.object({
      tag: v.string(),
      name: v.string(),
      clanScore: v.number(),
      warTrophies: v.number(),
      donationsPerWeek: v.number(),
      members: v.array(rosterMember)
    }),
    warWeeks: v.array(warWeek),
    observedAt: v.number()
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const clanTag = args.clan.tag;
    const members = args.clan.members.slice(0, MAX_MEMBERS);
    const previousSnapshot = await ctx.db
      .query("clashClanRosterSnapshots")
      .withIndex("by_clan_tag_and_observed_at", (q) => q.eq("clanTag", clanTag))
      .order("desc")
      .first();
    const activeRows = await ctx.db
      .query("clashClanActiveMembers")
      .withIndex("by_clan_tag_and_member_tag", (q) => q.eq("clanTag", clanTag))
      .take(MAX_MEMBERS + 1);
    const activeByTag = new Map(activeRows.map((row) => [row.memberTag, row]));
    const observedTags = new Set(members.map((member) => member.tag));

    await ctx.db.insert("clashClanRosterSnapshots", {
      clanTag,
      clanName: args.clan.name,
      observedAt: args.observedAt,
      memberCount: members.length,
      clanScore: args.clan.clanScore,
      warTrophies: args.clan.warTrophies,
      donationsPerWeek: args.clan.donationsPerWeek,
      donationsChange: previousSnapshot
        ? positiveObservationDelta(args.clan.donationsPerWeek, previousSnapshot.donationsPerWeek)
        : undefined
    });

    for (const member of members) {
      const previous = activeByTag.get(member.tag);
      const trophyChange = previous ? member.trophies - previous.trophies : 0;
      const donationChange = previous ? positiveObservationDelta(member.donations, previous.donations) : 0;
      const inactiveSince = member.lastSeenAt !== undefined && args.observedAt - member.lastSeenAt >= SEVEN_DAYS
        ? member.lastSeenAt
        : undefined;

      await ctx.db.insert("clashClanMemberSnapshots", {
        clanTag,
        observedAt: args.observedAt,
        memberTag: member.tag,
        name: member.name,
        role: member.role,
        trophies: member.trophies,
        trophyChange: previous ? trophyChange : undefined,
        donations: member.donations,
        donationChange: previous ? donationChange : undefined,
        donationsReceived: member.donationsReceived,
        lastSeenAt: member.lastSeenAt
      });

      if (!previous) {
        await ctx.db.insert("clashClanActiveMembers", {
          clanTag,
          memberTag: member.tag,
          name: member.name,
          role: member.role,
          trophies: member.trophies,
          trophyChange: 0,
          donations: member.donations,
          donationChange: 0,
          donationsReceived: member.donationsReceived,
          lastSeenAt: member.lastSeenAt,
          joinedObservedAt: args.observedAt,
          lastObservedAt: args.observedAt,
          inactiveSince
        });
        if (previousSnapshot) {
          await ctx.db.insert("clashClanManagementEvents", {
            clanTag,
            observedAt: args.observedAt,
            kind: "joined",
            memberTag: member.tag,
            memberName: member.name,
            summary: `${member.name} joined the observed roster`,
            detail: "Detected by comparing consecutive roster observations."
          });
        }
        continue;
      }

      if (previous.role !== member.role) {
        await ctx.db.insert("clashClanManagementEvents", {
          clanTag,
          observedAt: args.observedAt,
          kind: "roleChanged",
          memberTag: member.tag,
          memberName: member.name,
          summary: `${member.name}'s role changed`,
          detail: `${roleLabel(previous.role)} → ${roleLabel(member.role)} between observations.`
        });
      }
      if (inactiveSince !== undefined && previous.inactiveSince === undefined) {
        await ctx.db.insert("clashClanManagementEvents", {
          clanTag,
          observedAt: args.observedAt,
          kind: "becameInactive",
          memberTag: member.tag,
          memberName: member.name,
          summary: `${member.name} crossed the 7-day inactivity marker`,
          detail: "This is an attention signal based on the API's last-seen timestamp, not an official recommendation."
        });
      }
      await ctx.db.patch("clashClanActiveMembers", previous._id, {
        name: member.name,
        role: member.role,
        trophies: member.trophies,
        trophyChange,
        donations: member.donations,
        donationChange,
        donationsReceived: member.donationsReceived,
        lastSeenAt: member.lastSeenAt,
        lastObservedAt: args.observedAt,
        inactiveSince
      });
    }

    for (const previous of activeRows) {
      if (observedTags.has(previous.memberTag)) continue;
      await ctx.db.delete("clashClanActiveMembers", previous._id);
      await ctx.db.insert("clashClanManagementEvents", {
        clanTag,
        observedAt: args.observedAt,
        kind: "left",
        memberTag: previous.memberTag,
        memberName: previous.name,
        summary: `${previous.name} left the observed roster`,
        detail: "Detected by comparing consecutive roster observations. Transfers and removals look identical in the public API."
      });
    }

    for (const week of args.warWeeks.slice(0, MAX_WAR_WEEKS)) {
      for (const member of week.members.slice(0, MAX_MEMBERS)) {
        const existing = await ctx.db
          .query("clashClanWarMemberWeeks")
          .withIndex("by_clan_tag_and_week_key_and_member_tag", (q) =>
            q.eq("clanTag", clanTag).eq("weekKey", week.weekKey).eq("memberTag", member.tag)
          )
          .unique();
        const missedDecks = week.completed ? Math.max(0, 16 - member.decksUsed) : undefined;
        const values = {
          memberName: member.name,
          seasonId: week.seasonId,
          sectionIndex: week.sectionIndex,
          completed: week.completed,
          fame: member.fame,
          repairPoints: member.repairPoints,
          boatAttacks: member.boatAttacks,
          decksUsed: member.decksUsed,
          decksUsedToday: member.decksUsedToday,
          missedDecks,
          lastObservedAt: args.observedAt
        };
        if (existing) {
          await ctx.db.patch("clashClanWarMemberWeeks", existing._id, values);
        } else {
          await ctx.db.insert("clashClanWarMemberWeeks", {
            clanTag,
            weekKey: week.weekKey,
            memberTag: member.tag,
            firstObservedAt: args.observedAt,
            ...values
          });
        }
      }
    }

    const tracked = await ctx.db.query("clashTrackedClans").withIndex("by_tag", (q) => q.eq("tag", clanTag)).unique();
    if (tracked) {
      await ctx.db.patch("clashTrackedClans", tracked._id, {
        name: args.clan.name,
        lastObservedAt: args.observedAt,
        nextObservationAt: args.observedAt + SIX_HOURS,
        leaseUntil: undefined,
        retainUntil: args.observedAt + ON_DEMAND_RETENTION_MS,
        observationCount: tracked.observationCount + 1,
        consecutiveFailures: 0,
        lastError: undefined
      });
    }
    return null;
  }
});

export const dashboard = query({
  args: { tag: v.string(), now: v.number() },
  returns: dashboardResult,
  handler: async (ctx, args) => {
    const tag = args.tag.replace(/^#/, "").toUpperCase();
    const tracked = await ctx.db.query("clashTrackedClans").withIndex("by_tag", (q) => q.eq("tag", tag)).unique();
    if (!tracked) return null;

    const [memberRows, eventRows, weekRows, snapshotRows] = await Promise.all([
      ctx.db
        .query("clashClanActiveMembers")
        .withIndex("by_clan_tag_and_member_tag", (q) => q.eq("clanTag", tag))
        .take(MAX_MEMBERS + 1),
      ctx.db
        .query("clashClanManagementEvents")
        .withIndex("by_clan_tag_and_observed_at", (q) => q.eq("clanTag", tag))
        .order("desc")
        .take(100),
      ctx.db
        .query("clashClanWarMemberWeeks")
        .withIndex("by_clan_tag_and_member_tag", (q) => q.eq("clanTag", tag))
        .take(MAX_MEMBERS * MAX_WAR_WEEKS),
      ctx.db
        .query("clashClanRosterSnapshots")
        .withIndex("by_clan_tag_and_observed_at", (q) => q.eq("clanTag", tag))
        .order("desc")
        .take(48)
    ]);

    const weeksByMember = new Map<string, typeof weekRows>();
    for (const week of weekRows) {
      const rows = weeksByMember.get(week.memberTag) ?? [];
      rows.push(week);
      weeksByMember.set(week.memberTag, rows);
    }

    const now = args.now;
    const members = memberRows.map((member) => {
      const allWeeks = (weeksByMember.get(member.memberTag) ?? []).sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const seasonDifference = (b.seasonId ?? -1) - (a.seasonId ?? -1);
        if (seasonDifference !== 0) return seasonDifference;
        const sectionDifference = (b.sectionIndex ?? -1) - (a.sectionIndex ?? -1);
        return sectionDifference || b.lastObservedAt - a.lastObservedAt;
      });
      const completedWeeks = allWeeks.filter((week) => week.completed).slice(0, MAX_WAR_WEEKS);
      const participated = completedWeeks.filter((week) => week.decksUsed > 0).length;
      const recent = allWeeks[0];
      const recentCompleted = completedWeeks[0];
      const priorCompleted = completedWeeks[1];
      const inactivityDays = member.lastSeenAt === undefined ? null : Math.max(0, Math.floor((now - member.lastSeenAt) / 86_400_000));
      const consistency = completedWeeks.length ? participated / completedWeeks.length : null;
      const reasons: string[] = [];
      let memberAttention: "recognition" | "checkIn" | null = null;

      if (inactivityDays !== null && inactivityDays >= 7) reasons.push(`Last seen ${inactivityDays} days ago`);
      if (recentCompleted?.missedDecks !== undefined && recentCompleted.missedDecks >= 8) {
        reasons.push(`${recentCompleted.missedDecks} unused decks in the latest completed observed week`);
      }
      if (consistency !== null && completedWeeks.length >= 2 && consistency < 0.5) {
        reasons.push(`Participated in ${participated} of ${completedWeeks.length} observed completed weeks`);
      }
      if (reasons.length) {
        memberAttention = member.role === "leader" ? null : "checkIn";
        if (memberAttention === null) reasons.length = 0;
      } else {
        if (member.donationChange >= 50) reasons.push(`+${member.donationChange} donations since the prior observation`);
        if (consistency !== null && completedWeeks.length >= 2 && consistency >= 0.75) {
          reasons.push(`Participated in ${participated} of ${completedWeeks.length} observed completed weeks`);
        }
        if (member.role === "member" && reasons.length >= 2) memberAttention = "recognition";
        if (memberAttention === null) reasons.length = 0;
      }

      return {
        tag: member.memberTag,
        name: member.name,
        role: roleLabel(member.role),
        trophies: member.trophies,
        trophyChange: member.trophyChange,
        donations: member.donations,
        donationChange: member.donationChange,
        donationsReceived: member.donationsReceived,
        lastSeenAt: member.lastSeenAt ?? null,
        joinedObservedAt: member.joinedObservedAt,
        inactivityDays,
        warWeeksObserved: completedWeeks.length,
        warWeeksParticipated: participated,
        participationConsistency: consistency,
        recentFame: recent?.fame ?? null,
        recentRepairPoints: recent?.repairPoints ?? null,
        recentBoatAttacks: recent?.boatAttacks ?? null,
        recentDecksUsed: recent?.decksUsed ?? null,
        recentMissedDecks: recentCompleted?.missedDecks ?? null,
        fameTrend: recentCompleted && priorCompleted ? recentCompleted.fame - priorCompleted.fame : null,
        attention: memberAttention,
        attentionReasons: reasons
      };
    });

    const distinctWeeks = new Map<string, ObservationWeek & { firstObservedAt: number; lastObservedAt: number }>();
    for (const row of weekRows) {
      const existing = distinctWeeks.get(row.weekKey);
      if (existing) {
        existing.firstObservedAt = Math.min(existing.firstObservedAt, row.firstObservedAt);
        existing.lastObservedAt = Math.max(existing.lastObservedAt, row.lastObservedAt);
      } else {
        distinctWeeks.set(row.weekKey, {
          weekKey: row.weekKey,
          completed: row.completed,
          seasonId: row.seasonId,
          sectionIndex: row.sectionIndex,
          members: [],
          firstObservedAt: row.firstObservedAt,
          lastObservedAt: row.lastObservedAt
        });
      }
    }

    const oldestSnapshot = snapshotRows.at(-1);
    const newestSnapshot = snapshotRows[0];
    return {
      clan: {
        tag: tracked.tag,
        name: tracked.name ?? null,
        trackingStartedAt: tracked.trackingStartedAt,
        lastObservedAt: tracked.lastObservedAt ?? null,
        nextObservationAt: tracked.nextObservationAt,
        observationCount: tracked.observationCount,
        consecutiveFailures: tracked.consecutiveFailures,
        lastError: tracked.lastError ?? null,
        watchExpiresAt: tracked.watchExpiresAt ?? null
      },
      observationWindow: {
        firstObservedAt: oldestSnapshot?.observedAt ?? null,
        lastObservedAt: newestSnapshot?.observedAt ?? null,
        retainedWeeks: 12,
        snapshotsRead: snapshotRows.length
      },
      members,
      events: eventRows.map((event) => ({
        id: event._id,
        observedAt: event.observedAt,
        kind: event.kind,
        memberTag: event.memberTag,
        memberName: event.memberName,
        summary: event.summary,
        detail: event.detail
      })),
      weeks: [...distinctWeeks.values()]
        .sort((a, b) => b.lastObservedAt - a.lastObservedAt)
        .slice(0, MAX_WAR_WEEKS)
        .map((week) => ({
          weekKey: week.weekKey,
          completed: week.completed,
          seasonId: week.seasonId ?? null,
          sectionIndex: week.sectionIndex ?? null,
          firstObservedAt: week.firstObservedAt,
          lastObservedAt: week.lastObservedAt
        }))
    };
  }
});

export const pruneSnapshots = internalMutation({
  args: { now: v.number() },
  returns: v.object({ deleted: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const cutoff = args.now - RETENTION_MS;
    const batches = await Promise.all([
      ctx.db.query("clashClanRosterSnapshots").withIndex("by_observed_at", (q) => q.lt("observedAt", cutoff)).take(100),
      ctx.db.query("clashClanMemberSnapshots").withIndex("by_observed_at", (q) => q.lt("observedAt", cutoff)).take(300),
      ctx.db.query("clashClanManagementEvents").withIndex("by_observed_at", (q) => q.lt("observedAt", cutoff)).take(100),
      ctx.db.query("clashClanWarMemberWeeks").withIndex("by_last_observed_at", (q) => q.lt("lastObservedAt", cutoff)).take(300),
      ctx.db.query("clashTrackedClans").withIndex("by_retain_until", (q) => q.lt("retainUntil", args.now)).take(20)
    ]);
    const staleActiveMembers = (
      await Promise.all(
        batches[4].map((tracked) =>
          ctx.db
            .query("clashClanActiveMembers")
            .withIndex("by_clan_tag_and_member_tag", (q) => q.eq("clanTag", tracked.tag))
            .take(MAX_MEMBERS + 1)
        )
      )
    ).flat();
    const legacyTracking = await ctx.db
      .query("clashTrackedClans")
      .withIndex("by_retain_until", (q) => q.eq("retainUntil", undefined))
      .take(20);
    for (const tracked of legacyTracking) {
      await ctx.db.patch(tracked._id, { retainUntil: args.now + ON_DEMAND_RETENTION_MS });
    }
    const rows = batches.flat();
    for (const row of [...rows, ...staleActiveMembers]) await ctx.db.delete(row._id);
    return {
      deleted: rows.length + staleActiveMembers.length,
      hasMore:
        batches[0].length === 100 ||
        batches[1].length === 300 ||
        batches[2].length === 100 ||
        batches[3].length === 300 ||
        batches[4].length === 20 ||
        legacyTracking.length === 20
    };
  }
});
