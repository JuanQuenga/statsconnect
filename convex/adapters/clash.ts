import { displayTag, normalizeTag, upstreamTag } from "./tags";
import {
  AdapterError,
  type AdapterLoadResult,
  type GameAdapter,
  type ProfileItem,
  type ProfileStats,
  type ProfileSummary,
  type RecentMatch,
  type UpcomingItem,
} from "./types";

declare const process: { env: Record<string, string | undefined> };

type ClashCard = { id?: number; name: string; level?: number; imageUrl?: string };
type ClashPlayer = {
  name: string;
  expLevel?: number;
  trophies?: number;
  bestTrophies?: number;
  wins?: number;
  losses?: number;
  battleCount?: number;
  threeCrownWins?: number;
  clan?: { tag?: string; name: string };
  currentDeck: ClashCard[];
  currentDeckSupportCards: ClashCard[];
  currentFavouriteCard?: ClashCard;
  cards: ClashCard[];
};
type ClashBattle = {
  battleTime?: string;
  type?: string;
  gameMode?: string;
  arena?: string;
  ownCrowns?: number;
  opponentCrowns?: number;
  trophyChange?: number;
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
    id: optionalNumber(value.id),
    level: optionalNumber(value.level),
    imageUrl: iconUrls ? optionalString(iconUrls.medium) : undefined,
  };
}

function parseCardArray(value: unknown): ClashCard[] {
  return Array.isArray(value)
    ? value.map(parseCard).filter((card): card is ClashCard => card !== null)
    : [];
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
    expLevel: optionalNumber(value.expLevel),
    trophies: optionalNumber(value.trophies),
    bestTrophies: optionalNumber(value.bestTrophies),
    wins: optionalNumber(value.wins),
    losses: optionalNumber(value.losses),
    battleCount: optionalNumber(value.battleCount),
    threeCrownWins: optionalNumber(value.threeCrownWins),
    clan,
    currentDeck: parseCardArray(value.currentDeck),
    currentDeckSupportCards: parseCardArray(value.currentDeckSupportCards),
    currentFavouriteCard: parseCard(value.currentFavouriteCard) ?? undefined,
    cards: parseCardArray(value.cards),
  };
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && record(value[0]) ? value[0] : null;
}

function parseBattle(value: unknown): ClashBattle | null {
  if (!record(value)) return null;
  const gameMode = record(value.gameMode) ? value.gameMode : null;
  const arena = record(value.arena) ? value.arena : null;
  const team = firstRecord(value.team);
  const opponent = firstRecord(value.opponent);
  return {
    battleTime: optionalString(value.battleTime),
    type: optionalString(value.type),
    gameMode: gameMode ? optionalString(gameMode.name) : undefined,
    arena: arena ? optionalString(arena.name) : undefined,
    ownCrowns: team ? optionalNumber(team.crowns) : undefined,
    opponentCrowns: opponent ? optionalNumber(opponent.crowns) : undefined,
    trophyChange: team ? optionalNumber(team.trophyChange) : undefined,
  };
}

function parseBattles(value: unknown): ClashBattle[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(parseBattle).filter((battle): battle is ClashBattle => battle !== null);
}

function parseUpcoming(value: unknown): UpcomingItem[] | null {
  if (!record(value) || !Array.isArray(value.items)) return null;
  return value.items.flatMap((item) => record(item)
    && typeof item.index === "number"
    && typeof item.name === "string"
    ? [{ index: item.index, label: item.name }]
    : []);
}

function ttlMs(): number {
  const configured = Number(process.env.CLASH_ROYALE_CACHE_TTL_SECONDS ?? "900");
  return Number.isFinite(configured) && configured > 0 ? configured * 1_000 : 900_000;
}

function result<T>(data: T): AdapterLoadResult<T> {
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

function toItem(card: ClashCard): ProfileItem {
  return {
    kind: "card",
    id: String(card.id ?? card.name),
    name: card.name,
    level: card.level ?? null,
    rank: null,
    score: null,
    bestScore: null,
    imageUrl: card.imageUrl ?? null,
  };
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

function battleTime(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/^(\d{4})(\d{2})(\d{2})T/, "$1-$2-$3T").replace(/\.\d{3}Z$/, "Z");
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function recentMatches(battles: ClashBattle[]): RecentMatch[] {
  return battles.slice(0, 25).map((battle, index) => {
    const matchResult: RecentMatch["result"] = battle.ownCrowns !== undefined && battle.opponentCrowns !== undefined
      ? battle.ownCrowns > battle.opponentCrowns ? "win" : battle.ownCrowns < battle.opponentCrowns ? "loss" : "draw"
      : "unknown";
    return {
      id: `${battle.battleTime ?? "battle"}-${index}`,
      occurredAt: battleTime(battle.battleTime),
      mode: battle.gameMode ?? battle.type ?? "Battle",
      map: battle.arena ?? null,
      result: matchResult,
      rank: null,
      scoreDelta: battle.trophyChange ?? null,
    };
  });
}

async function getSummary(tagInput: string): Promise<AdapterLoadResult<ProfileSummary>> {
  const tag = normalizeTag(tagInput);
  return result(summary(parsePlayer(await request(`/players/${upstreamTag(tag)}`)), tag));
}

async function getStats(tagInput: string): Promise<AdapterLoadResult<ProfileStats>> {
  const tag = normalizeTag(tagInput);
  const endpoint = `/players/${upstreamTag(tag)}`;
  const [playerRequest, battleRequest, chestRequest] = await Promise.allSettled([
    request(endpoint),
    request(`${endpoint}/battlelog`),
    request(`${endpoint}/upcomingchests`),
  ]);
  if (playerRequest.status === "rejected") throw playerRequest.reason;
  const player = parsePlayer(playerRequest.value);
  const warnings: string[] = [];
  const battles = battleRequest.status === "fulfilled" ? parseBattles(battleRequest.value) : null;
  if (battles === null) warnings.push("Recent battles could not be refreshed.");
  const upcoming = chestRequest.status === "fulfilled" ? parseUpcoming(chestRequest.value) : null;
  if (upcoming === null) warnings.push("The upcoming chest cycle could not be refreshed.");
  const profileSummary = summary(player, tag);
  return result({
    game: "clash-royale",
    playerTag: displayTag(tag),
    summary: profileSummary,
    metrics: [
      ["trophies", "Trophies", player.trophies],
      ["best-trophies", "Best trophies", player.bestTrophies],
      ["wins", "Wins", player.wins],
      ["losses", "Losses", player.losses],
      ["battle-count", "Battle count", player.battleCount],
      ["three-crown-wins", "Three-crown wins", player.threeCrownWins],
      ["exp-level", "Experience level", player.expLevel],
    ].filter((entry): entry is [string, string, number] => typeof entry[2] === "number")
      .map(([key, label, value]) => ({ key, label, value, format: "integer" })),
    roster: player.cards.map(toItem),
    currentLoadout: [...player.currentDeck, ...player.currentDeckSupportCards].map(toItem),
    recentMatches: recentMatches(battles ?? []),
    upcoming: upcoming ?? [],
    warnings,
  });
}

export const clashAdapter: GameAdapter = {
  game: "clash-royale",
  normalizeTag,
  connectProfile: getSummary,
  getProfileSummary: getSummary,
  getStats,
};
