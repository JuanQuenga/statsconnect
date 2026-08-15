import type {
  Battle,
  Card,
  Chest,
  Clan,
  ClanMember,
  PathOfLegendsResult,
  Player,
  PlayerAchievement,
  PlayerBadge
} from "@/lib/mock-data";
import {
  activeCardVariant,
  arenaImage,
  badgeImage,
  cardImage,
  chestImage,
  evolutionCardImage,
  heroCardImage,
  warLeague,
  UNKNOWN_CARD_IMAGE
} from "./assets";
import { formatApiDate } from "./format";
import { optionalNumber } from "@/lib/numbers";
import { stripSupercellColorTags } from "@statsconnect/site-nav";
import type {
  ApiBattle,
  ApiCard,
  ApiCardList,
  ApiChestList,
  ApiClan,
  ApiPlayer,
  ApiPlayerLeagueStats,
  CardsPayload,
  ClanBundlePayload,
  PlayerBundlePayload
} from "./types";

const FALLBACK_CARD: Card = {
  name: "Unknown Card",
  elixir: 0,
  rarity: "Common",
  image: UNKNOWN_CARD_IMAGE
};

const rarityMap: Record<string, Card["rarity"]> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  champion: "Champion"
};

export function mapCard(card?: ApiCard): Card {
  if (!card?.name) return FALLBACK_CARD;

  const evolutionLevel = card.evolutionLevel ?? 0;
  const evolutionImage = evolutionCardImage(card);
  const variant = activeCardVariant(card);

  return {
    id: card.id,
    name: card.name,
    elixir: card.elixirCost ?? 0,
    rarity: rarityMap[card.rarity?.toLowerCase() ?? ""] ?? "Common",
    image: cardImage(card),
    evolutionImage,
    heroImage: heroCardImage(card),
    level: optionalNumber(card.level),
    maxLevel: optionalNumber(card.maxLevel),
    starLevel: optionalNumber(card.starLevel),
    count: optionalNumber(card.count),
    evolutionLevel,
    variant,
    isEvolution: variant !== undefined,
    canEvolve: Boolean(evolutionImage)
  };
}

function formatBattleDate(value?: string) {
  if (!value) return "Recent battle";
  return formatApiDate(value, { month: "short", day: "numeric", year: "numeric" });
}

function formatBattleTime(value?: string) {
  if (!value) return undefined;
  const formatted = formatApiDate(value, { hour: "numeric", minute: "2-digit" });
  return formatted === value ? undefined : formatted;
}

function mapBattle(battle: ApiBattle): Battle {
  const team = battle.team?.[0];
  const opponent = battle.opponent?.[0];
  const ourCrowns = team?.crowns ?? 0;
  const theirCrowns = opponent?.crowns ?? 0;

  return {
    mode: battle.gameMode?.name ?? battle.type ?? "Battle",
    date: formatBattleDate(battle.battleTime),
    time: formatBattleTime(battle.battleTime),
    result: ourCrowns > theirCrowns ? "Win" : ourCrowns < theirCrowns ? "Loss" : "Draw",
    crowns: [ourCrowns, theirCrowns],
    opponent: opponent?.name ? stripSupercellColorTags(opponent.name) : "Unknown player",
    opponentTag: opponent?.tag?.replace(/^#/, ""),
    opponentClan: opponent?.clan?.name ? stripSupercellColorTags(opponent.clan.name) : undefined,
    opponentDeck: opponent?.cards?.map(mapCard),
    opponentSupportCards: opponent?.supportCards?.map(mapCard),
    trophyChange: optionalNumber(team?.trophyChange),
    opponentTrophyChange: optionalNumber(opponent?.trophyChange),
    startingTrophies: optionalNumber(team?.startingTrophies),
    opponentStartingTrophies: optionalNumber(opponent?.startingTrophies),
    kingTowerHitPoints: team?.kingTowerHitPoints,
    opponentKingTowerHitPoints: opponent?.kingTowerHitPoints,
    princessTowersHitPoints: team?.princessTowersHitPoints,
    opponentPrincessTowersHitPoints: opponent?.princessTowersHitPoints,
    deck: team?.cards?.map(mapCard) ?? [],
    supportCards: team?.supportCards?.map(mapCard)
  };
}

function mapChestList(payload: ApiChestList): Chest[] {
  return (payload.items ?? []).map((chest) => {
    const name = chest.name ?? "Chest";
    return { name, index: chest.index ?? 0, image: chestImage(name) };
  });
}

/**
 * Supercell sends a season result as `{}` (every field absent) when a player
 * has no result for that snapshot — e.g. `bestPathOfLegendSeasonResult` on an
 * account that has never touched Path of Legends. Treat an all-absent result
 * as no result at all, so callers can tell "never played" apart from
 * "played, but the API withheld the numbers."
 */
function mapPathOfLegendsResult(result?: ApiPlayerLeagueStats): PathOfLegendsResult | undefined {
  if (!result) return undefined;
  if (result.trophies === undefined && result.bestTrophies === undefined && result.rank == null) return undefined;
  return { trophies: optionalNumber(result.trophies), bestTrophies: optionalNumber(result.bestTrophies), rank: result.rank ?? null };
}

function mapPathOfLegends(source: ApiPlayer): Player["pathOfLegends"] {
  const current = mapPathOfLegendsResult(source.currentPathOfLegendSeasonResult);
  const last = mapPathOfLegendsResult(source.lastPathOfLegendSeasonResult);
  const best = mapPathOfLegendsResult(source.bestPathOfLegendSeasonResult);
  // All three snapshots come back empty for a player who has never queued
  // Path of Legends — drop the section entirely rather than render zeros.
  if (!current && !last && !best) return undefined;
  return { current, last, best };
}

function mapBadge(badge: NonNullable<ApiPlayer["badges"]>[number]): PlayerBadge | undefined {
  if (!badge.name) return undefined;
  return {
    name: badge.name,
    level: optionalNumber(badge.level),
    maxLevel: optionalNumber(badge.maxLevel),
    progress: optionalNumber(badge.progress),
    image: badge.iconUrls?.large ?? badge.iconUrls?.medium ?? badge.iconUrls?.small
  };
}

function mapAchievement(
  achievement: NonNullable<ApiPlayer["achievements"]>[number]
): PlayerAchievement | undefined {
  if (!achievement.name) return undefined;
  return {
    name: achievement.name,
    stars: optionalNumber(achievement.stars),
    value: optionalNumber(achievement.value),
    target: optionalNumber(achievement.target),
    info: achievement.info
  };
}

function presentValues<T>(values: Array<T | undefined>): T[] {
  return values.filter((value): value is T => value !== undefined);
}

function playerStats(source: ApiPlayer): Record<string, string> {
  const stats: Record<string, string> = {};
  const addNumber = (label: string, value: number | null | undefined) => {
    const numeric = optionalNumber(value);
    if (numeric !== undefined) stats[label] = numeric.toLocaleString();
  };

  addNumber("Last known trophies", source.trophies);
  addNumber("Challenge cards won", source.challengeCardsWon);
  addNumber("Challenge max wins", source.challengeMaxWins);
  addNumber("Tourney cards won", source.tournamentCardsWon);
  addNumber("Total donations", source.totalDonations ?? source.donations);
  addNumber("War day wins", source.warDayWins);
  addNumber("Wins", source.wins);
  addNumber("Losses", source.losses);
  addNumber("3 crown wins", source.threeCrownWins);
  addNumber("Battles", source.battleCount);
  if (source.arena?.name) stats.Arena = source.arena.name;
  return stats;
}

export function mapPlayerBundle(payload: PlayerBundlePayload): Player {
  const source = payload.player.data;
  const currentDeck = source.currentDeck?.map(mapCard) ?? [];
  const allCards = source.cards?.map((card) => ({ ...mapCard(card), owned: true })) ?? [];
  const favoriteCard = source.currentFavouriteCard ? mapCard(source.currentFavouriteCard) : undefined;

  const pathOfLegends = mapPathOfLegends(source);

  return {
    tag: source.tag.replace(/^#/, ""),
    name: stripSupercellColorTags(source.name),
    level: optionalNumber(source.expLevel),
    trophies: optionalNumber(source.trophies),
    bestTrophies: optionalNumber(source.bestTrophies),
    arena: source.arena?.name ?? "Unknown Arena",
    arenaImage: arenaImage(source.arena),
    clan: source.clan?.name ? stripSupercellColorTags(source.clan.name) : "No clan",
    clanTag: source.clan?.tag?.replace(/^#/, ""),
    clanBadge: source.clan ? badgeImage(source.clan.badgeId, source.clan.badgeUrls) : undefined,
    pathOfLegends,
    supportCards: source.currentDeckSupportCards?.map(mapCard) ?? [],
    supportCardCollection: source.supportCards?.map((card) => ({ ...mapCard(card), owned: true })),
    favoriteCard,
    starPoints: optionalNumber(source.starPoints),
    experiencePoints: optionalNumber(source.expPoints),
    totalExperiencePoints: optionalNumber(source.totalExpPoints),
    legacyTrophyRoadHighScore: optionalNumber(source.legacyTrophyRoadHighScore),
    tournamentBattleCount: optionalNumber(source.tournamentBattleCount),
    clanCardsCollected: optionalNumber(source.clanCardsCollected),
    donationsReceived: optionalNumber(source.donationsReceived),
    role: source.role ? roleLabel(source.role) : undefined,
    badges: presentValues((source.badges ?? []).map(mapBadge)),
    achievements: presentValues((source.achievements ?? []).map(mapAchievement)),
    stats: playerStats(source),
    deck: currentDeck,
    cardCollectionAvailable: source.cards !== undefined,
    cards: allCards,
    chests: mapChestList(payload.chests.data),
    battles: payload.battles.data.map(mapBattle),
    fetchedAt: payload.player.fetchedAt
  };
}

function roleLabel(role?: string) {
  if (!role) return "Member";
  return role.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function mapClanMember(member: NonNullable<ApiClan["memberList"]>[number]): ClanMember {
  return {
    tag: member.tag?.replace(/^#/, ""),
    name: member.name ? stripSupercellColorTags(member.name) : "Unknown member",
    role: roleLabel(member.role),
    level: member.expLevel,
    rank: member.clanRank,
    previousRank: member.previousClanRank,
    trophies: member.trophies ?? 0,
    donations: member.donations ?? 0,
    donationsReceived: member.donationsReceived ?? 0,
    arena: member.arena?.name,
    lastSeen: member.lastSeen
  };
}

export function mapClanBundle(payload: ClanBundlePayload): Clan {
  const source = payload.clan.data;
  const warTrophies = source.clanWarTrophies ?? 0;
  const league = warLeague(warTrophies);

  return {
    tag: source.tag.replace(/^#/, ""),
    name: stripSupercellColorTags(source.name),
    badge: badgeImage(source.badgeId, source.badgeUrls),
    warBadge: league.image,
    warLeague: league.label,
    description: source.description ? stripSupercellColorTags(source.description) : "No clan description provided.",
    score: source.clanScore ?? 0,
    warTrophies,
    requiredTrophies: source.requiredTrophies ?? 0,
    type: roleLabel(source.type),
    location: source.location?.name,
    donations: source.donationsPerWeek ?? 0,
    members: (source.memberList ?? []).map(mapClanMember),
    fetchedAt: payload.clan.fetchedAt
  };
}

export function mapCardsPayload(payload: CardsPayload): Card[] {
  return mapCardList(payload.cards.data);
}

/** Playable cards only. Tower Troops live in a separate list on the same response. */
export function mapCardList(payload: ApiCardList): Card[] {
  return (payload.items ?? []).map(mapCard);
}

/** Tower Troops (Tower Princess, Cannoneer, Dagger Duchess, ...). */
export function mapSupportCardList(payload: ApiCardList): Card[] {
  return (payload.supportItems ?? []).map(mapCard);
}
