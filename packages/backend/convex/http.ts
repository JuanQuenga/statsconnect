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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function profileSnapshot(value: unknown) {
  const profile = asRecord(value);
  const tag = typeof profile?.tag === "string" ? normalizedTag(profile.tag) : null;
  const name = typeof profile?.name === "string" ? profile.name.trim() : "";
  if (!profile || !tag || !name) return null;
  const club = asRecord(profile.club);
  const icon = asRecord(profile.icon);
  const brawlers = Array.isArray(profile.brawlers) ? profile.brawlers : [];
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

const club = httpAction(async (_ctx, request) => {
  const tag = normalizedTag(new URL(request.url).searchParams.get("tag"));
  if (!tag) return json({ error: "INVALID_TAG", message: "Enter a valid Brawl Stars club tag." }, 400);
  return upstream(`/clubs/${encodeURIComponent(tag)}`);
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
  const trophyBucket = url.searchParams.get("trophyBucket") || "all";

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
    trophyBucket: trophyBucket === "all" ? "all" : trophyBucket,
  });

  return json({
    map,
    stats: meta.stats,
    teams: meta.teams,
    sampleSize: meta.sampleSize,
    minPicks: meta.minPicks ?? MIN_META_PICKS,
  });
});

const options = httpAction(async () => new Response(null, { headers: corsHeaders, status: 204 }));

const paths = [
  "/api/player",
  "/api/player-search",
  "/api/player-history",
  "/api/club",
  "/api/rankings",
  "/api/brawlers",
  "/api/events",
  "/api/maps",
  "/api/gamemodes",
];

for (const path of paths) {
  http.route({ method: "OPTIONS", path, handler: options });
}

http.route({ method: "OPTIONS", pathPrefix: "/api/maps/", handler: options });

http.route({ method: "GET", path: "/api/player", handler: player });
http.route({ method: "GET", path: "/api/player-search", handler: playerSearch });
http.route({ method: "GET", path: "/api/player-history", handler: playerHistory });
http.route({ method: "GET", path: "/api/club", handler: club });
http.route({ method: "GET", path: "/api/rankings", handler: rankings });
http.route({ method: "GET", path: "/api/brawlers", handler: brawlers });
http.route({ method: "GET", path: "/api/events", handler: events });
http.route({ method: "GET", path: "/api/maps", handler: maps });
http.route({ method: "GET", pathPrefix: "/api/maps/", handler: mapDetail });
http.route({ method: "GET", path: "/api/gamemodes", handler: gamemodes });

export default http;
