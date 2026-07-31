import type { Battle, Card, Chest, Clan, ClanMember, Player } from "@/lib/mock-data";
import {
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
import type {
  ApiBattle,
  ApiCard,
  ApiCardList,
  ApiChestList,
  ApiClan,
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

  return {
    id: card.id,
    name: card.name,
    elixir: card.elixirCost ?? 0,
    rarity: rarityMap[card.rarity?.toLowerCase() ?? ""] ?? "Common",
    image: cardImage(card),
    evolutionImage,
    heroImage: heroCardImage(card),
    level: card.level,
    maxLevel: card.maxLevel,
    starLevel: card.starLevel,
    count: card.count,
    evolutionLevel,
    isEvolution: evolutionLevel > 0,
    canEvolve: Boolean(evolutionImage)
  };
}

function formatBattleDate(value?: string) {
  if (!value) return "Recent battle";
  return formatApiDate(value, { month: "short", day: "numeric", year: "numeric" });
}

function mapBattle(battle: ApiBattle): Battle {
  const team = battle.team?.[0];
  const opponent = battle.opponent?.[0];
  const ourCrowns = team?.crowns ?? 0;
  const theirCrowns = opponent?.crowns ?? 0;

  return {
    mode: battle.gameMode?.name ?? battle.type ?? "Battle",
    date: formatBattleDate(battle.battleTime),
    result: ourCrowns >= theirCrowns ? "Win" : "Loss",
    crowns: [ourCrowns, theirCrowns],
    opponent: opponent?.name ?? "Unknown player",
    opponentClan: opponent?.clan?.name,
    opponentDeck: opponent?.cards?.map(mapCard),
    trophyChange: team?.trophyChange ?? 0,
    deck: team?.cards?.map(mapCard) ?? []
  };
}

function mapChestList(payload: ApiChestList): Chest[] {
  return (payload.items ?? []).map((chest) => {
    const name = chest.name ?? "Chest";
    return { name, index: chest.index ?? 0, image: chestImage(name) };
  });
}

export function mapPlayerBundle(payload: PlayerBundlePayload): Player {
  const source = payload.player.data;
  const currentDeck = source.currentDeck?.map(mapCard) ?? [];
  const allCards = source.cards?.map(mapCard) ?? currentDeck;
  const favoriteCard = mapCard(source.currentFavouriteCard ?? source.currentDeck?.[0]);

  const pathOfLegends = source.currentPathOfLegendSeasonResult;

  return {
    tag: source.tag.replace(/^#/, ""),
    name: source.name,
    level: source.expLevel ?? 1,
    trophies: source.trophies ?? 0,
    bestTrophies: source.bestTrophies ?? source.trophies ?? 0,
    arena: source.arena?.name ?? "Unknown Arena",
    arenaImage: arenaImage(source.arena),
    clan: source.clan?.name ?? "No clan",
    clanTag: source.clan?.tag?.replace(/^#/, ""),
    clanBadge: source.clan ? badgeImage(source.clan.badgeId, source.clan.badgeUrls) : undefined,
    pathOfLegends: pathOfLegends
      ? { trophies: pathOfLegends.trophies ?? 0, bestTrophies: pathOfLegends.bestTrophies ?? 0, rank: pathOfLegends.rank ?? null }
      : undefined,
    supportCards: source.currentDeckSupportCards?.map(mapCard) ?? [],
    favoriteCard,
    stats: {
      "Last known trophies": (source.trophies ?? 0).toLocaleString(),
      "Challenge cards won": (source.challengeCardsWon ?? 0).toLocaleString(),
      "Challenge max wins": (source.challengeMaxWins ?? 0).toLocaleString(),
      "Tourney cards won": (source.tournamentCardsWon ?? 0).toLocaleString(),
      "Total donations": (source.totalDonations ?? source.donations ?? 0).toLocaleString(),
      "War day wins": (source.warDayWins ?? 0).toLocaleString(),
      Wins: (source.wins ?? 0).toLocaleString(),
      Losses: (source.losses ?? 0).toLocaleString(),
      "3 crown wins": (source.threeCrownWins ?? 0).toLocaleString(),
      Battles: (source.battleCount ?? 0).toLocaleString(),
      Arena: source.arena?.name ?? "Unknown"
    },
    deck: currentDeck,
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
    name: member.name ?? "Unknown member",
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
    name: source.name,
    badge: badgeImage(source.badgeId, source.badgeUrls),
    warBadge: league.image,
    warLeague: league.label,
    description: source.description ?? "No clan description provided.",
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
