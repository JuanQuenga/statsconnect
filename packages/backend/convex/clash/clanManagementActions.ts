"use node";

import { anyApi } from "convex/server";
import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import {
  clashData,
  clashUpstream,
  ClashUpstreamError,
  type ClashUpstreamResponse,
} from "./clashFetch";
import { normalizeTag } from "./lib/tag";
import type {
  ApiClanMember,
  ApiCurrentRiverRace,
  ApiRiverRaceClan,
  ApiRiverRaceLog,
  ApiRiverRaceParticipant
} from "./lib/types";

const managementApi = anyApi.clash.clanManagement;
const MAX_HISTORY_WEEKS = 7;

type PrepareResult = { shouldObserve: boolean; lastObservedAt: number | null };
type ObserveResult = { observed: boolean; observedAt: number | null };

type ObservationMember = {
  tag: string;
  name: string;
  role: string;
  trophies: number;
  donations: number;
  donationsReceived: number;
  lastSeenAt?: number;
};

type WarWeek = {
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

function optionalWarData<T>(response: ClashUpstreamResponse<T>): T | null {
  if (response.ok) return response.data;
  if (response.kind === "http" && response.status === 404) return null;
  throw new ClashUpstreamError(response);
}

function parseApiTimestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.(\d{3}))?Z$/);
  if (compact) {
    return Date.UTC(
      Number(compact[1]),
      Number(compact[2]) - 1,
      Number(compact[3]),
      Number(compact[4]),
      Number(compact[5]),
      Number(compact[6]),
      Number(compact[7] ?? 0)
    );
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function cleanMember(member: ApiClanMember): ObservationMember | null {
  if (!member.tag || !member.name) return null;
  return {
    tag: member.tag.replace(/^#/, "").toUpperCase(),
    name: member.name,
    role: member.role ?? "member",
    trophies: member.trophies ?? 0,
    donations: member.donations ?? 0,
    donationsReceived: member.donationsReceived ?? 0,
    lastSeenAt: parseApiTimestamp(member.lastSeen)
  };
}

function cleanParticipants(participants?: ApiRiverRaceParticipant[]): WarWeek["members"] {
  return (participants ?? []).flatMap((member) => {
    if (!member.tag || !member.name) return [];
    return [{
      tag: member.tag.replace(/^#/, "").toUpperCase(),
      name: member.name,
      fame: member.fame ?? 0,
      repairPoints: member.repairPoints ?? 0,
      boatAttacks: member.boatAttacks ?? 0,
      decksUsed: member.decksUsed ?? 0,
      decksUsedToday: member.decksUsedToday
    }];
  });
}

function currentWeekKey(observedAt: number): string {
  const date = new Date(observedAt);
  const utcDay = date.getUTCDay() || 7;
  const monday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - utcDay + 1);
  return `current:${monday}`;
}

function ownClan(clans: ApiRiverRaceClan[] | undefined, clanTag: string): ApiRiverRaceClan | undefined {
  return clans?.find((clan) => clan.tag?.replace(/^#/, "").toUpperCase() === clanTag);
}

function mapWarWeeks(
  clanTag: string,
  current: ApiCurrentRiverRace | null,
  log: ApiRiverRaceLog | null,
  observedAt: number
): WarWeek[] {
  const weeks: WarWeek[] = [];
  const currentClan = current?.clan?.tag?.replace(/^#/, "").toUpperCase() === clanTag
    ? current.clan
    : ownClan(current?.clans, clanTag);
  if (currentClan) {
    weeks.push({
      weekKey: currentWeekKey(observedAt),
      sectionIndex: current?.sectionIndex,
      completed: false,
      members: cleanParticipants(currentClan.participants)
    });
  }

  for (const entry of (log?.items ?? []).slice(0, MAX_HISTORY_WEEKS)) {
    const clan = ownClan(entry.standings?.map((standing) => standing.clan).filter((item): item is ApiRiverRaceClan => Boolean(item)), clanTag);
    if (!clan || entry.seasonId === undefined || entry.sectionIndex === undefined) continue;
    weeks.push({
      weekKey: `season:${entry.seasonId}:section:${entry.sectionIndex}`,
      seasonId: entry.seasonId,
      sectionIndex: entry.sectionIndex,
      completed: true,
      members: cleanParticipants(clan.participants)
    });
  }
  return weeks;
}

async function observeOne(ctx: ActionCtx, inputTag: string): Promise<ObserveResult> {
  const upstream = clashUpstream(ctx);
  const tag = normalizeTag(inputTag);
  const requestedAt = Date.now();
  const prepared = await ctx.runMutation(managementApi.prepareObservation, { tag, requestedAt }) as PrepareResult;
  if (!prepared.shouldObserve) return { observed: false, observedAt: prepared.lastObservedAt };

  try {
    const [clanResponse, currentResponse, logResponse] = await Promise.all([
      upstream.clan(tag),
      upstream.currentRiverRace(tag),
      upstream.riverRaceLog(tag),
    ]);
    const clan = clashData(clanResponse);
    const current = optionalWarData(currentResponse);
    const log = optionalWarData(logResponse);
    const observedAt = Date.now();
    const members = (clan.memberList ?? []).flatMap((member) => {
      const clean = cleanMember(member);
      return clean ? [clean] : [];
    });
    await ctx.runMutation(managementApi.recordObservation, {
      clan: {
        tag,
        name: clan.name,
        clanScore: clan.clanScore ?? 0,
        warTrophies: clan.clanWarTrophies ?? 0,
        donationsPerWeek: clan.donationsPerWeek ?? 0,
        members
      },
      warWeeks: mapWarWeeks(tag, current, log, observedAt),
      observedAt
    });
    return { observed: true, observedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Clan observation failed.";
    await ctx.runMutation(managementApi.recordObservationFailure, { tag, failedAt: Date.now(), message });
    throw error;
  }
}

export const observe = action({
  args: { tag: v.string() },
  returns: v.object({ observed: v.boolean(), observedAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args): Promise<ObserveResult> => observeOne(ctx, args.tag)
});

export const pollTrackedClans = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const due = await ctx.runQuery(managementApi.dueTrackedClans, { now: Date.now(), limit: 3 }) as Array<{ tag: string }>;
    for (const clan of due) {
      try {
        await observeOne(ctx, clan.tag);
      } catch {
        // Failure state and a one-hour retry were recorded by observeOne.
      }
    }
    return null;
  }
});

export const pruneHistory = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (let batch = 0; batch < 4; batch += 1) {
      const result = await ctx.runMutation(managementApi.pruneSnapshots, { now: Date.now() }) as { hasMore: boolean };
      if (!result.hasMore) break;
    }
    return null;
  }
});
