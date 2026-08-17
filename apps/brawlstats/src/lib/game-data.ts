import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type {
  BattleLogItem,
  BrawlerCatalogItem,
  BrawlerMetaResponse,
  ClubCommunityResponse,
  ClubHistoryResponse,
  ClubProfile,
  EventItem,
  MapDetailResponse,
  MapListItem,
  MetaResearchResponse,
  MetaTrendsResponse,
  PlayerAnalytics,
  PlayerProfile,
  PlayerSearchResponse,
  PlayerSnapshot,
  RankingClub,
  RankingPlayer,
} from "./types.ts";

type FetchAdapter = (input: string, init?: RequestInit) => Promise<Response>;
type TrophyBucket = string;
type RankingKind = "players" | "clubs" | "brawlers";

type DataModuleConfiguration = {
  siteUrl?: string;
  fetch?: FetchAdapter;
};

export type PlayerLookup = {
  player: PlayerProfile;
  battles: BattleLogItem[];
};

export class BrawlDataError extends Error {
  readonly kind: "configuration" | "transport" | "response";
  readonly status: number;
  readonly code?: string;

  constructor(
    message: string,
    options: {
      kind: BrawlDataError["kind"];
      status?: number;
      code?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "BrawlDataError";
    this.kind = options.kind;
    this.status = options.status ?? 500;
    this.code = options.code;
  }
}

const freshness = {
  catalog: 24 * 60 * 60_000,
  maps: 15 * 60_000,
  events: 60_000,
  rankings: 5 * 60_000,
  player: 60_000,
  history: 5 * 60_000,
  analytics: 2 * 60_000,
  clubs: 2 * 60_000,
  research: 5 * 60_000,
} as const;

const cache = {
  brawlers: () => ["brawl-data", "brawlers"] as const,
  maps: () => ["brawl-data", "maps"] as const,
  events: () => ["brawl-data", "events"] as const,
  ranking: (kind: RankingKind, country: string, limit: number, brawlerId?: number) =>
    ["brawl-data", "rankings", kind, country, limit, brawlerId ?? null] as const,
  player: (tag: string | null) => ["brawl-data", "player", tag ?? ""] as const,
  playerSearch: (search: string, limit: number) =>
    ["brawl-data", "player-search", search, limit] as const,
  playerHistory: (tag: string | null, revision?: number) =>
    ["brawl-data", "player-history", tag ?? "", revision ?? null] as const,
  playerAnalytics: (tag: string | null, revision?: number) =>
    ["brawl-data", "player-analytics", tag ?? "", revision ?? null] as const,
  club: (tag: string | null) => ["brawl-data", "club", tag ?? ""] as const,
  clubHistory: (tag: string | null) => ["brawl-data", "club-history", tag ?? ""] as const,
  clubCommunity: (limit: number) => ["brawl-data", "club-community", limit] as const,
  map: (id: string | number, trophyBucket: TrophyBucket) =>
    ["brawl-data", "map", String(id), trophyBucket] as const,
  brawlerMeta: (id: number, trophyBucket: TrophyBucket) =>
    ["brawl-data", "brawler-meta", id, trophyBucket] as const,
  meta: (trophyBucket: TrophyBucket) => ["brawl-data", "meta", trophyBucket] as const,
  metaTrends: (trophyBucket: TrophyBucket, window: string, brawlerId?: number) =>
    ["brawl-data", "meta-trends", trophyBucket, window, brawlerId ?? null] as const,
};

export function createBrawlDataModule(configuration: DataModuleConfiguration) {
  const siteUrl = normalizeSiteUrl(configuration.siteUrl);
  const fetchAdapter = configuration.fetch ?? globalThis.fetch.bind(globalThis);

  async function acquire<T>(
    path: string,
    parameters: Readonly<Record<string, string | number | undefined>>,
    normalize: (payload: unknown) => T,
  ): Promise<T> {
    if (!siteUrl) {
      throw new BrawlDataError(
        "Set VITE_CONVEX_SITE_URL to your Convex HTTP Actions URL.",
        { kind: "configuration", status: 503, code: "NOT_CONFIGURED" },
      );
    }

    let url: URL;
    try {
      url = new URL(path, `${siteUrl}/`);
    } catch (cause) {
      throw new BrawlDataError("VITE_CONVEX_SITE_URL is not a valid URL.", {
        kind: "configuration",
        status: 503,
        code: "INVALID_CONFIGURATION",
        cause,
      });
    }
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await fetchAdapter(url.toString(), { headers: { Accept: "application/json" } });
    } catch (cause) {
      throw new BrawlDataError("The Game Site could not reach the Brawl Stars data source.", {
        kind: "transport",
        status: 503,
        cause,
      });
    }

    let payload: unknown;
    try {
      payload = cleanPayload(await response.json());
    } catch (cause) {
      throw new BrawlDataError("The backend returned an unreadable response.", {
        kind: "response",
        status: response.status,
        cause,
      });
    }

    if (!response.ok) {
      const body = record(payload);
      throw new BrawlDataError(
        stringValue(body.message) || "The Brawl Stars data request failed.",
        {
          kind: "response",
          status: response.status,
          code: stringValue(body.error) || undefined,
        },
      );
    }

    try {
      return normalize(payload);
    } catch (cause) {
      if (cause instanceof BrawlDataError) throw cause;
      throw new BrawlDataError("The backend returned an unexpected response shape.", {
        kind: "response",
        status: response.status,
        cause,
      });
    }
  }

  return {
    brawlers: () => queryOptions({
      queryKey: cache.brawlers(),
      queryFn: () => acquire("api/brawlers", {}, normalizeCatalog),
      staleTime: freshness.catalog,
    }),
    maps: () => queryOptions({
      queryKey: cache.maps(),
      queryFn: () => acquire("api/maps", {}, (payload) => collection<MapListItem>(payload)),
      staleTime: freshness.maps,
    }),
    events: () => queryOptions({
      queryKey: cache.events(),
      queryFn: () => acquire("api/events", {}, (payload) => collection<EventItem>(payload)),
      staleTime: freshness.events,
    }),
    rankingPlayers: (country: string, limit: number) => queryOptions({
      queryKey: cache.ranking("players", country, limit),
      queryFn: () => acquire("api/rankings", { kind: "players", country, limit }, (payload) => collection<RankingPlayer>(payload)),
      staleTime: freshness.rankings,
    }),
    rankingClubs: (country: string, limit: number) => queryOptions({
      queryKey: cache.ranking("clubs", country, limit),
      queryFn: () => acquire("api/rankings", { kind: "clubs", country, limit }, (payload) => collection<RankingClub>(payload)),
      staleTime: freshness.rankings,
    }),
    rankingBrawlers: (country: string, brawlerId: number | null, limit: number) => queryOptions({
      queryKey: cache.ranking("brawlers", country, limit, brawlerId ?? undefined),
      queryFn: () => acquire("api/rankings", {
        kind: "brawlers",
        country,
        limit,
        brawlerId: requiredNumber(brawlerId, "brawlerId"),
      }, (payload) => collection<RankingPlayer>(payload)),
      staleTime: freshness.rankings,
    }),
    player: (tag: string | null) => queryOptions({
      queryKey: cache.player(tag),
      queryFn: () => acquire("api/player", { tag: requiredString(tag, "player tag") }, normalizePlayer),
      staleTime: freshness.player,
    }),
    playerSearch: (search: string, limit: number) => queryOptions({
      queryKey: cache.playerSearch(search, limit),
      queryFn: () => acquire("api/player-search", { q: search, limit }, object<PlayerSearchResponse>),
      staleTime: freshness.player,
    }),
    playerHistory: (tag: string | null, revision?: number) => queryOptions({
      queryKey: cache.playerHistory(tag, revision),
      queryFn: () => acquire("api/player-history", { tag: requiredString(tag, "player tag") }, (payload) => {
        const response = record(payload);
        return collection<PlayerSnapshot>(response.snapshots);
      }),
      staleTime: freshness.history,
    }),
    playerAnalytics: (tag: string | null, revision?: number) => infiniteQueryOptions({
      queryKey: cache.playerAnalytics(tag, revision),
      queryFn: ({ pageParam }) => acquire("api/player-analytics", {
        tag: requiredString(tag, "player tag"),
        limit: 50,
        before: typeof pageParam === "number" ? pageParam : undefined,
      }, object<PlayerAnalytics>),
      initialPageParam: undefined as number | undefined,
      getNextPageParam: (page) => page.hasMore ? page.nextCursor : undefined,
      staleTime: freshness.analytics,
    }),
    club: (tag: string | null) => queryOptions({
      queryKey: cache.club(tag),
      queryFn: () => acquire("api/club", { tag: requiredString(tag, "club tag") }, object<ClubProfile>),
      staleTime: freshness.clubs,
    }),
    clubHistory: (tag: string | null) => queryOptions({
      queryKey: cache.clubHistory(tag),
      queryFn: () => acquire("api/club-history", { tag: requiredString(tag, "club tag") }, object<ClubHistoryResponse>),
      staleTime: freshness.history,
    }),
    clubCommunity: (limit = 20) => queryOptions({
      queryKey: cache.clubCommunity(limit),
      queryFn: () => acquire("api/clubs/activity", { limit }, object<ClubCommunityResponse>),
      staleTime: freshness.clubs,
    }),
    map: (id: string | number, trophyBucket: TrophyBucket = "all") => queryOptions({
      queryKey: cache.map(id, trophyBucket),
      queryFn: () => acquire(`api/maps/${encodeURIComponent(String(id))}`, {
        trophyBucket: trophyBucket === "all" ? undefined : trophyBucket,
      }, object<MapDetailResponse>),
      staleTime: freshness.research,
    }),
    brawlerMeta: (id: number, trophyBucket: TrophyBucket) => queryOptions({
      queryKey: cache.brawlerMeta(id, trophyBucket),
      queryFn: () => acquire("api/brawler-meta", { id, trophyBucket }, object<BrawlerMetaResponse>),
      staleTime: freshness.research,
    }),
    meta: (trophyBucket: TrophyBucket) => queryOptions({
      queryKey: cache.meta(trophyBucket),
      queryFn: () => acquire("api/meta", { trophyBucket }, object<MetaResearchResponse>),
      staleTime: freshness.research,
    }),
    metaTrends: (trophyBucket: TrophyBucket, window: string, brawlerId?: number) => queryOptions({
      queryKey: cache.metaTrends(trophyBucket, window, brawlerId),
      queryFn: () => acquire("api/meta-trends", { trophyBucket, window, brawlerId }, object<MetaTrendsResponse>),
      staleTime: freshness.research,
    }),
  };
}

function normalizeSiteUrl(configured?: string) {
  return (configured || "").replace(".convex.cloud", ".convex.site").replace(/\/$/, "");
}

function cleanPayload(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/<\/?c(?:[0-9a-f]{1,8})?>/gi, "");
  if (Array.isArray(value)) return value.map(cleanPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cleanPayload(entry)]),
    );
  }
  return value;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function object<T>(value: unknown): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object response.");
  }
  return value as T;
}

function collection<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const response = record(payload);
  if (Array.isArray(response.items)) return response.items as T[];
  if (Array.isArray(response.list)) return response.list as T[];
  return [];
}

function normalizePlayer(payload: unknown): PlayerLookup {
  const response = record(payload);
  return {
    player: object<PlayerProfile>(response.player),
    battles: collection<BattleLogItem>(response.battleLog),
  };
}

function normalizeCatalog(payload: unknown): BrawlerCatalogItem[] {
  return collection<Record<string, unknown>>(payload)
    .filter((item) => item.released !== false)
    .map((item) => {
      const rarity = record(item.rarity);
      const brawlerClass = record(item.class);
      const gadgets = normalizeAbilities(item.gadgets);
      const starPowers = normalizeAbilities(item.starPowers);
      return {
        id: Number(item.id) || 0,
        name: stringValue(item.name) || "Unknown",
        hash: stringValue(item.hash) || stringValue(item.name) || "unknown",
        version: Number(item.version) || 0,
        rarity: stringValue(rarity.name) || "Unknown",
        color: validColor(rarity.color),
        role: stringValue(brawlerClass.name) || "Brawler",
        description: stringValue(item.description) || "Brawler profile from the live game catalog.",
        gadget: gadgets[0]?.name || "No gadget listed",
        starPower: starPowers[0]?.name || "No Star Power listed",
        gadgets,
        starPowers,
        imageUrl: stringValue(item.imageUrl) || undefined,
        imageUrl2: stringValue(item.imageUrl2) || undefined,
        imageUrl3: stringValue(item.imageUrl3) || undefined,
        released: true,
      };
    })
    .filter((item) => item.id > 0);
}

function normalizeAbilities(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const item = record(entry);
      return {
        id: Number(item.id) || 0,
        name: stringValue(item.name) || "Unknown ability",
        description: cleanDescription(stringValue(item.description) || "No description is available."),
        imageUrl: stringValue(item.imageUrl) || undefined,
        released: item.released !== false,
      };
    })
    .filter((item) => item.id > 0 && item.released);
}

function validColor(value: unknown) {
  const color = stringValue(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#f5c85b";
}

function cleanDescription(value: string) {
  return value.replace(/<![^>]+>/g, "a scaling amount").replace(/\s+/g, " ").trim();
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function requiredString(value: string | null, label: string) {
  if (value) return value;
  throw new BrawlDataError(`A ${label} is required.`, {
    kind: "configuration",
    status: 400,
    code: "INVALID_REQUEST",
  });
}

function requiredNumber(value: number | null, label: string) {
  if (value !== null && Number.isFinite(value)) return value;
  throw new BrawlDataError(`A ${label} is required.`, {
    kind: "configuration",
    status: 400,
    code: "INVALID_REQUEST",
  });
}

const environment = import.meta.env;
const configuredSiteUrl = environment?.VITE_CONVEX_SITE_URL || environment?.VITE_CONVEX_URL;

export const brawlData = createBrawlDataModule({ siteUrl: configuredSiteUrl });
