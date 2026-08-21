"use node";

import { actionGeneric, anyApi } from "convex/server";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  clashCacheTtlMs,
  clashUpstream,
  GLOBAL_LOCATION_ID,
  type ClashUpstream,
  type ClashUpstreamResponse,
} from "./clashFetch";
import { normalizeTag } from "./lib/tag";
import { playerBattleObservation } from "./lib/battles";
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
} from "./lib/types";

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

const cacheApi = anyApi.clash.cache;
const playersApi = anyApi.clash.players;
const historyApi = anyApi.clash.history;
const metaApi = anyApi.clash.meta;
type ActionCtx = GenericActionCtx<GenericDataModel>;

async function recordPlayerActivity(ctx: ActionCtx, tag: string, battles: ApiBattle[]) {
  try {
    const observations = battles.flatMap((battle) => {
      const observation = playerBattleObservation(battle, tag);
      return observation ? [observation] : [];
    });
    await ctx.runMutation(metaApi.ingestPlayerActivity, { tag, battles: observations });
  } catch {
    // Activity is an enrichment side effect; profile delivery must survive a
    // transient write/schema failure and can retry on the next profile load.
  }
}

function defined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function pathResult(result: ApiPlayer["currentPathOfLegendSeasonResult"]) {
  if (!result) return undefined;
  return defined({ trophies: result.trophies, bestTrophies: result.bestTrophies, rank: result.rank });
}

function compactPlayerSnapshot(player: ApiPlayer) {
  const cards = player.cards;
  const current = pathResult(player.currentPathOfLegendSeasonResult);
  const last = pathResult(player.lastPathOfLegendSeasonResult);
  const best = pathResult(player.bestPathOfLegendSeasonResult);
  return defined({
    tag: player.tag.replace(/^#/, "").toUpperCase(),
    name: player.name,
    trophies: player.trophies,
    bestTrophies: player.bestTrophies,
    expLevel: player.expLevel,
    arenaId: player.arena?.id,
    arenaName: player.arena?.name,
    clanTag: player.clan?.tag?.replace(/^#/, ""),
    clanName: player.clan?.name,
    currentDeck: player.currentDeck?.map((card) => defined({
      id: card.id,
      level: card.level,
      evolutionLevel: card.evolutionLevel
    })),
    collection: cards ? {
      cardsOwned: cards.length,
      totalLevels: cards.reduce((sum, card) => sum + (card.level ?? 0), 0),
      maxedCards: cards.filter((card) => card.level !== undefined && card.maxLevel !== undefined && card.level >= card.maxLevel).length,
      evolvedCards: cards.filter((card) => (card.evolutionLevel ?? 0) > 0).length,
      starLevels: cards.reduce((sum, card) => sum + (card.starLevel ?? 0), 0)
    } : undefined,
    totals: defined({
      wins: player.wins,
      losses: player.losses,
      battleCount: player.battleCount,
      threeCrownWins: player.threeCrownWins,
      challengeCardsWon: player.challengeCardsWon,
      tournamentCardsWon: player.tournamentCardsWon,
      donations: player.donations,
      donationsReceived: player.donationsReceived,
      totalDonations: player.totalDonations,
      warDayWins: player.warDayWins,
      clanCardsCollected: player.clanCardsCollected
    }),
    path: current || last || best ? defined({ current, last, best }) : undefined
  });
}

function compactLeaderboardEntries(rows: Array<ApiPlayerRanking | ApiClanRanking>, kind: RankingKind) {
  return rows.slice(0, 200).map((row, index) => {
    const player = row as ApiPlayerRanking;
    const clan = row as ApiClanRanking;
    return defined({
      rank: row.rank ?? index + 1,
      tag: row.tag.replace(/^#/, "").toUpperCase(),
      name: row.name,
      score: kind === "clanwars"
        ? clan.clanWarTrophies
        : kind === "clans"
          ? clan.clanScore
          : player.score === 2147483647
            ? undefined
            : player.score,
      trophies: kind === "players" ? player.trophies : undefined,
      clanTag: kind === "players" ? player.clan?.tag?.replace(/^#/, "") : undefined,
      clanName: kind === "players" ? player.clan?.name : undefined
    });
  });
}

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
export { GLOBAL_LOCATION_ID };

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

function cachedPayload<T>(document: CacheDocument, stale = false): CachedPayload<T> {
  return {
    data: JSON.parse(document.payload) as T,
    fetchedAt: document.fetchedAt,
    stale
  };
}

function interactiveData<T>(response: ClashUpstreamResponse<T>): T {
  if (response.ok) return response.data;
  throw new ConvexError({
    code: response.code,
    kind: response.kind,
    status: response.status,
    retryable: response.retryable,
    message: response.message,
  });
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
    expiresAt: fetchedAt + clashCacheTtlMs(),
    profile
  });
  return fetchedAt;
}

export const getPlayerBundle = actionGeneric({
  args: { tag: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<PlayerBundlePayload> => {
    const upstream = clashUpstream(ctx);
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
      const cachedBattles = JSON.parse(battleCache.payload) as ApiBattle[];
      await recordPlayerActivity(ctx, tag, cachedBattles);
      return {
        player: cachedPayload<ApiPlayer>(playerCache),
        battles: { data: cachedBattles, fetchedAt: battleCache.fetchedAt, stale: false },
        chests: cachedPayload<ApiChestList>(chestCache)
      };
    }

    try {
      const responses = await Promise.all([
        upstream.player(tag),
        upstream.battleLog(tag),
        upstream.upcomingChests(tag),
      ]);
      const player = interactiveData(responses[0]);
      const battles = interactiveData(responses[1]);
      const chests = interactiveData(responses[2]);
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

      await ctx.runMutation(historyApi.recordPlayerSnapshot, {
        player: compactPlayerSnapshot(player),
        source: "api_profile",
        observedAt: playerFetchedAt
      });
      await recordPlayerActivity(ctx, tag, battles);

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
        const cachedBattles = JSON.parse(battleCache.payload) as ApiBattle[];
        await recordPlayerActivity(ctx, tag, cachedBattles);
        return {
          player: cachedPayload<ApiPlayer>(playerCache, true),
          battles: { data: cachedBattles, fetchedAt: battleCache.fetchedAt, stale: true },
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
    const upstream = clashUpstream(ctx);
    const tag = normalizeActionTag(args.tag);
    const key = `clan:${tag}`;
    const cached = (await ctx.runQuery(cacheApi.get, { key })) as CacheDocument | null;

    if (cached && cached.expiresAt > Date.now() && !args.force) {
      return { clan: cachedPayload<ApiClan>(cached) };
    }

    try {
      const clan = interactiveData(await upstream.clan(tag));
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
    const upstream = clashUpstream(ctx);
    const key = "cards:global";
    const cached = (await ctx.runQuery(cacheApi.get, { key })) as CacheDocument | null;

    if (cached && cached.expiresAt > Date.now() && !args.force) {
      return { cards: cachedPayload<ApiCardList>(cached) };
    }

    try {
      const cards = interactiveData(await upstream.cards());
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
  options: {
    key: string;
    kind: CacheKind;
    request: (upstream: ClashUpstream) => Promise<ClashUpstreamResponse<T>>;
    force?: boolean;
    ttlMs?: number;
    onFetched?: (data: T, observedAt: number) => Promise<void>;
  }
): Promise<CachedPayload<T>> {
  const cached = (await ctx.runQuery(cacheApi.get, { key: options.key })) as CacheDocument | null;

  if (cached && cached.expiresAt > Date.now() && !options.force) {
    return cachedPayload<T>(cached);
  }

  try {
    const data = interactiveData(await options.request(clashUpstream(ctx)));
    const fetchedAt = Date.now();
    await ctx.runMutation(cacheApi.put, {
      key: options.key,
      kind: options.kind,
      payload: JSON.stringify(data),
      fetchedAt,
      expiresAt: fetchedAt + (options.ttlMs ?? clashCacheTtlMs())
    });
    await options.onFetched?.(data, fetchedAt);
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
    // A clan with no war history is a normal state, not an error, so each half
    // degrades to null independently rather than failing the whole page.
    const [currentRace, raceLog] = await Promise.all([
      cachedFetch<ApiCurrentRiverRace>(ctx, {
        key: `war:current:${tag}`,
        kind: "war",
        request: (upstream) => upstream.currentRiverRace(tag),
        force: args.force
      }).catch(() => null),
      cachedFetch<ApiRiverRaceLog>(ctx, {
        key: `war:log:${tag}`,
        kind: "war",
        request: (upstream) => upstream.riverRaceLog(tag),
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
      request: (upstream) => upstream.locations(300),
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

    const boardName = `${locationId === GLOBAL_LOCATION_ID ? "Global" : `Location ${locationId}`} ${
      kind === "players" ? "Player" : kind === "clans" ? "Clan" : "Clan War"
    } Rankings`;
    return {
      kind,
      locationId,
      rankings: await cachedFetch<ApiPaged<ApiPlayerRanking | ApiClanRanking>>(ctx, {
        key: `rankings:${kind}:${locationId}:${limit}`,
        kind: "rankings",
        request: (upstream) => kind === "players"
          ? upstream.rankings("players", locationId, limit)
          : upstream.rankings(kind, locationId, limit),
        force: args.force,
        onFetched: async (data, observedAt) => {
          await ctx.runMutation(historyApi.recordLeaderboardSnapshot, {
            board: { key: `rankings:${kind}:${locationId}`, kind, name: boardName, locationId },
            entries: compactLeaderboardEntries(data.items ?? [], kind),
            observedAt
          });
        }
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
      request: (upstream) => upstream.leaderboards(),
      force: args.force,
      ttlMs: 6 * 60 * 60 * 1000
    })
  })
});

export const getLeaderboard = actionGeneric({
  args: { leaderboardId: v.number(), limit: v.optional(v.number()), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<LeaderboardPayload> => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 1000);
    const boardsCache = (await ctx.runQuery(cacheApi.get, { key: "leaderboards:all" })) as CacheDocument | null;
    const boards = boardsCache ? (JSON.parse(boardsCache.payload) as ApiPaged<ApiLeaderboard>).items ?? [] : [];
    const boardName = boards.find((board) => board.id === args.leaderboardId)?.name ?? `Leaderboard #${args.leaderboardId}`;
    return {
      leaderboard: await cachedFetch<ApiPaged<ApiPlayerRanking>>(ctx, {
        key: `leaderboard:${args.leaderboardId}:${limit}`,
        kind: "leaderboard",
        request: (upstream) => upstream.leaderboard(args.leaderboardId, limit),
        force: args.force,
        onFetched: async (data, observedAt) => {
          await ctx.runMutation(historyApi.recordLeaderboardSnapshot, {
            board: {
              key: `event:${args.leaderboardId}`,
              kind: "event",
              name: boardName,
              boardId: args.leaderboardId
            },
            entries: compactLeaderboardEntries(data.items ?? [], "players"),
            observedAt
          });
        }
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

    const search = {
      ...(name ? { name } : {}),
      ...(args.locationId ? { locationId: args.locationId } : {}),
      ...(args.minMembers ? { minMembers: args.minMembers } : {}),
      ...(args.maxMembers ? { maxMembers: args.maxMembers } : {}),
      ...(args.minScore ? { minScore: args.minScore } : {}),
      limit: Math.min(Math.max(args.limit ?? 30, 1), 100),
    };

    if (!name && !args.locationId && !args.minMembers && !args.maxMembers && !args.minScore) {
      throw new ConvexError({
        code: "SEARCH_EMPTY",
        message: "Add a clan name or at least one filter to search."
      });
    }

    return {
      results: await cachedFetch<ApiPaged<ApiClan>>(ctx, {
        key: `clanSearch:${JSON.stringify(search)}`,
        kind: "clanSearch",
        request: (upstream) => upstream.searchClans(search),
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
      request: (upstream) => upstream.globalTournaments(),
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
        request: (upstream) => upstream.searchTournaments(name, limit),
        force: args.force,
        ttlMs: 5 * 60 * 1000
      })
    };
  }
});
