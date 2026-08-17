declare const process: { env: Record<string, string | undefined> };

const OFFICIAL_BASE_URL = "https://api.brawlstars.com/v1";
const PUBLIC_METADATA_BASE_URL = "https://api.brawlapi.com/v1";
const TAG_PATTERN = /^[0289PYLQGRJCUV]{3,15}$/;

export type BrawlUpstreamSource = "official" | "public_metadata";
export type BrawlUpstreamErrorCode =
  | "invalid_tag"
  | "not_configured"
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "upstream_rejected"
  | "unavailable"
  | "invalid_response";

export type BrawlUpstreamTelemetryEvent = {
  source: BrawlUpstreamSource;
  endpoint: string;
  status: number;
  ok: boolean;
  durationMs: number;
  errorCode?: BrawlUpstreamErrorCode;
};

export type BrawlUpstreamError = {
  code: BrawlUpstreamErrorCode;
  message: string;
  retryable: boolean;
};

export type BrawlIntakeSuccess<T> = {
  ok: true;
  source: BrawlUpstreamSource;
  endpoint: string;
  status: number;
  value: T;
  rawPayload: unknown;
  rawBody: string;
};

export type BrawlIntakeFailure = {
  ok: false;
  source: BrawlUpstreamSource;
  endpoint: string;
  status: number;
  error: BrawlUpstreamError;
  rawPayload: unknown;
  rawBody: string;
};

export type BrawlIntakeResult<T> = BrawlIntakeSuccess<T> | BrawlIntakeFailure;

export type BrawlEquipment = { id: number; name: string };
export type BrawlOwnedBrawler = {
  id: number;
  name: string;
  power: number;
  rank: number;
  trophies: number;
  highestTrophies: number;
  gadgets: BrawlEquipment[];
  starPowers: BrawlEquipment[];
  gears: BrawlEquipment[];
  hypercharges: BrawlEquipment[];
};

export type BrawlPlayerSighting = {
  tag: string;
  name: string;
  clubTag?: string;
  clubName?: string;
  trophies?: number;
  iconId?: number;
};

export type BrawlProfileSnapshot = {
  tag: string;
  name: string;
  trophies: number;
  highestTrophies: number;
  expLevel: number;
  victory3v3: number;
  soloVictories: number;
  duoVictories: number;
  clubTag?: string;
  clubName?: string;
  iconId?: number;
  brawlerCount: number;
  power11Count: number;
  rankedCurrent?: number;
  rankedCurrentName?: string;
  rankedSeasonBest?: number;
  rankedSeasonBestName?: string;
  rankedBest?: number;
  rankedBestName?: string;
  brawlers: BrawlOwnedBrawler[];
};

export type BrawlClubSnapshot = {
  tag: string;
  name: string;
  description?: string;
  type?: string;
  badgeId?: number;
  requiredTrophies?: number;
  trophies: number;
  members: Array<{
    tag: string;
    name: string;
    role?: string;
    trophies: number;
    iconId?: number;
  }>;
};

export type BrawlBattleLog = {
  items: unknown[];
  latestBattleTime?: string;
};

export type BrawlRankingKind = "players" | "clubs" | "brawlers";
export type BrawlRankings = {
  items: unknown[];
  tags: string[];
  sightings: BrawlPlayerSighting[];
};

export type BrawlPublicCatalog = { items: unknown[] };

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Environment = Record<string, string | undefined>;
type TelemetryHook = (event: BrawlUpstreamTelemetryEvent) => void | Promise<void>;

export type BrawlUpstreamIntakeOptions = {
  fetch?: Fetcher;
  environment?: Environment;
  telemetry?: TelemetryHook;
  now?: () => number;
};

export type OfficialRankingsInput = {
  country: string;
  kind: BrawlRankingKind;
  limit: number;
  brawlerId?: number;
};

export type BrawlUpstreamIntake = ReturnType<typeof createBrawlUpstreamIntake>;

export function normalizeBrawlTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().toUpperCase().replace(/^#/, "");
  return TAG_PATTERN.test(tag) ? `#${tag}` : null;
}

export function brawlTagKey(value: unknown): string | null {
  return normalizeBrawlTag(value)?.slice(1) ?? null;
}

export function createBrawlUpstreamIntake(options: BrawlUpstreamIntakeOptions = {}) {
  const fetcher = options.fetch ?? fetch;
  const environment = options.environment ?? process.env;
  const telemetry = options.telemetry;
  const now = options.now ?? Date.now;

  async function emit(event: BrawlUpstreamTelemetryEvent): Promise<void> {
    try {
      await telemetry?.(event);
    } catch (error: unknown) {
      console.error("Brawl upstream telemetry failed", error);
    }
  }

  function officialToken(): string | null {
    return environment.BRAWL_STARS_API_TOKEN?.trim() || null;
  }

  function officialBaseUrl(): string {
    return normalizedBaseUrl(environment.BRAWL_STARS_API_BASE_URL, OFFICIAL_BASE_URL);
  }

  function publicMetadataBaseUrl(): string {
    return normalizedBaseUrl(environment.BRAWL_PUBLIC_METADATA_BASE_URL, PUBLIC_METADATA_BASE_URL);
  }

  async function observed<T>(operation: () => Promise<BrawlIntakeResult<T>>): Promise<BrawlIntakeResult<T>> {
    const startedAt = now();
    const result = await operation();
    await emit({
      source: result.source,
      endpoint: result.endpoint,
      status: result.status,
      ok: result.ok,
      durationMs: Math.max(0, now() - startedAt),
      ...(!result.ok ? { errorCode: result.error.code } : {}),
    });
    return result;
  }

  async function acquire(
    source: BrawlUpstreamSource,
    endpoint: string,
    path: string,
  ): Promise<BrawlIntakeResult<unknown>> {
    const token = source === "official" ? officialToken() : null;
    if (source === "official" && !token) {
      return localFailure(
        source,
        endpoint,
        "not_configured",
        "BRAWL_STARS_API_TOKEN is not configured.",
        false,
        0,
      );
    }

    try {
      const baseUrl = source === "official" ? officialBaseUrl() : publicMetadataBaseUrl();
      const response = await fetcher(`${baseUrl}${path}`, {
        headers: source === "official"
          ? { Authorization: `Bearer ${token}` }
          : { Accept: "application/json" },
      });
      const rawBody = await response.text();
      const rawPayload = parseJson(rawBody);
      if (!response.ok) {
        const error = classifyStatus(response.status, source);
        return {
          ok: false,
          source,
          endpoint,
          status: response.status,
          error,
          rawPayload,
          rawBody,
        };
      }

      if (rawPayload === null) {
        const failure = localFailure(
          source,
          endpoint,
          "invalid_response",
          `${sourceName(source)} returned invalid JSON.`,
          true,
          502,
          rawBody,
        );
        return failure;
      }

      return {
        ok: true,
        source,
        endpoint,
        status: response.status,
        value: rawPayload,
        rawPayload,
        rawBody,
      };
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "Unknown network error";
      const failure = localFailure(
        source,
        endpoint,
        "unavailable",
        `${sourceName(source)} could not be reached. ${message}`,
        true,
        502,
      );
      return failure;
    }
  }

  async function player(tagValue: string): Promise<BrawlIntakeResult<BrawlProfileSnapshot>> {
    const tag = normalizeBrawlTag(tagValue);
    if (!tag) return invalidTag("players/detail");
    const result = await acquire("official", "players/detail", `/players/${encodeURIComponent(tag)}`);
    if (!result.ok) return result;
    const snapshot = profileSnapshot(result.rawPayload);
    return snapshot ? withValue(result, snapshot) : invalidPayload(result, "player profile");
  }

  async function battleLog(tagValue: string): Promise<BrawlIntakeResult<BrawlBattleLog>> {
    const tag = normalizeBrawlTag(tagValue);
    if (!tag) return invalidTag("players/battlelog");
    const result = await acquire(
      "official",
      "players/battlelog",
      `/players/${encodeURIComponent(tag)}/battlelog`,
    );
    if (!result.ok) return result;
    const items = itemsFrom(result.rawPayload);
    return withValue(result, { items, latestBattleTime: latestBattleTime(items) });
  }

  async function club(tagValue: string): Promise<BrawlIntakeResult<BrawlClubSnapshot>> {
    const tag = normalizeBrawlTag(tagValue);
    if (!tag) return invalidTag("clubs/detail");
    const result = await acquire("official", "clubs/detail", `/clubs/${encodeURIComponent(tag)}`);
    if (!result.ok) return result;
    const snapshot = clubSnapshot(result.rawPayload);
    return snapshot ? withValue(result, snapshot) : invalidPayload(result, "club profile");
  }

  async function rankings(input: OfficialRankingsInput): Promise<BrawlIntakeResult<BrawlRankings>> {
    const country = input.country.toLowerCase();
    const path = input.kind === "brawlers"
      ? `/rankings/${country}/brawlers/${input.brawlerId ?? 0}?limit=${input.limit}`
      : `/rankings/${country}/${input.kind}?limit=${input.limit}`;
    const result = await acquire("official", `rankings/${input.kind}`, path);
    if (!result.ok) return result;
    const items = itemsFrom(result.rawPayload);
    const tags = unique(items.flatMap((item) => {
      const tag = normalizeBrawlTag(asRecord(item)?.tag);
      return tag ? [tag] : [];
    }));
    const sightings = input.kind === "players"
      ? items.flatMap((item) => {
          const sighting = playerSighting(item);
          return sighting ? [sighting] : [];
        })
      : [];
    return withValue(result, { items, tags, sightings });
  }

  async function eventRotation(): Promise<BrawlIntakeResult<unknown>> {
    return await acquire("official", "events/rotation", "/events/rotation");
  }

  async function publicCatalog(
    kind: "brawlers" | "maps" | "gamemodes",
  ): Promise<BrawlIntakeResult<BrawlPublicCatalog>> {
    const result = await acquire("public_metadata", `metadata/${kind}`, `/${kind}`);
    if (!result.ok) return result;
    return withValue(result, { items: catalogItemsFrom(result.rawPayload) });
  }

  return {
    official: {
      isConfigured: (): boolean => officialToken() !== null,
      player: (tag: string): Promise<BrawlIntakeResult<BrawlProfileSnapshot>> => observed(() => player(tag)),
      battleLog: (tag: string): Promise<BrawlIntakeResult<BrawlBattleLog>> => observed(() => battleLog(tag)),
      club: (tag: string): Promise<BrawlIntakeResult<BrawlClubSnapshot>> => observed(() => club(tag)),
      rankings: (input: OfficialRankingsInput): Promise<BrawlIntakeResult<BrawlRankings>> => (
        observed(() => rankings(input))
      ),
      eventRotation: (): Promise<BrawlIntakeResult<unknown>> => observed(eventRotation),
    },
    publicMetadata: {
      brawlers: (): Promise<BrawlIntakeResult<BrawlPublicCatalog>> => observed(() => publicCatalog("brawlers")),
      maps: (): Promise<BrawlIntakeResult<BrawlPublicCatalog>> => observed(() => publicCatalog("maps")),
      gamemodes: (): Promise<BrawlIntakeResult<BrawlPublicCatalog>> => observed(() => publicCatalog("gamemodes")),
    },
  };
}

function normalizedBaseUrl(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/, "");
}

function sourceName(source: BrawlUpstreamSource): string {
  return source === "official" ? "The Brawl Stars API" : "Brawl public metadata";
}

function parseJson(rawBody: string): unknown | null {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

function classifyStatus(status: number, source: BrawlUpstreamSource): BrawlUpstreamError {
  if (status === 401 || status === 403) {
    return { code: "unauthorized", message: `${sourceName(source)} rejected its credentials.`, retryable: false };
  }
  if (status === 404) {
    return { code: "not_found", message: `${sourceName(source)} could not find that resource.`, retryable: false };
  }
  if (status === 429) {
    return { code: "rate_limited", message: `${sourceName(source)} rate limit was reached.`, retryable: true };
  }
  return {
    code: "upstream_rejected",
    message: `${sourceName(source)} returned status ${status}.`,
    retryable: status >= 500,
  };
}

function localFailure(
  source: BrawlUpstreamSource,
  endpoint: string,
  code: BrawlUpstreamErrorCode,
  message: string,
  retryable: boolean,
  status: number,
  rawBody = "",
): BrawlIntakeFailure {
  return {
    ok: false,
    source,
    endpoint,
    status,
    error: { code, message, retryable },
    rawPayload: rawBody ? parseJson(rawBody) : null,
    rawBody,
  };
}

function invalidTag(endpoint: string): BrawlIntakeFailure {
  return localFailure(
    "official",
    endpoint,
    "invalid_tag",
    "Enter a valid Brawl Stars tag.",
    false,
    400,
  );
}

function withValue<T>(result: BrawlIntakeSuccess<unknown>, value: T): BrawlIntakeSuccess<T> {
  return { ...result, value };
}

function invalidPayload(
  result: BrawlIntakeSuccess<unknown>,
  description: string,
): BrawlIntakeFailure {
  return {
    ok: false,
    source: result.source,
    endpoint: result.endpoint,
    status: 502,
    error: {
      code: "invalid_response",
      message: `${sourceName(result.source)} returned an invalid ${description}.`,
      retryable: true,
    },
    rawPayload: result.rawPayload,
    rawBody: result.rawBody,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  return values.map(finiteNumber).find((value) => value !== undefined);
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function equipment(value: unknown): BrawlEquipment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    const id = finiteNumber(record?.id);
    const name = firstString(record?.name);
    return id !== undefined && name ? [{ id, name }] : [];
  });
}

function ownedBrawler(value: unknown): BrawlOwnedBrawler | null {
  const record = asRecord(value);
  const id = finiteNumber(record?.id);
  const name = firstString(record?.name);
  if (id === undefined || !name) return null;
  return {
    id,
    name,
    power: finiteNumber(record?.power) ?? 0,
    rank: finiteNumber(record?.rank) ?? 0,
    trophies: finiteNumber(record?.trophies) ?? 0,
    highestTrophies: finiteNumber(record?.highestTrophies) ?? 0,
    gadgets: equipment(record?.gadgets),
    starPowers: equipment(record?.starPowers),
    gears: equipment(record?.gears),
    hypercharges: equipment(record?.hypercharges ?? record?.hypercharge ?? record?.buffies),
  };
}

function playerSighting(
  value: unknown,
  fallbackClub?: { tag?: string; name?: string },
): BrawlPlayerSighting | null {
  const record = asRecord(value);
  const tag = normalizeBrawlTag(record?.tag);
  const name = firstString(record?.name);
  if (!tag || !name) return null;
  const club = asRecord(record?.club);
  const icon = asRecord(record?.icon);
  return {
    tag,
    name,
    clubTag: normalizeBrawlTag(club?.tag) ?? fallbackClub?.tag,
    clubName: firstString(club?.name) ?? fallbackClub?.name,
    trophies: finiteNumber(record?.trophies),
    iconId: finiteNumber(icon?.id),
  };
}

function profileSnapshot(value: unknown): BrawlProfileSnapshot | null {
  const profile = asRecord(value);
  const sighting = playerSighting(value);
  if (!profile || !sighting) return null;
  const rawBrawlers = Array.isArray(profile.brawlers) ? profile.brawlers : [];
  const brawlers = rawBrawlers
    .map(ownedBrawler)
    .filter((brawler): brawler is BrawlOwnedBrawler => brawler !== null);
  const ranked = asRecord(profile.ranked);
  const rankedSeason = asRecord(profile.rankedSeason ?? profile.currentRankedSeason);
  return {
    ...sighting,
    trophies: finiteNumber(profile.trophies) ?? 0,
    highestTrophies: finiteNumber(profile.highestTrophies) ?? 0,
    expLevel: finiteNumber(profile.expLevel) ?? 0,
    victory3v3: finiteNumber(profile["3vs3Victories"]) ?? 0,
    soloVictories: finiteNumber(profile.soloVictories) ?? 0,
    duoVictories: finiteNumber(profile.duoVictories) ?? 0,
    brawlerCount: rawBrawlers.length,
    power11Count: rawBrawlers.filter((brawler) => finiteNumber(asRecord(brawler)?.power) === 11).length,
    rankedCurrent: firstNumber(ranked?.currentRank, ranked?.current, profile.rankedCurrent),
    rankedCurrentName: firstString(ranked?.currentRankName, ranked?.currentName, profile.rankedCurrentName),
    rankedSeasonBest: firstNumber(ranked?.seasonBestRank, rankedSeason?.bestRank, profile.rankedSeasonBest),
    rankedSeasonBestName: firstString(
      ranked?.seasonBestRankName,
      rankedSeason?.bestRankName,
      profile.rankedSeasonBestName,
    ),
    rankedBest: firstNumber(ranked?.bestRank, ranked?.highestRank, profile.rankedBest),
    rankedBestName: firstString(ranked?.bestRankName, ranked?.highestRankName, profile.rankedBestName),
    brawlers,
  };
}

function clubSnapshot(value: unknown): BrawlClubSnapshot | null {
  const club = asRecord(value);
  const tag = normalizeBrawlTag(club?.tag);
  const name = firstString(club?.name);
  if (!club || !tag || !name) return null;
  const badge = asRecord(club.badge);
  const members = (Array.isArray(club.members) ? club.members : []).flatMap((value) => {
    const member = asRecord(value);
    const memberTag = normalizeBrawlTag(member?.tag);
    const memberName = firstString(member?.name);
    const icon = asRecord(member?.icon);
    if (!memberTag || !memberName) return [];
    return [{
      tag: memberTag,
      name: memberName,
      role: firstString(member?.role),
      trophies: finiteNumber(member?.trophies) ?? 0,
      iconId: finiteNumber(icon?.id),
    }];
  });
  return {
    tag,
    name,
    description: firstString(club.description),
    type: firstString(club.type),
    badgeId: finiteNumber(club.badgeId) ?? finiteNumber(badge?.id),
    requiredTrophies: finiteNumber(club.requiredTrophies),
    trophies: finiteNumber(club.trophies) ?? 0,
    members,
  };
}

function itemsFrom(value: unknown): unknown[] {
  const record = asRecord(value);
  return record && Array.isArray(record.items) ? record.items : [];
}

function catalogItemsFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (Array.isArray(record?.list)) return record.list;
  return Array.isArray(record?.items) ? record.items : [];
}

function latestBattleTime(items: unknown[]): string | undefined {
  return items.reduce<string | undefined>((latest, item) => {
    const battleTime = asRecord(item)?.battleTime;
    if (typeof battleTime !== "string") return latest;
    return !latest || battleTime > latest ? battleTime : latest;
  }, undefined);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
