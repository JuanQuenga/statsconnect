"use node";

import { actionGeneric, anyApi } from "convex/server";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { ConvexError, v } from "convex/values";
import { normalizeTag, tagPath } from "../src/lib/clash/tag";
import type {
  ApiBattle,
  ApiCardList,
  ApiChestList,
  ApiClan,
  ApiClanRanking,
  ApiCurrentRiverRace,
  ApiLeaderboard,
  ApiLocation,
  ApiPaged,
  ApiPlayer,
  ApiPlayerRanking,
  ApiRiverRaceLog,
  ApiTournament,
  CachedPayload,
  CardsPayload,
  ClanBundlePayload,
  ClanSearchPayload,
  ClanWarPayload,
  LeaderboardListPayload,
  LeaderboardPayload,
  LocationsPayload,
  PlayerBundlePayload,
  RankingKind,
  RankingsPayload,
  TournamentsPayload
} from "../src/lib/clash/types";

type CacheKind =
  | "player"
  | "battles"
  | "chests"
  | "clan"
  | "cards"
  | "war"
  | "locations"
  | "rankings"
  | "leaderboards"
  | "leaderboard"
  | "clanSearch"
  | "tournaments";

type CacheDocument = {
  key: string;
  kind: CacheKind;
  payload: string;
  fetchedAt: number;
  expiresAt: number;
  sourceVersion: string;
};

type ApiErrorBody = {
  message?: string;
  reason?: string;
};

const cacheApi = anyApi.cache;
const playersApi = anyApi.players;
type ActionCtx = GenericActionCtx<GenericDataModel>;

/**
 * Adds whoever was just looked up to the name directory, so the next visit can
 * be by name instead of by tag. Best-effort — a directory write must never fail
 * a profile load.
 */
async function rememberPlayers(
  ctx: ActionCtx,
  players: Array<{ tag?: string; name?: string; clanTag?: string; clanName?: string; trophies?: number }>
) {
  const named = players
    .filter((player) => player.tag && player.name)
    .map((player) => ({
      tag: player.tag!.replace(/^#/, ""),
      name: player.name!,
      clanTag: player.clanTag?.replace(/^#/, ""),
      clanName: player.clanName,
      trophies: player.trophies
    }));
  if (!named.length) return;
  try {
    await ctx.runMutation(playersApi.record, { players: named.slice(0, 250) });
  } catch {
    // Ignored on purpose.
  }
}

/**
 * "International" in the /locations list — the pseudo-location used for global
 * rankings. Clients should prefer the id resolved from /locations and only fall
 * back to this constant. 57000000 is Europe, not global.
 */
export const GLOBAL_LOCATION_ID = 57000006;

function normalizeActionTag(input: string) {
  try {
    return normalizeTag(input);
  } catch (error) {
    throw new ConvexError({
      code: "INVALID_TAG",
      message: error instanceof Error ? error.message : "Enter a valid Clash Royale tag."
    });
  }
}

function cacheTtlMs() {
  const seconds = Number(process.env.CLASH_ROYALE_CACHE_TTL_SECONDS ?? 900);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 900_000;
}

function cachedPayload<T>(document: CacheDocument, stale = false): CachedPayload<T> {
  return {
    data: JSON.parse(document.payload) as T,
    fetchedAt: document.fetchedAt,
    stale
  };
}

function apiErrorMessage(status: number, body: ApiErrorBody) {
  if (status === 400) return "That tag is not valid.";
  if (status === 403) return "The Clash Royale API rejected this server. Check the API token and its allowed IP address.";
  if (status === 404) return "No Clash Royale profile was found for that tag.";
  if (status === 429) return "The Clash Royale API rate limit was reached. Try again shortly.";
  if (status >= 500) return "The Clash Royale API is temporarily unavailable.";
  return body.message ?? body.reason ?? "The Clash Royale API request failed.";
}

async function fetchClash<T>(ctx: ActionCtx, endpoint: string) {
  const token = process.env.CLASH_ROYALE_API_TOKEN;
  if (!token) {
    throw new ConvexError({
      code: "MISSING_API_TOKEN",
      message: "Add CLASH_ROYALE_API_TOKEN to the Convex deployment environment."
    });
  }

  const baseUrl = (process.env.CLASH_ROYALE_API_BASE_URL ?? "https://api.clashroyale.com/v1").replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
  } catch {
    throw new ConvexError({
      code: "CLASH_API_NETWORK",
      message: "The Clash Royale API could not be reached from the backend."
    });
  }

  await ctx.runMutation(cacheApi.logFetch, {
    endpoint,
    status: response.status,
    ok: response.ok,
    fetchedAt: Date.now()
  });

  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = {};
    }
    throw new ConvexError({
      code: `CLASH_API_${response.status}`,
      status: response.status,
      message: apiErrorMessage(response.status, body)
    });
  }

  return (await response.json()) as T;
}

async function saveCache(
  ctx: ActionCtx,
  key: string,
  kind: CacheKind,
  data: unknown,
  profile?: { kind: "player" | "clan"; tag: string; name: string; value: number }
) {
  const fetchedAt = Date.now();
  await ctx.runMutation(cacheApi.put, {
    key,
    kind,
    payload: JSON.stringify(data),
    fetchedAt,
    expiresAt: fetchedAt + cacheTtlMs(),
    profile
  });
  return fetchedAt;
}

export const getPlayerBundle = actionGeneric({
  args: { tag: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<PlayerBundlePayload> => {
    const tag = normalizeActionTag(args.tag);
    const keys = {
      player: `player:${tag}`,
      battles: `battles:${tag}`,
      chests: `chests:${tag}`
    };
    const [playerCache, battleCache, chestCache] = (await Promise.all([
      ctx.runQuery(cacheApi.get, { key: keys.player }),
      ctx.runQuery(cacheApi.get, { key: keys.battles }),
      ctx.runQuery(cacheApi.get, { key: keys.chests })
    ])) as [CacheDocument | null, CacheDocument | null, CacheDocument | null];

    const allCached = playerCache && battleCache && chestCache;
    const allFresh = allCached && [playerCache, battleCache, chestCache].every((item) => item.expiresAt > Date.now());

    if (allFresh && !args.force) {
      return {
        player: cachedPayload<ApiPlayer>(playerCache),
        battles: cachedPayload<ApiBattle[]>(battleCache),
        chests: cachedPayload<ApiChestList>(chestCache)
      };
    }

    try {
      const encodedTag = tagPath(tag);
      const [player, battles, chests] = await Promise.all([
        fetchClash<ApiPlayer>(ctx, `/players/${encodedTag}`),
        fetchClash<ApiBattle[]>(ctx, `/players/${encodedTag}/battlelog`),
        fetchClash<ApiChestList>(ctx, `/players/${encodedTag}/upcomingchests`)
      ]);
      const [playerFetchedAt, battlesFetchedAt, chestsFetchedAt] = await Promise.all([
        saveCache(ctx, keys.player, "player", player, {
          kind: "player",
          tag,
          name: player.name,
          value: player.trophies ?? 0
        }),
        saveCache(ctx, keys.battles, "battles", battles),
        saveCache(ctx, keys.chests, "chests", chests)
      ]);

      // The looked-up player plus everyone they recently fought. One tag typed
      // in the search box makes fifty players findable by name.
      await rememberPlayers(ctx, [
        { tag: player.tag, name: player.name, clanTag: player.clan?.tag, clanName: player.clan?.name, trophies: player.trophies },
        ...(battles ?? []).flatMap((battle) =>
          [...(battle.team ?? []), ...(battle.opponent ?? [])].map((participant) => ({
            tag: participant.tag,
            name: participant.name,
            clanTag: participant.clan?.tag,
            clanName: participant.clan?.name,
            trophies: participant.startingTrophies
          }))
        )
      ]);

      return {
        player: { data: player, fetchedAt: playerFetchedAt, stale: false },
        battles: { data: battles, fetchedAt: battlesFetchedAt, stale: false },
        chests: { data: chests, fetchedAt: chestsFetchedAt, stale: false }
      };
    } catch (error) {
      if (allCached) {
        return {
          player: cachedPayload<ApiPlayer>(playerCache, true),
          battles: cachedPayload<ApiBattle[]>(battleCache, true),
          chests: cachedPayload<ApiChestList>(chestCache, true)
        };
      }
      throw error;
    }
  }
});

export const getClanBundle = actionGeneric({
  args: { tag: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<ClanBundlePayload> => {
    const tag = normalizeActionTag(args.tag);
    const key = `clan:${tag}`;
    const cached = (await ctx.runQuery(cacheApi.get, { key })) as CacheDocument | null;

    if (cached && cached.expiresAt > Date.now() && !args.force) {
      return { clan: cachedPayload<ApiClan>(cached) };
    }

    try {
      const clan = await fetchClash<ApiClan>(ctx, `/clans/${tagPath(tag)}`);
      const fetchedAt = await saveCache(ctx, key, "clan", clan, {
        kind: "clan",
        tag,
        name: clan.name,
        value: clan.clanScore ?? 0
      });
      // A roster is the largest batch of names the API hands over in one call.
      await rememberPlayers(
        ctx,
        (clan.memberList ?? []).map((member) => ({
          tag: member.tag,
          name: member.name,
          clanTag: clan.tag,
          clanName: clan.name,
          trophies: member.trophies
        }))
      );
      return { clan: { data: clan, fetchedAt, stale: false } };
    } catch (error) {
      if (cached) return { clan: cachedPayload<ApiClan>(cached, true) };
      throw error;
    }
  }
});

export const getCards = actionGeneric({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<CardsPayload> => {
    const key = "cards:global";
    const cached = (await ctx.runQuery(cacheApi.get, { key })) as CacheDocument | null;

    if (cached && cached.expiresAt > Date.now() && !args.force) {
      return { cards: cachedPayload<ApiCardList>(cached) };
    }

    try {
      const cards = await fetchClash<ApiCardList>(ctx, "/cards");
      const fetchedAt = await saveCache(ctx, key, "cards", cards);
      return { cards: { data: cards, fetchedAt, stale: false } };
    } catch (error) {
      if (cached) return { cards: cachedPayload<ApiCardList>(cached, true) };
      throw error;
    }
  }
});

/**
 * Generic read-through cache for endpoints that take no tag and return a list.
 * Falls back to stale data whenever the upstream call fails, matching the
 * behaviour of the player/clan bundles.
 */
async function cachedFetch<T>(
  ctx: ActionCtx,
  options: { key: string; kind: CacheKind; endpoint: string; force?: boolean; ttlMs?: number }
): Promise<CachedPayload<T>> {
  const cached = (await ctx.runQuery(cacheApi.get, { key: options.key })) as CacheDocument | null;

  if (cached && cached.expiresAt > Date.now() && !options.force) {
    return cachedPayload<T>(cached);
  }

  try {
    const data = await fetchClash<T>(ctx, options.endpoint);
    const fetchedAt = Date.now();
    await ctx.runMutation(cacheApi.put, {
      key: options.key,
      kind: options.kind,
      payload: JSON.stringify(data),
      fetchedAt,
      expiresAt: fetchedAt + (options.ttlMs ?? cacheTtlMs())
    });
    return { data, fetchedAt, stale: false };
  } catch (error) {
    if (cached) return cachedPayload<T>(cached, true);
    throw error;
  }
}

/** Clan Wars 2. Both endpoints 404 for clans that have never entered a river race. */
export const getClanWar = actionGeneric({
  args: { tag: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<ClanWarPayload> => {
    const tag = normalizeActionTag(args.tag);
    const encoded = tagPath(tag);

    // A clan with no war history is a normal state, not an error, so each half
    // degrades to null independently rather than failing the whole page.
    const [currentRace, raceLog] = await Promise.all([
      cachedFetch<ApiCurrentRiverRace>(ctx, {
        key: `war:current:${tag}`,
        kind: "war",
        endpoint: `/clans/${encoded}/currentriverrace`,
        force: args.force
      }).catch(() => null),
      cachedFetch<ApiRiverRaceLog>(ctx, {
        key: `war:log:${tag}`,
        kind: "war",
        endpoint: `/clans/${encoded}/riverracelog`,
        force: args.force
      }).catch(() => null)
    ]);

    const empty = <T,>(): CachedPayload<T | null> => ({ data: null, fetchedAt: Date.now(), stale: false });

    return {
      currentRace: currentRace ?? empty<ApiCurrentRiverRace>(),
      raceLog: raceLog ?? empty<ApiRiverRaceLog>()
    };
  }
});

/** Countries and regions used to scope every ranking. Changes rarely, so cache for a day. */
export const getLocations = actionGeneric({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<LocationsPayload> => ({
    locations: await cachedFetch<ApiPaged<ApiLocation>>(ctx, {
      key: "locations:all",
      kind: "locations",
      endpoint: "/locations?limit=300",
      force: args.force,
      ttlMs: 24 * 60 * 60 * 1000
    })
  })
});

const rankingKind = v.union(v.literal("players"), v.literal("clans"), v.literal("clanwars"));

/** Trophy-ladder rankings, scoped to a location. Location 57000006 is "Global". */
export const getRankings = actionGeneric({
  args: {
    kind: rankingKind,
    locationId: v.optional(v.number()),
    limit: v.optional(v.number()),
    force: v.optional(v.boolean())
  },
  handler: async (ctx, args): Promise<RankingsPayload> => {
    const locationId = args.locationId ?? GLOBAL_LOCATION_ID;
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 1000);
    const kind = args.kind as RankingKind;

    return {
      kind,
      locationId,
      rankings: await cachedFetch<ApiPaged<ApiPlayerRanking | ApiClanRanking>>(ctx, {
        key: `rankings:${kind}:${locationId}:${limit}`,
        kind: "rankings",
        endpoint: `/locations/${locationId}/rankings/${kind}?limit=${limit}`,
        force: args.force
      })
    };
  }
});

/** Path of Legends seasons. Each entry's id feeds getLeaderboard below. */
export const getLeaderboards = actionGeneric({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<LeaderboardListPayload> => ({
    leaderboards: await cachedFetch<ApiPaged<ApiLeaderboard>>(ctx, {
      key: "leaderboards:all",
      kind: "leaderboards",
      endpoint: "/leaderboards",
      force: args.force,
      ttlMs: 6 * 60 * 60 * 1000
    })
  })
});

export const getLeaderboard = actionGeneric({
  args: { leaderboardId: v.number(), limit: v.optional(v.number()), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<LeaderboardPayload> => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 1000);
    return {
      leaderboard: await cachedFetch<ApiPaged<ApiPlayerRanking>>(ctx, {
        key: `leaderboard:${args.leaderboardId}:${limit}`,
        kind: "leaderboard",
        endpoint: `/leaderboard/${args.leaderboardId}?limit=${limit}`,
        force: args.force
      })
    };
  }
});

/**
 * Clan search. The official API has no equivalent for players — player lookup
 * is exact-tag only — so the UI must not offer player search by name.
 */
export const searchClans = actionGeneric({
  args: {
    name: v.optional(v.string()),
    locationId: v.optional(v.number()),
    minMembers: v.optional(v.number()),
    maxMembers: v.optional(v.number()),
    minScore: v.optional(v.number()),
    limit: v.optional(v.number()),
    force: v.optional(v.boolean())
  },
  handler: async (ctx, args): Promise<ClanSearchPayload> => {
    const name = args.name?.trim() ?? "";
    if (name.length > 0 && name.length < 3) {
      throw new ConvexError({ code: "SEARCH_TOO_SHORT", message: "Enter at least three characters to search clans." });
    }

    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (args.locationId) params.set("locationId", String(args.locationId));
    if (args.minMembers) params.set("minMembers", String(args.minMembers));
    if (args.maxMembers) params.set("maxMembers", String(args.maxMembers));
    if (args.minScore) params.set("minScore", String(args.minScore));
    params.set("limit", String(Math.min(Math.max(args.limit ?? 30, 1), 100)));

    if (!name && !args.locationId && !args.minMembers && !args.maxMembers && !args.minScore) {
      throw new ConvexError({
        code: "SEARCH_EMPTY",
        message: "Add a clan name or at least one filter to search."
      });
    }

    return {
      results: await cachedFetch<ApiPaged<ApiClan>>(ctx, {
        key: `clanSearch:${params.toString()}`,
        kind: "clanSearch",
        endpoint: `/clans?${params.toString()}`,
        force: args.force,
        ttlMs: 5 * 60 * 1000
      })
    };
  }
});

/** Supercell-run Global Tournaments (roughly two per month). */
export const getGlobalTournaments = actionGeneric({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<TournamentsPayload> => ({
    tournaments: await cachedFetch<ApiPaged<ApiTournament>>(ctx, {
      key: "tournaments:global",
      kind: "tournaments",
      endpoint: "/globaltournaments",
      force: args.force,
      ttlMs: 30 * 60 * 1000
    })
  })
});

/** Open community tournaments, searched by name. */
export const searchTournaments = actionGeneric({
  args: { name: v.string(), limit: v.optional(v.number()), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<TournamentsPayload> => {
    const name = args.name.trim();
    if (name.length < 3) {
      throw new ConvexError({
        code: "SEARCH_TOO_SHORT",
        message: "Enter at least three characters to search tournaments."
      });
    }
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
    return {
      tournaments: await cachedFetch<ApiPaged<ApiTournament>>(ctx, {
        key: `tournaments:search:${name.toLowerCase()}:${limit}`,
        kind: "tournaments",
        endpoint: `/tournaments?name=${encodeURIComponent(name)}&limit=${limit}`,
        force: args.force,
        ttlMs: 5 * 60 * 1000
      })
    };
  }
});
