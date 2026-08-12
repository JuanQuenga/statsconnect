import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { MIN_META_PICKS } from "./brawl/stats";

declare const process: { env: Record<string, string | undefined> };

const http = httpRouter();

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=60, s-maxage=300",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: corsHeaders, status });
}

function apiToken(): string | null {
  const token = process.env.BRAWL_STARS_API_TOKEN?.trim();
  return token || null;
}

function apiBaseUrl(): string {
  return (process.env.BRAWL_STARS_API_BASE_URL || "https://api.brawlstars.com/v1").replace(/\/$/, "");
}

function normalizedTag(value: string | null): string | null {
  if (!value) return null;
  const tag = value.trim().toUpperCase().replace(/^#/, "");
  return /^[0289PYLQGRJCUV]{3,15}$/.test(tag) ? `#${tag}` : null;
}

function trophyBucket(value: string | null): "all" | "0-499" | "500-999" | "1000+" | null {
  return value === null || value === "all"
    ? "all"
    : value === "0-499" || value === "500-999" || value === "1000+"
      ? value
      : null;
}

function trendWindow(value: string | null): "7" | "30" | "90" | "all" | null {
  return value === "7" || value === "30" || value === "90" || value === "all" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNumber(...values: unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function optionalString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function equipment(value: unknown): Array<{ id: number; name: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    const id = optionalNumber(record?.id);
    const name = optionalString(record?.name);
    return id !== undefined && name ? [{ id, name }] : [];
  });
}

function profileSnapshot(value: unknown) {
  const profile = asRecord(value);
  const tag = typeof profile?.tag === "string" ? normalizedTag(profile.tag) : null;
  const name = typeof profile?.name === "string" ? profile.name.trim() : "";
  if (!profile || !tag || !name) return null;
  const club = asRecord(profile.club);
  const icon = asRecord(profile.icon);
  const brawlers = Array.isArray(profile.brawlers) ? profile.brawlers : [];
  const ranked = asRecord(profile.ranked);
  const rankedSeason = asRecord(profile.rankedSeason ?? profile.currentRankedSeason);
  const normalizedBrawlers = brawlers.flatMap((value) => {
    const brawler = asRecord(value);
    const id = optionalNumber(brawler?.id);
    const brawlerName = optionalString(brawler?.name);
    if (id === undefined || !brawlerName) return [];
    return [{
      id,
      name: brawlerName,
      power: finiteNumber(brawler?.power),
      rank: finiteNumber(brawler?.rank),
      trophies: finiteNumber(brawler?.trophies),
      highestTrophies: finiteNumber(brawler?.highestTrophies),
      gadgets: equipment(brawler?.gadgets),
      starPowers: equipment(brawler?.starPowers),
      gears: equipment(brawler?.gears),
      hypercharges: equipment(brawler?.hypercharges ?? brawler?.hypercharge ?? brawler?.buffies),
    }];
  });
  return {
    tag,
    name,
    trophies: finiteNumber(profile.trophies),
    highestTrophies: finiteNumber(profile.highestTrophies),
    expLevel: finiteNumber(profile.expLevel),
    victory3v3: finiteNumber(profile["3vs3Victories"]),
    soloVictories: finiteNumber(profile.soloVictories),
    duoVictories: finiteNumber(profile.duoVictories),
    clubTag: typeof club?.tag === "string" ? club.tag : undefined,
    clubName: typeof club?.name === "string" ? club.name : undefined,
    iconId: typeof icon?.id === "number" ? icon.id : undefined,
    brawlerCount: brawlers.length,
    power11Count: brawlers.filter((brawler) => finiteNumber(asRecord(brawler)?.power) === 11).length,
    rankedCurrent: optionalNumber(ranked?.currentRank, ranked?.current, profile.rankedCurrent),
    rankedCurrentName: optionalString(ranked?.currentRankName, ranked?.currentName, profile.rankedCurrentName),
    rankedSeasonBest: optionalNumber(ranked?.seasonBestRank, rankedSeason?.bestRank, profile.rankedSeasonBest),
    rankedSeasonBestName: optionalString(ranked?.seasonBestRankName, rankedSeason?.bestRankName, profile.rankedSeasonBestName),
    rankedBest: optionalNumber(ranked?.bestRank, ranked?.highestRank, profile.rankedBest),
    rankedBestName: optionalString(ranked?.bestRankName, ranked?.highestRankName, profile.rankedBestName),
    brawlers: normalizedBrawlers,
  };
}

function clubProfileSnapshot(value: unknown) {
  const club = asRecord(value);
  const tag = typeof club?.tag === "string" ? normalizedTag(club.tag) : null;
  const name = typeof club?.name === "string" ? club.name.trim() : "";
  if (!club || !tag || !name) return null;
  const members = Array.isArray(club.members)
    ? club.members.flatMap((value) => {
        const member = asRecord(value);
        const memberTag = typeof member?.tag === "string" ? normalizedTag(member.tag) : null;
        const memberName = typeof member?.name === "string" ? member.name.trim() : "";
        const icon = asRecord(member?.icon);
        if (!memberTag || !memberName) return [];
        return [{
          tag: memberTag,
          name: memberName,
          role: typeof member?.role === "string" ? member.role : undefined,
          trophies: finiteNumber(member?.trophies),
          iconId: typeof icon?.id === "number" ? icon.id : undefined,
        }];
      })
    : [];
  const badge = asRecord(club.badge);
  return {
    tag,
    name,
    description: typeof club.description === "string" ? club.description : undefined,
    type: typeof club.type === "string" ? club.type : undefined,
    badgeId:
      typeof club.badgeId === "number"
        ? club.badgeId
        : typeof badge?.id === "number"
          ? badge.id
          : undefined,
    requiredTrophies: typeof club.requiredTrophies === "number" ? club.requiredTrophies : undefined,
    trophies: finiteNumber(club.trophies),
    members,
  };
}

async function upstream(path: string): Promise<Response> {
  const token = apiToken();
  if (!token) {
    return json(
      {
        error: "API_NOT_CONFIGURED",
        message: "Set BRAWL_STARS_API_TOKEN in the Convex deployment environment.",
      },
      503,
    );
  }

  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.text();

    return new Response(body, {
      headers: corsHeaders,
      status: response.status,
    });
  } catch (error: unknown) {
    console.error("Brawl Stars API request failed", error);
    return json(
      {
        error: "UPSTREAM_UNAVAILABLE",
        message: "The Brawl Stars API could not be reached. Please try again shortly.",
      },
      502,
    );
  }
}

async function parsed(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text || "Unexpected response from the Brawl Stars API." };
  }
}

async function brawlApi(path: string): Promise<Response> {
  try {
    const response = await fetch(`https://api.brawlapi.com/v1${path}`, {
      headers: { Accept: "application/json" },
    });
    const body = await response.text();
    return new Response(body, { headers: corsHeaders, status: response.status });
  } catch (error: unknown) {
    console.error("BrawlAPI request failed", error);
    return json({ error: "UPSTREAM_UNAVAILABLE", message: "Metadata is temporarily unavailable." }, 502);
  }
}

const player = httpAction(async (ctx, request) => {
  const tag = normalizedTag(new URL(request.url).searchParams.get("tag"));
  if (!tag) return json({ error: "INVALID_TAG", message: "Enter a valid Brawl Stars player tag." }, 400);

  const encodedTag = encodeURIComponent(tag);
  const [profileResponse, battlesResponse] = await Promise.all([
    upstream(`/players/${encodedTag}`),
    upstream(`/players/${encodedTag}/battlelog`),
  ]);

  if (!profileResponse.ok) return profileResponse;

  const [profile, battleLog] = await Promise.all([
    parsed(profileResponse),
    battlesResponse.ok ? parsed(battlesResponse) : Promise.resolve({ items: [] }),
  ]);

  const items = Array.isArray((battleLog as { items?: unknown[] })?.items)
    ? ((battleLog as { items: unknown[] }).items)
    : [];

  const snapshot = profileSnapshot(profile);
  if (snapshot) {
    await ctx.runMutation(internal.brawl.players.recordProfile, snapshot);
  }

  if (items.length) {
    await ctx.scheduler.runAfter(0, internal.brawl.ingest.ingestBattleLogItems, {
      items,
      focusTag: tag,
    });
  }

  return json({ battleLog, player: profile });
});

const playerSearch = httpAction(async (ctx, request) => {
  const search = new URL(request.url).searchParams;
  const query = (search.get("q") || "").trim();
  const requestedLimit = Number(search.get("limit") || "12");
  const limit = Number.isFinite(requestedLimit) ? Math.min(25, Math.max(1, Math.trunc(requestedLimit))) : 12;
  if (!query) return json({ players: [] });
  return json(await ctx.runQuery(api.brawl.players.search, { query, limit }));
});

const playerHistory = httpAction(async (ctx, request) => {
  const tag = normalizedTag(new URL(request.url).searchParams.get("tag"));
  if (!tag) return json({ error: "INVALID_TAG", message: "Enter a valid Brawl Stars player tag." }, 400);
  return json({ snapshots: await ctx.runQuery(api.brawl.players.history, { tag, limit: 180 }) });
});

const playerAnalytics = httpAction(async (ctx, request) => {
  const search = new URL(request.url).searchParams;
  const tag = normalizedTag(search.get("tag"));
  if (!tag) return json({ error: "INVALID_TAG", message: "Enter a valid Brawl Stars player tag." }, 400);
  const requestedLimit = Number(search.get("limit") || "50");
  const beforeValue = Number(search.get("before"));
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.trunc(requestedLimit))) : 50;
  const before = Number.isFinite(beforeValue) && beforeValue > 0 ? beforeValue : undefined;
  return json(await ctx.runQuery(api.brawl.players.analytics, { tag, limit, before }));
});

const club = httpAction(async (ctx, request) => {
  const tag = normalizedTag(new URL(request.url).searchParams.get("tag"));
  if (!tag) return json({ error: "INVALID_TAG", message: "Enter a valid Brawl Stars club tag." }, 400);
  const response = await upstream(`/clubs/${encodeURIComponent(tag)}`);
  if (response.ok) {
    const payload = await parsed(response.clone());
    const snapshot = clubProfileSnapshot(payload);
    if (snapshot) await ctx.runMutation(internal.brawl.clubs.recordClub, { club: snapshot });
  }
  return response;
});

const clubHistory = httpAction(async (ctx, request) => {
  const tag = normalizedTag(new URL(request.url).searchParams.get("tag"));
  if (!tag) return json({ error: "INVALID_TAG", message: "Enter a valid Brawl Stars club tag." }, 400);
  return json(await ctx.runQuery(api.brawl.clubs.history, {
    tag,
    snapshotLimit: 365,
    eventLimit: 500,
  }));
});

const clubCommunity = httpAction(async (ctx, request) => {
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") || "20");
  const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, Math.trunc(requestedLimit))) : 20;
  return json(await ctx.runQuery(api.brawl.clubs.communityActivity, { limit }));
});

const rankings = httpAction(async (_ctx, request) => {
  const search = new URL(request.url).searchParams;
  const kind = search.get("kind");
  const country = (search.get("country") || "global").toLowerCase();
  const requestedLimit = Number(search.get("limit") || "50");
  const limit = Number.isFinite(requestedLimit) ? Math.min(200, Math.max(1, Math.trunc(requestedLimit))) : 50;

  if (!/^(global|[a-z]{2})$/.test(country)) {
    return json({ error: "INVALID_COUNTRY", message: "Use global or a two-letter country code." }, 400);
  }
  if (kind !== "players" && kind !== "clubs" && kind !== "brawlers") {
    return json({ error: "INVALID_RANKING", message: "Choose players, clubs, or brawlers." }, 400);
  }

  if (kind === "brawlers") {
    const brawlerId = search.get("brawlerId");
    if (!brawlerId || !/^\d{8}$/.test(brawlerId)) {
      return json({ error: "INVALID_BRAWLER", message: "A numeric brawlerId is required." }, 400);
    }
    return upstream(`/rankings/${country}/brawlers/${brawlerId}?limit=${limit}`);
  }

  return upstream(`/rankings/${country}/${kind}?limit=${limit}`);
});

const brawlers = httpAction(async () => brawlApi("/brawlers"));
const events = httpAction(async () => upstream("/events/rotation"));
const maps = httpAction(async () => brawlApi("/maps"));
const gamemodes = httpAction(async () => brawlApi("/gamemodes"));

const mapDetail = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idPart = parts[parts.length - 1] || "";
  if (!/^\d+$/.test(idPart)) {
    return json({ error: "INVALID_MAP", message: "A numeric map id is required." }, 400);
  }
  const mapId = Number(idPart);
  const selectedTrophyBucket = trophyBucket(url.searchParams.get("trophyBucket"));
  if (!selectedTrophyBucket) return json({ error: "INVALID_TROPHY_BUCKET", message: "Choose a supported trophy bracket." }, 400);

  const mapResponse = await brawlApi("/maps");
  if (!mapResponse.ok) return mapResponse;
  const mapPayload = await parsed(mapResponse);
  const mapRecord = asRecord(mapPayload);
  const mapItems = Array.isArray(mapPayload)
    ? mapPayload
    : Array.isArray(mapRecord?.list)
      ? mapRecord.list
      : Array.isArray(mapRecord?.items)
        ? mapRecord.items
        : [];
  const map = mapItems.find((item) => finiteNumber(asRecord(item)?.id) === mapId);
  if (!map) return json({ error: "MAP_NOT_FOUND", message: "That map is not in the current catalog." }, 404);

  const meta = await ctx.runQuery(api.brawl.stats.getMapStats, {
    mapId,
    trophyBucket: selectedTrophyBucket,
  });

  return json({
    map,
    stats: meta.stats,
    teams: meta.teams,
    matchups: meta.matchups,
    sampleSize: meta.sampleSize,
    minPicks: meta.minPicks ?? MIN_META_PICKS,
  });
});

const brawlerMeta = httpAction(async (ctx, request) => {
  const search = new URL(request.url).searchParams;
  const brawlerId = Number(search.get("id"));
  if (!Number.isInteger(brawlerId) || brawlerId <= 0) {
    return json({ error: "INVALID_BRAWLER", message: "A numeric brawler id is required." }, 400);
  }
  const selectedTrophyBucket = trophyBucket(search.get("trophyBucket"));
  if (!selectedTrophyBucket) return json({ error: "INVALID_TROPHY_BUCKET", message: "Choose a supported trophy bracket." }, 400);
  return json(await ctx.runQuery(api.brawl.stats.getBrawlerStats, { brawlerId, trophyBucket: selectedTrophyBucket }));
});

const metaResearch = httpAction(async (ctx, request) => {
  const selectedTrophyBucket = trophyBucket(new URL(request.url).searchParams.get("trophyBucket"));
  if (!selectedTrophyBucket) return json({ error: "INVALID_TROPHY_BUCKET", message: "Choose a supported trophy bracket." }, 400);
  return json(await ctx.runQuery(api.brawl.stats.getMetaResearch, { trophyBucket: selectedTrophyBucket }));
});

const metaTrends = httpAction(async (ctx, request) => {
  const search = new URL(request.url).searchParams;
  const selectedTrophyBucket = trophyBucket(search.get("trophyBucket"));
  const selectedWindow = trendWindow(search.get("window"));
  if (!selectedTrophyBucket) return json({ error: "INVALID_TROPHY_BUCKET", message: "Choose a supported trophy bracket." }, 400);
  if (!selectedWindow) return json({ error: "INVALID_TREND_WINDOW", message: "Choose 7, 30, 90, or all." }, 400);
  const rawBrawlerId = search.get("brawlerId");
  const brawlerId = rawBrawlerId === null ? undefined : Number(rawBrawlerId);
  if (brawlerId !== undefined && (!Number.isInteger(brawlerId) || brawlerId <= 0)) {
    return json({ error: "INVALID_BRAWLER", message: "A numeric brawler id is required." }, 400);
  }
  return json(await ctx.runQuery(internal.brawl.stats.getMetaTrends, {
    trophyBucket: selectedTrophyBucket,
    window: selectedWindow,
    brawlerId,
  }));
});

const options = httpAction(async () => new Response(null, { headers: corsHeaders, status: 204 }));

const paths = [
  "/api/player",
  "/api/player-search",
  "/api/player-history",
  "/api/player-analytics",
  "/api/club",
  "/api/club-history",
  "/api/clubs/activity",
  "/api/rankings",
  "/api/brawlers",
  "/api/events",
  "/api/maps",
  "/api/gamemodes",
  "/api/brawler-meta",
  "/api/meta",
  "/api/meta-trends",
];

for (const path of paths) {
  http.route({ method: "OPTIONS", path, handler: options });
}

http.route({ method: "OPTIONS", pathPrefix: "/api/maps/", handler: options });

http.route({ method: "GET", path: "/api/player", handler: player });
http.route({ method: "GET", path: "/api/player-search", handler: playerSearch });
http.route({ method: "GET", path: "/api/player-history", handler: playerHistory });
http.route({ method: "GET", path: "/api/player-analytics", handler: playerAnalytics });
http.route({ method: "GET", path: "/api/club", handler: club });
http.route({ method: "GET", path: "/api/club-history", handler: clubHistory });
http.route({ method: "GET", path: "/api/clubs/activity", handler: clubCommunity });
http.route({ method: "GET", path: "/api/rankings", handler: rankings });
http.route({ method: "GET", path: "/api/brawlers", handler: brawlers });
http.route({ method: "GET", path: "/api/events", handler: events });
http.route({ method: "GET", path: "/api/maps", handler: maps });
http.route({ method: "GET", pathPrefix: "/api/maps/", handler: mapDetail });
http.route({ method: "GET", path: "/api/gamemodes", handler: gamemodes });
http.route({ method: "GET", path: "/api/brawler-meta", handler: brawlerMeta });
http.route({ method: "GET", path: "/api/meta", handler: metaResearch });
http.route({ method: "GET", path: "/api/meta-trends", handler: metaTrends });

export default http;
