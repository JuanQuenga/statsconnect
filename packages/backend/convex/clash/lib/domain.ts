export type Card = {
  id?: number;
  name: string;
  elixir: number;
  rarity: "Common" | "Rare" | "Epic" | "Legendary" | "Champion";
  image: string;
  evolutionImage?: string;
  heroImage?: string;
  level?: number;
  maxLevel?: number;
  starLevel?: number;
  count?: number;
  evolutionLevel?: number;
  isEvolution?: boolean;
  canEvolve?: boolean;
};

export type Battle = {
  mode: string;
  date: string;
  result: "Win" | "Loss" | "Draw";
  crowns: [number, number];
  opponent: string;
  opponentClan?: string;
  opponentDeck?: Card[];
  trophyChange: number;
  deck: Card[];
};

export type Chest = {
  name: string;
  index: number;
  image: string;
};

export type PathOfLegendsResult = {
  leagueNumber?: number;
  trophies?: number;
  bestTrophies?: number;
  rank?: number | null;
};

export type Player = {
  tag: string;
  name: string;
  level: number;
  trophies: number;
  bestTrophies: number;
  arena: string;
  arenaImage: string;
  clan: string;
  clanTag?: string;
  clanBadge?: string;
  pathOfLegends?: {
    current?: PathOfLegendsResult;
    last?: PathOfLegendsResult;
    best?: PathOfLegendsResult;
  };
  favoriteCard: Card;
  stats: Record<string, string>;
  deck: Card[];
  supportCards?: Card[];
  cards: Card[];
  chests: Chest[];
  battles: Battle[];
  fetchedAt?: number;
};

export type ClanMember = {
  tag?: string;
  name: string;
  role: string;
  level?: number;
  rank?: number;
  previousRank?: number;
  trophies: number;
  donations: number;
  donationsReceived?: number;
  arena?: string;
  lastSeen?: string;
};

export type Clan = {
  tag: string;
  name: string;
  badge: string;
  warBadge: string;
  warLeague?: string;
  description: string;
  score: number;
  warTrophies: number;
  requiredTrophies?: number;
  type?: string;
  location?: string;
  donations: number;
  members: ClanMember[];
  fetchedAt?: number;
};

export type DemoDeck = {
  name: string;
  archetype: "Control" | "Cycle" | "Beatdown" | "Bait";
  spotlight: string;
  winRate: number;
  usage: number;
  crowns: number;
  cost: number;
  cards: Card[];
};

export type DemoEvent = {
  name: string;
  mode: string;
  reward: string;
  progress: number;
  image: string;
};
