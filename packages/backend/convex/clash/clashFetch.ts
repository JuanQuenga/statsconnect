/**
 * The Clash Upstream Module owns API configuration, requests, response checks,
 * errors, and request logs for the Platform Backend's Clash namespace.
 *
 * Callers still own domain policy: stale-cache fallback, optional river-race
 * data, crawl retries, and clan-observation scheduling remain behind their
 * existing internal seams.
 */

import { anyApi } from "convex/server";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
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
} from "./lib/types";

declare const process: { env: Record<string, string | undefined> };

export const GLOBAL_LOCATION_ID = 57000006;

export type ClashUpstreamErrorKind =
  | "configuration"
  | "network"
  | "http"
  | "invalid_response";

export type ClashUpstreamFailure = {
  ok: false;
  kind: ClashUpstreamErrorKind;
  status: number;
  code: string;
  message: string;
  retryable: boolean;
};

export type ClashUpstreamResponse<T> =
  | { ok: true; status: number; data: T }
  | ClashUpstreamFailure;

export class ClashUpstreamError extends Error {
  readonly kind: ClashUpstreamErrorKind;
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor(failure: ClashUpstreamFailure) {
    super(failure.message);
    this.name = "ClashUpstreamError";
    this.kind = failure.kind;
    this.status = failure.status;
    this.code = failure.code;
    this.retryable = failure.retryable;
  }
}

export type ClashUpstreamObservation = {
  operation: string;
  endpoint: string;
  status: number;
  ok: boolean;
  fetchedAt: number;
  durationMs: number;
  errorKind?: ClashUpstreamErrorKind;
};

export type ClashClanSearch = {
  name?: string;
  locationId?: number;
  minMembers?: number;
  maxMembers?: number;
  minScore?: number;
  limit: number;
};

type Environment = Readonly<Record<string, string | undefined>>;
type FetchTransport = (url: string, init: RequestInit) => Promise<Response>;
type ResponseDecoder<T> = (value: unknown) => T;
type UpstreamOptions = {
  environment?: Environment;
  transport?: FetchTransport;
  observe?: (observation: ClashUpstreamObservation) => Promise<void>;
  now?: () => number;
};
type RequestDefinition<T> = {
  operation: string;
  endpoint: string;
  telemetryEndpoint: string;
  decode: ResponseDecoder<T>;
};
type ApiErrorBody = { message?: string; reason?: string };

const cacheApi = anyApi.clash.cache;
type ActionCtx = Pick<GenericActionCtx<GenericDataModel>, "runMutation">;

class ResponseShapeError extends Error {
  constructor(path: string, expectation: string) {
    super(`Expected ${path} to be ${expectation}.`);
    this.name = "ResponseShapeError";
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ResponseShapeError(path, "an object");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: Record<string, unknown>, key: string, path: string): void {
  if (typeof value[key] !== "string") throw new ResponseShapeError(`${path}.${key}`, "a string");
}

function requiredNumber(value: Record<string, unknown>, key: string, path: string): void {
  if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
    throw new ResponseShapeError(`${path}.${key}`, "a finite number");
  }
}

function optionalString(value: Record<string, unknown>, key: string, path: string): void {
  if (value[key] !== undefined && value[key] !== null && typeof value[key] !== "string") {
    throw new ResponseShapeError(`${path}.${key}`, "a string when present");
  }
}

function optionalNumber(value: Record<string, unknown>, key: string, path: string): void {
  if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]))) {
    throw new ResponseShapeError(`${path}.${key}`, "a finite number when present");
  }
}

function optionalArray(
  value: Record<string, unknown>,
  key: string,
  path: string,
  validate: (item: unknown, itemPath: string) => void,
): void {
  const items = value[key];
  if (items === undefined) return;
  if (!Array.isArray(items)) throw new ResponseShapeError(`${path}.${key}`, "an array when present");
  items.forEach((item, index) => validate(item, `${path}.${key}[${index}]`));
}

function optionalObject(
  value: Record<string, unknown>,
  key: string,
  path: string,
  validate: (item: unknown, itemPath: string) => void,
): void {
  if (value[key] === undefined) return;
  validate(value[key], `${path}.${key}`);
}

function validateCard(value: unknown, path: string): void {
  const item = record(value, path);
  requiredNumber(item, "id", path);
  requiredString(item, "name", path);
}

function validateParticipant(value: unknown, path: string): void {
  const item = record(value, path);
  optionalString(item, "tag", path);
  optionalString(item, "name", path);
  optionalArray(item, "cards", path, validateCard);
  optionalArray(item, "supportCards", path, validateCard);
}

function decodePlayer(value: unknown): ApiPlayer {
  const item = record(value, "player");
  requiredString(item, "tag", "player");
  requiredString(item, "name", "player");
  optionalNumber(item, "trophies", "player");
  optionalNumber(item, "currentWinLoseStreak", "player");
  optionalArray(item, "currentDeck", "player", validateCard);
  optionalArray(item, "currentDeckSupportCards", "player", validateCard);
  optionalArray(item, "cards", "player", validateCard);
  optionalArray(item, "supportCards", "player", validateCard);
  return value as ApiPlayer;
}

function decodeBattles(value: unknown): ApiBattle[] {
  if (!Array.isArray(value)) throw new ResponseShapeError("battle log", "an array");
  value.forEach((battle, index) => {
    const item = record(battle, `battle log[${index}]`);
    optionalString(item, "battleTime", `battle log[${index}]`);
    optionalArray(item, "team", `battle log[${index}]`, validateParticipant);
    optionalArray(item, "opponent", `battle log[${index}]`, validateParticipant);
  });
  return value as ApiBattle[];
}

function decodeChests(value: unknown): ApiChestList {
  const item = record(value, "chests");
  optionalArray(item, "items", "chests", (chest, path) => {
    const row = record(chest, path);
    optionalNumber(row, "index", path);
    optionalString(row, "name", path);
  });
  return value as ApiChestList;
}

function validateClanMember(value: unknown, path: string): void {
  const item = record(value, path);
  optionalString(item, "tag", path);
  optionalString(item, "name", path);
  optionalNumber(item, "trophies", path);
}

function decodeClan(value: unknown): ApiClan {
  const item = record(value, "clan");
  requiredString(item, "tag", "clan");
  requiredString(item, "name", "clan");
  optionalArray(item, "memberList", "clan", validateClanMember);
  return value as ApiClan;
}

function decodeCards(value: unknown): ApiCardList {
  const item = record(value, "cards");
  optionalArray(item, "items", "cards", validateCard);
  optionalArray(item, "supportItems", "cards", validateCard);
  return value as ApiCardList;
}

function paged<T>(label: string, validateItem: (item: unknown, path: string) => void): ResponseDecoder<ApiPaged<T>> {
  return (value) => {
    const page = record(value, label);
    optionalArray(page, "items", label, validateItem);
    return value as ApiPaged<T>;
  };
}

function validateLocation(value: unknown, path: string): void {
  const item = record(value, path);
  requiredNumber(item, "id", path);
  requiredString(item, "name", path);
}

function validateRanking(value: unknown, path: string): void {
  const item = record(value, path);
  requiredString(item, "tag", path);
  requiredString(item, "name", path);
}

function validateLeaderboard(value: unknown, path: string): void {
  const item = record(value, path);
  requiredNumber(item, "id", path);
  optionalString(item, "name", path);
}

function validateTournament(value: unknown, path: string): void {
  const item = record(value, path);
  requiredString(item, "tag", path);
  optionalString(item, "name", path);
}

function decodeCurrentRiverRace(value: unknown): ApiCurrentRiverRace {
  const item = record(value, "current river race");
  optionalString(item, "state", "current river race");
  const validateRaceClan = (clan: unknown, path: string) => {
    const row = record(clan, path);
    optionalString(row, "tag", path);
    optionalArray(row, "participants", path, validateClanMember);
  };
  optionalObject(item, "clan", "current river race", validateRaceClan);
  optionalArray(item, "clans", "current river race", validateRaceClan);
  return value as ApiCurrentRiverRace;
}

function decodeRiverRaceLog(value: unknown): ApiRiverRaceLog {
  const item = record(value, "river race log");
  optionalArray(item, "items", "river race log", (entry, path) => {
    const row = record(entry, path);
    optionalNumber(row, "seasonId", path);
    optionalNumber(row, "sectionIndex", path);
    optionalArray(row, "standings", path, (standing, standingPath) => {
      const standingRow = record(standing, standingPath);
      optionalObject(standingRow, "clan", standingPath, (clan, clanPath) => {
        const clanRow = record(clan, clanPath);
        optionalString(clanRow, "tag", clanPath);
        optionalArray(clanRow, "participants", clanPath, validateClanMember);
      });
    });
  });
  return value as ApiRiverRaceLog;
}

const decodeLocations = paged<ApiLocation>("locations", validateLocation);
const decodePlayerRankings = paged<ApiPlayerRanking>("player rankings", validateRanking);
const decodeClanRankings = paged<ApiClanRanking>("clan rankings", validateRanking);
const decodeLeaderboards = paged<ApiLeaderboard>("leaderboards", validateLeaderboard);
const decodeClanSearch = paged<ApiClan>("clan search", (item) => { decodeClan(item); });
const decodeTournaments = paged<ApiTournament>("tournaments", validateTournament);

function failure(
  kind: ClashUpstreamErrorKind,
  status: number,
  code: string,
  message: string,
  retryable: boolean,
): ClashUpstreamFailure {
  return { ok: false, kind, status, code, message, retryable };
}

function configuration(environment: Environment): { baseUrl: string; token: string } | ClashUpstreamFailure {
  const token = environment.CLASH_ROYALE_API_TOKEN;
  if (!token) {
    return failure(
      "configuration",
      0,
      "MISSING_API_TOKEN",
      "Add CLASH_ROYALE_API_TOKEN to the Convex deployment environment.",
      false,
    );
  }

  const baseUrl = (environment.CLASH_ROYALE_API_BASE_URL ?? "https://api.clashroyale.com/v1").replace(/\/+$/, "");
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
  } catch {
    return failure(
      "configuration",
      0,
      "INVALID_API_BASE_URL",
      "CLASH_ROYALE_API_BASE_URL must be an absolute HTTP or HTTPS URL.",
      false,
    );
  }
  return {
    baseUrl,
    token,
  };
}

export function clashCacheTtlMs(environment: Environment = process.env): number {
  const seconds = Number(environment.CLASH_ROYALE_CACHE_TTL_SECONDS ?? 900);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : 900_000;
}

export function apiErrorMessage(status: number, body: ApiErrorBody = {}): string {
  if (status === 400) return "That tag is not valid.";
  if (status === 403) return "The Clash Royale API rejected this server. Check the API token and its allowed IP address.";
  if (status === 404) return "No Clash Royale profile was found for that tag.";
  if (status === 429) return "The Clash Royale API rate limit was reached. Try again shortly.";
  if (status >= 500) return "The Clash Royale API is temporarily unavailable.";
  return body.message ?? body.reason ?? "The Clash Royale API request failed.";
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function apiTagPath(tag: string): string {
  return encodeURIComponent(tag.startsWith("#") ? tag : `#${tag}`);
}

function clanSearchParams(search: ClashClanSearch): string {
  const params = new URLSearchParams();
  if (search.name) params.set("name", search.name);
  if (search.locationId !== undefined) params.set("locationId", String(search.locationId));
  if (search.minMembers !== undefined) params.set("minMembers", String(search.minMembers));
  if (search.maxMembers !== undefined) params.set("maxMembers", String(search.maxMembers));
  if (search.minScore !== undefined) params.set("minScore", String(search.minScore));
  params.set("limit", String(search.limit));
  return params.toString();
}

async function errorBody(response: Response): Promise<ApiErrorBody> {
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const body = value as Record<string, unknown>;
    return {
      ...(typeof body.message === "string" ? { message: body.message } : {}),
      ...(typeof body.reason === "string" ? { reason: body.reason } : {}),
    };
  } catch {
    return {};
  }
}

async function safelyObserve(
  observe: UpstreamOptions["observe"],
  observation: ClashUpstreamObservation,
): Promise<void> {
  try {
    await observe?.(observation);
  } catch {
    // A logging failure must not replace the upstream result.
  }
}

export type ClashUpstream = {
  player(tag: string): Promise<ClashUpstreamResponse<ApiPlayer>>;
  battleLog(tag: string): Promise<ClashUpstreamResponse<ApiBattle[]>>;
  upcomingChests(tag: string): Promise<ClashUpstreamResponse<ApiChestList>>;
  clan(tag: string): Promise<ClashUpstreamResponse<ApiClan>>;
  cards(): Promise<ClashUpstreamResponse<ApiCardList>>;
  currentRiverRace(tag: string): Promise<ClashUpstreamResponse<ApiCurrentRiverRace>>;
  riverRaceLog(tag: string): Promise<ClashUpstreamResponse<ApiRiverRaceLog>>;
  locations(limit: number): Promise<ClashUpstreamResponse<ApiPaged<ApiLocation>>>;
  rankings(kind: "players", locationId: number, limit: number): Promise<ClashUpstreamResponse<ApiPaged<ApiPlayerRanking>>>;
  rankings(kind: "clans" | "clanwars", locationId: number, limit: number): Promise<ClashUpstreamResponse<ApiPaged<ApiClanRanking>>>;
  leaderboards(): Promise<ClashUpstreamResponse<ApiPaged<ApiLeaderboard>>>;
  leaderboard(id: number, limit: number): Promise<ClashUpstreamResponse<ApiPaged<ApiPlayerRanking>>>;
  searchClans(search: ClashClanSearch): Promise<ClashUpstreamResponse<ApiPaged<ApiClan>>>;
  globalTournaments(): Promise<ClashUpstreamResponse<ApiPaged<ApiTournament>>>;
  searchTournaments(name: string, limit: number): Promise<ClashUpstreamResponse<ApiPaged<ApiTournament>>>;
};

export function createClashUpstream(options: UpstreamOptions = {}): ClashUpstream {
  const environment = options.environment ?? process.env;
  const transport = options.transport ?? fetch;
  const now = options.now ?? Date.now;

  async function request<T>(definition: RequestDefinition<T>): Promise<ClashUpstreamResponse<T>> {
    const startedAt = now();
    const configured = configuration(environment);
    if ("ok" in configured) {
      await safelyObserve(options.observe, {
        operation: definition.operation,
        endpoint: definition.telemetryEndpoint,
        status: configured.status,
        ok: false,
        fetchedAt: now(),
        durationMs: Math.max(0, now() - startedAt),
        errorKind: configured.kind,
      });
      return configured;
    }

    let response: Response;
    try {
      response = await transport(`${configured.baseUrl}${definition.endpoint}`, {
        headers: { Authorization: `Bearer ${configured.token}`, Accept: "application/json" },
      });
    } catch {
      const result = failure(
        "network",
        0,
        "CLASH_API_NETWORK",
        "The Clash Royale API could not be reached from the backend.",
        true,
      );
      await safelyObserve(options.observe, {
        operation: definition.operation,
        endpoint: definition.telemetryEndpoint,
        status: result.status,
        ok: false,
        fetchedAt: now(),
        durationMs: Math.max(0, now() - startedAt),
        errorKind: result.kind,
      });
      return result;
    }

    if (!response.ok) {
      const result = failure(
        "http",
        response.status,
        `CLASH_API_${response.status}`,
        apiErrorMessage(response.status, await errorBody(response)),
        retryableStatus(response.status),
      );
      await safelyObserve(options.observe, {
        operation: definition.operation,
        endpoint: definition.telemetryEndpoint,
        status: response.status,
        ok: false,
        fetchedAt: now(),
        durationMs: Math.max(0, now() - startedAt),
        errorKind: result.kind,
      });
      return result;
    }

    try {
      const raw: unknown = await response.json();
      const data = definition.decode(raw);
      await safelyObserve(options.observe, {
        operation: definition.operation,
        endpoint: definition.telemetryEndpoint,
        status: response.status,
        ok: true,
        fetchedAt: now(),
        durationMs: Math.max(0, now() - startedAt),
      });
      return { ok: true, status: response.status, data };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The JSON payload could not be decoded.";
      const result = failure(
        "invalid_response",
        response.status,
        "CLASH_API_INVALID_RESPONSE",
        `The Clash Royale API returned an invalid response. ${detail}`,
        true,
      );
      await safelyObserve(options.observe, {
        operation: definition.operation,
        endpoint: definition.telemetryEndpoint,
        status: response.status,
        ok: false,
        fetchedAt: now(),
        durationMs: Math.max(0, now() - startedAt),
        errorKind: result.kind,
      });
      return result;
    }
  }

  return {
    player: (tag) => request({ operation: "player", endpoint: `/players/${apiTagPath(tag)}`, telemetryEndpoint: "/players/{tag}", decode: decodePlayer }),
    battleLog: (tag) => request({ operation: "battleLog", endpoint: `/players/${apiTagPath(tag)}/battlelog`, telemetryEndpoint: "/players/{tag}/battlelog", decode: decodeBattles }),
    upcomingChests: (tag) => request({ operation: "upcomingChests", endpoint: `/players/${apiTagPath(tag)}/upcomingchests`, telemetryEndpoint: "/players/{tag}/upcomingchests", decode: decodeChests }),
    clan: (tag) => request({ operation: "clan", endpoint: `/clans/${apiTagPath(tag)}`, telemetryEndpoint: "/clans/{tag}", decode: decodeClan }),
    cards: () => request({ operation: "cards", endpoint: "/cards", telemetryEndpoint: "/cards", decode: decodeCards }),
    currentRiverRace: (tag) => request({ operation: "currentRiverRace", endpoint: `/clans/${apiTagPath(tag)}/currentriverrace`, telemetryEndpoint: "/clans/{tag}/currentriverrace", decode: decodeCurrentRiverRace }),
    riverRaceLog: (tag) => request({ operation: "riverRaceLog", endpoint: `/clans/${apiTagPath(tag)}/riverracelog`, telemetryEndpoint: "/clans/{tag}/riverracelog", decode: decodeRiverRaceLog }),
    locations: (limit) => request({ operation: "locations", endpoint: `/locations?limit=${limit}`, telemetryEndpoint: "/locations", decode: decodeLocations }),
    rankings: ((kind: "players" | "clans" | "clanwars", locationId: number, limit: number) => request({
      operation: `rankings.${kind}`,
      endpoint: `/locations/${locationId}/rankings/${kind}?limit=${limit}`,
      telemetryEndpoint: `/locations/{locationId}/rankings/${kind}`,
      decode: kind === "players" ? decodePlayerRankings : decodeClanRankings,
    })) as ClashUpstream["rankings"],
    leaderboards: () => request({ operation: "leaderboards", endpoint: "/leaderboards", telemetryEndpoint: "/leaderboards", decode: decodeLeaderboards }),
    leaderboard: (id, limit) => request({ operation: "leaderboard", endpoint: `/leaderboard/${id}?limit=${limit}`, telemetryEndpoint: "/leaderboard/{id}", decode: decodePlayerRankings }),
    searchClans: (search) => request({ operation: "searchClans", endpoint: `/clans?${clanSearchParams(search)}`, telemetryEndpoint: "/clans", decode: decodeClanSearch }),
    globalTournaments: () => request({ operation: "globalTournaments", endpoint: "/globaltournaments", telemetryEndpoint: "/globaltournaments", decode: decodeTournaments }),
    searchTournaments: (name, limit) => request({ operation: "searchTournaments", endpoint: `/tournaments?name=${encodeURIComponent(name)}&limit=${limit}`, telemetryEndpoint: "/tournaments", decode: decodeTournaments }),
  };
}

export function clashUpstream(ctx: ActionCtx): ClashUpstream {
  return createClashUpstream({
    observe: async (observation) => {
      await ctx.runMutation(cacheApi.logFetch, observation);
    },
  });
}

export function clashData<T>(response: ClashUpstreamResponse<T>): T {
  if (response.ok) return response.data;
  throw new ClashUpstreamError(response);
}
