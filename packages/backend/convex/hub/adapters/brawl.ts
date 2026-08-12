import { displayTag, normalizeTag } from "./tags";
import {
  AdapterError,
  type AdapterLoadResult,
  type GameAdapter,
  type ProfileItem,
  type ProfileStats,
  type ProfileSummary,
  type RecentMatch,
} from "./types";

declare const process: { env: Record<string, string | undefined> };

type Brawler = {
  id?: number;
  name: string;
  power?: number;
  rank?: number;
  trophies?: number;
  highestTrophies?: number;
};

type BrawlPlayer = {
  name: string;
  trophies?: number;
  highestTrophies?: number;
  expLevel?: number;
  expPoints?: number;
  threeVsThreeVictories?: number;
  soloVictories?: number;
  duoVictories?: number;
  iconId?: number;
  club?: { tag?: string; name: string };
  brawlers: Brawler[];
};

type BrawlBattle = {
  battleTime?: string;
  eventMode?: string;
  eventMap?: string;
  battleMode?: string;
  battleType?: string;
  result?: string;
  rank?: number;
  trophyChange?: number;
};

type ServicePayload = { player: BrawlPlayer; battles: BrawlBattle[] };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseBrawler(value: unknown): Brawler | null {
  if (!record(value) || typeof value.name !== "string") return null;
  return {
    name: value.name,
    id: optionalNumber(value.id),
    power: optionalNumber(value.power),
    rank: optionalNumber(value.rank),
    trophies: optionalNumber(value.trophies),
    highestTrophies: optionalNumber(value.highestTrophies),
  };
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
    highestTrophies: optionalNumber(value.highestTrophies),
    expLevel: optionalNumber(value.expLevel),
    expPoints: optionalNumber(value.expPoints),
    threeVsThreeVictories: optionalNumber(value["3vs3Victories"]),
    soloVictories: optionalNumber(value.soloVictories),
    duoVictories: optionalNumber(value.duoVictories),
    iconId: icon ? optionalNumber(icon.id) : undefined,
    club,
    brawlers: Array.isArray(value.brawlers)
      ? value.brawlers.map(parseBrawler).filter((item): item is Brawler => item !== null)
      : [],
  };
}

function parseBattle(value: unknown): BrawlBattle | null {
  // Every real battle-log entry carries a battleTime; without it the entry is
  // junk and would otherwise render as an empty "unknown" match.
  if (!record(value) || typeof value.battleTime !== "string") return null;
  const event = record(value.event) ? value.event : null;
  const battle = record(value.battle) ? value.battle : null;
  return {
    battleTime: optionalString(value.battleTime),
    eventMode: event ? optionalString(event.mode) : undefined,
    eventMap: event ? optionalString(event.map) : undefined,
    battleMode: battle ? optionalString(battle.mode) : undefined,
    battleType: battle ? optionalString(battle.type) : undefined,
    result: battle ? optionalString(battle.result) : undefined,
    rank: battle ? optionalNumber(battle.rank) : undefined,
    trophyChange: battle ? optionalNumber(battle.trophyChange) : undefined,
  };
}

function parsePayload(value: unknown): ServicePayload {
  if (!record(value)) {
    throw new AdapterError("BAD_UPSTREAM_RESPONSE", "Brawl Stars returned an unexpected response.");
  }
  const battleLog = record(value.battleLog) ? value.battleLog : null;
  const items = battleLog && Array.isArray(battleLog.items) ? battleLog.items : [];
  return {
    player: parsePlayer(value.player),
    battles: items.map(parseBattle).filter((item): item is BrawlBattle => item !== null),
  };
}

function ttlMs(): number {
  const configured = Number(process.env.BRAWLSTATS_CACHE_TTL_SECONDS ?? "300");
  return Number.isFinite(configured) && configured > 0 ? configured * 1_000 : 300_000;
}

function result<T>(data: T): AdapterLoadResult<T> {
  const fetchedAt = Date.now();
  return { data, cache: { state: "refreshed", fetchedAt, expiresAt: fetchedAt + ttlMs() } };
}

async function fetchProfile(tag: string): Promise<ServicePayload> {
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

function roster(player: BrawlPlayer): ProfileItem[] {
  return player.brawlers.map((brawler) => ({
    kind: "brawler",
    id: String(brawler.id ?? brawler.name),
    name: brawler.name,
    level: brawler.power ?? null,
    rank: brawler.rank ?? null,
    score: brawler.trophies ?? null,
    bestScore: brawler.highestTrophies ?? null,
    imageUrl: brawler.id === undefined ? null : `https://cdn.brawlify.com/brawlers/borderless/${brawler.id}.png`,
  }));
}

function parseTime(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/^(\d{4})(\d{2})(\d{2})T/, "$1-$2-$3T").replace(/\.\d{3}Z$/, "Z");
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function matches(items: BrawlBattle[]): RecentMatch[] {
  return items.slice(0, 25).map((item, index) => {
    const raw = item.result?.toLowerCase();
    const matchResult: RecentMatch["result"] = raw === "victory" ? "win"
      : raw === "defeat" ? "loss"
      : raw === "draw" ? "draw"
      : item.rank !== undefined ? "ranked"
      : "unknown";
    return {
      id: `${item.battleTime ?? "battle"}-${index}`,
      occurredAt: parseTime(item.battleTime),
      mode: item.eventMode ?? item.battleMode ?? item.battleType ?? "Battle",
      map: item.eventMap ?? null,
      result: matchResult,
      rank: item.rank ?? null,
      scoreDelta: item.trophyChange ?? null,
    };
  });
}

function stats(payload: ServicePayload, tag: string): ProfileStats {
  const player = payload.player;
  return {
    game: "brawl-stars",
    playerTag: displayTag(tag),
    summary: summary(player, tag),
    metrics: [
      ["trophies", "Trophies", player.trophies],
      ["highest-trophies", "Highest trophies", player.highestTrophies],
      ["exp-level", "Experience level", player.expLevel],
      ["exp-points", "Experience points", player.expPoints],
      ["3v3-wins", "3v3 wins", player.threeVsThreeVictories],
      ["solo-wins", "Solo wins", player.soloVictories],
      ["duo-wins", "Duo wins", player.duoVictories],
    ].filter((entry): entry is [string, string, number] => typeof entry[2] === "number")
      .map(([key, label, value]) => ({ key, label, value, format: "integer" })),
    roster: roster(player),
    currentLoadout: [],
    recentMatches: matches(payload.battles),
    upcoming: [],
    warnings: [],
  };
}

async function loadBoth(input: string): Promise<{ summary: ProfileSummary; stats: ProfileStats; tag: string }> {
  const tag = normalizeTag(input);
  const payload = await fetchProfile(tag);
  return { summary: summary(payload.player, tag), stats: stats(payload, tag), tag };
}

async function getSummary(input: string): Promise<AdapterLoadResult<ProfileSummary>> {
  const loaded = await loadBoth(input);
  const output = result(loaded.summary);
  return { ...output, primed: [{ resource: "stats", data: loaded.stats }] };
}

async function getStats(input: string): Promise<AdapterLoadResult<ProfileStats>> {
  const loaded = await loadBoth(input);
  const output = result(loaded.stats);
  return { ...output, primed: [{ resource: "summary", data: loaded.summary }] };
}

export const brawlAdapter: GameAdapter = {
  game: "brawl-stars",
  normalizeTag,
  connectProfile: getSummary,
  getProfileSummary: getSummary,
  getStats,
};
