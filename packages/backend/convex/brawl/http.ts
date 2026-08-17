import { httpRouter } from "convex/server";
import { api, internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { MIN_META_PICKS } from "./stats";
import {
  createBrawlUpstreamIntake,
  normalizeBrawlTag,
  type BrawlIntakeResult,
} from "./upstreamIntake";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=60, s-maxage=300",
  "Content-Type": "application/json; charset=utf-8",
};

function interactiveIntake(ctx: ActionCtx) {
  return createBrawlUpstreamIntake({
    telemetry: async (event) => {
      const outcome = event.ok
        ? "success"
        : event.errorCode === "not_configured"
          ? "configuration_error"
          : event.errorCode === "unavailable"
            ? "transport_failure"
            : "upstream_rejected";
      await ctx.runMutation(internal.brawl.pipeline.recordUpstreamFetch, {
        operation: event.endpoint,
        consumer: "interactive",
        outcome,
        ...(event.status > 0 ? { status: event.status } : {}),
      });
    },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: corsHeaders, status });
}

function upstreamResponse(result: BrawlIntakeResult<unknown>): Response {
  if (result.ok || result.rawBody) {
    return new Response(result.rawBody, { headers: corsHeaders, status: result.status });
  }
  if (result.error.code === "not_configured") {
    return json(
      {
        error: "API_NOT_CONFIGURED",
        message: "Set BRAWL_STARS_API_TOKEN in the Convex deployment environment.",
      },
      503,
    );
  }
  const publicMetadata = result.source === "public_metadata";
  return json(
    {
      error: result.error.code === "invalid_response" ? "UPSTREAM_INVALID_RESPONSE" : "UPSTREAM_UNAVAILABLE",
      message: publicMetadata
        ? "Metadata is temporarily unavailable."
        : "The Brawl Stars API could not be reached. Please try again shortly.",
    },
    result.status || 502,
  );
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

function boundedLimit(value: string | null, fallback: number, maximum: number): number {
  const requested = Number(value ?? fallback);
  return Number.isFinite(requested) ? Math.min(maximum, Math.max(1, Math.trunc(requested))) : fallback;
}

const player = httpAction(async (ctx, request) => {
  const tag = normalizeBrawlTag(new URL(request.url).searchParams.get("tag"));
  if (!tag) return json({ error: "INVALID_TAG", message: "Enter a valid Brawl Stars player tag." }, 400);

  const upstream = interactiveIntake(ctx);
  const [profileResult, battleLogResult] = await Promise.all([
    upstream.official.player(tag),
    upstream.official.battleLog(tag),
  ]);
  if (!profileResult.ok) return upstreamResponse(profileResult);

  await ctx.runMutation(internal.brawl.players.recordProfile, profileResult.value);
  if (battleLogResult.ok && battleLogResult.value.items.length > 0) {
    await ctx.scheduler.runAfter(0, internal.brawl.ingest.ingestBattleLogItems, {
      items: battleLogResult.value.items,
      focusTag: tag,
    });
  }

  return json({
    battleLog: battleLogResult.ok ? battleLogResult.rawPayload : { items: [] },
    player: profileResult.rawPayload,
  });
});

const playerSearch = httpAction(async (ctx, request) => {
  const search = new URL(request.url).searchParams;
  const query = (search.get("q") || "").trim();
  const limit = boundedLimit(search.get("limit"), 12, 25);
  if (!query) return json({ players: [] });
  return json(await ctx.runQuery(api.brawl.players.search, { query, limit }));
});

const playerHistory = httpAction(async (ctx, request) => {
  const tag = normalizeBrawlTag(new URL(request.url).searchParams.get("tag"));
  if (!tag) return json({ error: "INVALID_TAG", message: "Enter a valid Brawl Stars player tag." }, 400);
  return json({ snapshots: await ctx.runQuery(api.brawl.players.history, { tag, limit: 180 }) });
});

const playerAnalytics = httpAction(async (ctx, request) => {
  const search = new URL(request.url).searchParams;
  const tag = normalizeBrawlTag(search.get("tag"));
  if (!tag) return json({ error: "INVALID_TAG", message: "Enter a valid Brawl Stars player tag." }, 400);
  const limit = boundedLimit(search.get("limit"), 50, 100);
  const beforeValue = Number(search.get("before"));
  const before = Number.isFinite(beforeValue) && beforeValue > 0 ? beforeValue : undefined;
  return json(await ctx.runQuery(api.brawl.players.analytics, { tag, limit, before }));
});

const club = httpAction(async (ctx, request) => {
  const tag = normalizeBrawlTag(new URL(request.url).searchParams.get("tag"));
  if (!tag) return json({ error: "INVALID_TAG", message: "Enter a valid Brawl Stars club tag." }, 400);
  const result = await interactiveIntake(ctx).official.club(tag);
  if (!result.ok) return upstreamResponse(result);
  await ctx.runMutation(internal.brawl.clubs.recordClub, { club: result.value });
  return upstreamResponse(result);
});

const clubHistory = httpAction(async (ctx, request) => {
  const tag = normalizeBrawlTag(new URL(request.url).searchParams.get("tag"));
  if (!tag) return json({ error: "INVALID_TAG", message: "Enter a valid Brawl Stars club tag." }, 400);
  return json(await ctx.runQuery(api.brawl.clubs.history, {
    tag,
    snapshotLimit: 365,
    eventLimit: 500,
  }));
});

const clubCommunity = httpAction(async (ctx, request) => {
  const limit = boundedLimit(new URL(request.url).searchParams.get("limit"), 20, 50);
  return json(await ctx.runQuery(api.brawl.clubs.communityActivity, { limit }));
});

const rankings = httpAction(async (ctx, request) => {
  const search = new URL(request.url).searchParams;
  const kind = search.get("kind");
  const country = (search.get("country") || "global").toLowerCase();
  const limit = boundedLimit(search.get("limit"), 50, 200);
  if (!/^(global|[a-z]{2})$/.test(country)) {
    return json({ error: "INVALID_COUNTRY", message: "Use global or a two-letter country code." }, 400);
  }
  if (kind !== "players" && kind !== "clubs" && kind !== "brawlers") {
    return json({ error: "INVALID_RANKING", message: "Choose players, clubs, or brawlers." }, 400);
  }

  let brawlerId: number | undefined;
  if (kind === "brawlers") {
    const value = search.get("brawlerId");
    if (!value || !/^\d{8}$/.test(value)) {
      return json({ error: "INVALID_BRAWLER", message: "A numeric brawlerId is required." }, 400);
    }
    brawlerId = Number(value);
  }
  return upstreamResponse(await interactiveIntake(ctx).official.rankings({ country, kind, limit, brawlerId }));
});

const brawlers = httpAction(async (ctx) => (
  upstreamResponse(await interactiveIntake(ctx).publicMetadata.brawlers())
));
const events = httpAction(async (ctx) => (
  upstreamResponse(await interactiveIntake(ctx).official.eventRotation())
));
const maps = httpAction(async (ctx) => (
  upstreamResponse(await interactiveIntake(ctx).publicMetadata.maps())
));
const gamemodes = httpAction(async (ctx) => (
  upstreamResponse(await interactiveIntake(ctx).publicMetadata.gamemodes())
));

const mapDetail = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const idPart = url.pathname.split("/").filter(Boolean).at(-1) || "";
  if (!/^\d+$/.test(idPart)) {
    return json({ error: "INVALID_MAP", message: "A numeric map id is required." }, 400);
  }
  const mapId = Number(idPart);
  const selectedTrophyBucket = trophyBucket(url.searchParams.get("trophyBucket"));
  if (!selectedTrophyBucket) {
    return json({ error: "INVALID_TROPHY_BUCKET", message: "Choose a supported trophy bracket." }, 400);
  }

  const mapsResult = await interactiveIntake(ctx).publicMetadata.maps();
  if (!mapsResult.ok) return upstreamResponse(mapsResult);
  const map = mapsResult.value.items.find((item) => {
    if (typeof item !== "object" || item === null || !("id" in item)) return false;
    return item.id === mapId;
  });
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
  if (!selectedTrophyBucket) {
    return json({ error: "INVALID_TROPHY_BUCKET", message: "Choose a supported trophy bracket." }, 400);
  }
  return json(await ctx.runQuery(api.brawl.stats.getBrawlerStats, {
    brawlerId,
    trophyBucket: selectedTrophyBucket,
  }));
});

const metaResearch = httpAction(async (ctx, request) => {
  const selectedTrophyBucket = trophyBucket(new URL(request.url).searchParams.get("trophyBucket"));
  if (!selectedTrophyBucket) {
    return json({ error: "INVALID_TROPHY_BUCKET", message: "Choose a supported trophy bracket." }, 400);
  }
  return json(await ctx.runQuery(api.brawl.stats.getMetaResearch, { trophyBucket: selectedTrophyBucket }));
});

const metaTrends = httpAction(async (ctx, request) => {
  const search = new URL(request.url).searchParams;
  const selectedTrophyBucket = trophyBucket(search.get("trophyBucket"));
  const selectedWindow = trendWindow(search.get("window"));
  if (!selectedTrophyBucket) {
    return json({ error: "INVALID_TROPHY_BUCKET", message: "Choose a supported trophy bracket." }, 400);
  }
  if (!selectedWindow) {
    return json({ error: "INVALID_TREND_WINDOW", message: "Choose 7, 30, 90, or all." }, 400);
  }
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

const exactPaths = [
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
] as const;

export function registerBrawlHttpRoutes(http: ReturnType<typeof httpRouter>): void {
  for (const path of exactPaths) {
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
}
