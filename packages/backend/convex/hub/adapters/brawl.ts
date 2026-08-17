import { displayTag, normalizeTag } from "./tags";
import {
  AdapterError,
  type AdapterResult,
  type GameAdapter,
  type ProfileSummary,
} from "./types";

declare const process: { env: Record<string, string | undefined> };

type BrawlPlayer = {
  name: string;
  trophies?: number;
  iconId?: number;
  club?: { tag?: string; name: string };
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parsePlayer(value: unknown): BrawlPlayer {
  if (!record(value) || typeof value.name !== "string") {
    throw new AdapterError("BAD_UPSTREAM_RESPONSE", "Brawl Stars returned an unexpected player profile.");
  }
  const icon = record(value.icon) ? value.icon : null;
  const club = record(value.club) && typeof value.club.name === "string"
    ? { name: value.club.name, tag: optionalString(value.club.tag) }
    : undefined;
  return {
    name: value.name,
    trophies: optionalNumber(value.trophies),
    iconId: icon ? optionalNumber(icon.id) : undefined,
    club,
  };
}

function parsePayload(value: unknown): BrawlPlayer {
  if (!record(value)) {
    throw new AdapterError("BAD_UPSTREAM_RESPONSE", "Brawl Stars returned an unexpected response.");
  }
  return parsePlayer(value.player);
}

function ttlMs(): number {
  const configured = Number(process.env.BRAWLSTATS_CACHE_TTL_SECONDS ?? "300");
  return Number.isFinite(configured) && configured > 0 ? configured * 1_000 : 300_000;
}

function result<T>(data: T): AdapterResult<T> {
  const fetchedAt = Date.now();
  return { data, cache: { state: "refreshed", fetchedAt, expiresAt: fetchedAt + ttlMs() } };
}

async function fetchProfile(tag: string): Promise<BrawlPlayer> {
  const serviceUrl = process.env.BRAWLSTATS_SERVICE_URL?.trim().replace(/\/$/, "");
  if (!serviceUrl) throw new AdapterError("NOT_CONFIGURED", "Brawl Stars live stats are not configured for StatsConnect yet.");
  let response: Response;
  try {
    response = await fetch(`${serviceUrl}/api/player?tag=${encodeURIComponent(displayTag(tag))}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new AdapterError("UPSTREAM_UNAVAILABLE", "Brawl Stars stats could not be reached. Try again shortly.");
  }
  if (!response.ok) {
    if (response.status === 400) throw new AdapterError("INVALID_TAG", "That Brawl Stars player tag is not valid.");
    if (response.status === 403) throw new AdapterError("UPSTREAM_FORBIDDEN", "The Brawl Stars stats service rejected this request.");
    if (response.status === 404) throw new AdapterError("PROFILE_NOT_FOUND", "No Brawl Stars profile was found for that tag.");
    if (response.status === 429) throw new AdapterError("RATE_LIMITED", "Brawl Stars is rate-limiting requests. Try again shortly.");
    throw new AdapterError("UPSTREAM_UNAVAILABLE", "Brawl Stars stats are temporarily unavailable.");
  }
  try {
    return parsePayload(await response.json() as unknown);
  } catch (error) {
    if (error instanceof AdapterError) throw error;
    throw new AdapterError("BAD_UPSTREAM_RESPONSE", "Brawl Stars returned an unreadable response.");
  }
}

function summary(player: BrawlPlayer, tag: string): ProfileSummary {
  return {
    game: "brawl-stars",
    playerTag: displayTag(tag),
    display: {
      name: player.name,
      avatarUrl: player.iconId === undefined ? null : `https://cdn.brawlify.com/profile-icons/regular/${player.iconId}.png`,
      headline: player.trophies === undefined ? null : { label: "Trophies", value: player.trophies },
      affiliation: player.club ? { name: player.club.name, tag: player.club.tag ?? null } : null,
    },
  };
}

async function getSummary(input: string): Promise<AdapterResult<ProfileSummary>> {
  const tag = normalizeTag(input);
  return result(summary(await fetchProfile(tag), tag));
}

export const brawlAdapter: GameAdapter = {
  game: "brawl-stars",
  normalizeTag,
  getProfileSummary: getSummary,
};
