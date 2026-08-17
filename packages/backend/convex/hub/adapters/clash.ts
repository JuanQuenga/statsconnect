import { displayTag, normalizeTag, upstreamTag } from "./tags";
import {
  AdapterError,
  type AdapterResult,
  type GameAdapter,
  type ProfileSummary,
} from "./types";

declare const process: { env: Record<string, string | undefined> };

type ClashCard = { name: string; imageUrl?: string };
type ClashPlayer = {
  name: string;
  trophies?: number;
  clan?: { tag?: string; name: string };
  currentFavouriteCard?: ClashCard;
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

function parseCard(value: unknown): ClashCard | null {
  if (!record(value) || typeof value.name !== "string") return null;
  const iconUrls = record(value.iconUrls) ? value.iconUrls : null;
  return {
    name: value.name,
    imageUrl: iconUrls ? optionalString(iconUrls.medium) : undefined,
  };
}

function parsePlayer(value: unknown): ClashPlayer {
  if (!record(value) || typeof value.name !== "string" || typeof value.tag !== "string") {
    throw new AdapterError("BAD_UPSTREAM_RESPONSE", "Clash Royale returned an unexpected player profile.");
  }
  const clan = record(value.clan) && typeof value.clan.name === "string"
    ? { name: value.clan.name, tag: optionalString(value.clan.tag) }
    : undefined;
  return {
    name: value.name,
    trophies: optionalNumber(value.trophies),
    clan,
    currentFavouriteCard: parseCard(value.currentFavouriteCard) ?? undefined,
  };
}

function ttlMs(): number {
  const configured = Number(process.env.CLASH_ROYALE_CACHE_TTL_SECONDS ?? "900");
  return Number.isFinite(configured) && configured > 0 ? configured * 1_000 : 900_000;
}

function result<T>(data: T): AdapterResult<T> {
  const fetchedAt = Date.now();
  return { data, cache: { state: "refreshed", fetchedAt, expiresAt: fetchedAt + ttlMs() } };
}

function baseUrl(): string {
  return (process.env.CLASH_ROYALE_API_BASE_URL ?? "https://api.clashroyale.com/v1").replace(/\/$/, "");
}

async function request(endpoint: string): Promise<unknown> {
  const token = process.env.CLASH_ROYALE_API_TOKEN?.trim();
  if (!token) throw new AdapterError("NOT_CONFIGURED", "Clash Royale live stats are not configured for StatsConnect yet.");
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${endpoint}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new AdapterError("UPSTREAM_UNAVAILABLE", "Clash Royale stats could not be reached. Try again shortly.");
  }
  if (!response.ok) {
    if (response.status === 400) throw new AdapterError("INVALID_TAG", "That Clash Royale player tag is not valid.");
    if (response.status === 403) throw new AdapterError("UPSTREAM_FORBIDDEN", "Clash Royale rejected the StatsConnect server. Check the token and its allowed IP address.");
    if (response.status === 404) throw new AdapterError("PROFILE_NOT_FOUND", "No Clash Royale profile was found for that tag.");
    if (response.status === 429) throw new AdapterError("RATE_LIMITED", "Clash Royale is rate-limiting requests. Try again shortly.");
    throw new AdapterError("UPSTREAM_UNAVAILABLE", "Clash Royale stats are temporarily unavailable.");
  }
  try {
    return await response.json() as unknown;
  } catch {
    throw new AdapterError("BAD_UPSTREAM_RESPONSE", "Clash Royale returned an unreadable response.");
  }
}

function summary(player: ClashPlayer, tag: string): ProfileSummary {
  return {
    game: "clash-royale",
    playerTag: displayTag(tag),
    display: {
      name: player.name,
      avatarUrl: player.currentFavouriteCard?.imageUrl ?? null,
      headline: player.trophies === undefined ? null : { label: "Trophies", value: player.trophies },
      affiliation: player.clan ? { name: player.clan.name, tag: player.clan.tag ?? null } : null,
    },
  };
}

async function getSummary(tagInput: string): Promise<AdapterResult<ProfileSummary>> {
  const tag = normalizeTag(tagInput);
  return result(summary(parsePlayer(await request(`/players/${upstreamTag(tag)}`)), tag));
}

export const clashAdapter: GameAdapter = {
  game: "clash-royale",
  normalizeTag,
  getProfileSummary: getSummary,
};
