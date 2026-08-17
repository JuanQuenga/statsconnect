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
  variant?: "Evolution" | "Hero";
  isEvolution?: boolean;
  canEvolve?: boolean;
  owned?: boolean;
};

export type PlayerBadge = {
  name: string;
  level?: number;
  maxLevel?: number;
  progress?: number;
  image?: string;
};

export type PlayerAchievement = {
  name: string;
  stars?: number;
  value?: number;
  target?: number;
  info?: string;
};

export type Battle = {
  mode: string;
  date: string;
  time?: string;
  result: "Win" | "Loss" | "Draw";
  crowns: [number, number];
  opponent: string;
  opponentTag?: string;
  opponentClan?: string;
  opponentDeck?: Card[];
  opponentSupportCards?: Card[];
  trophyChange?: number;
  opponentTrophyChange?: number;
  startingTrophies?: number;
  opponentStartingTrophies?: number;
  kingTowerHitPoints?: number | null;
  opponentKingTowerHitPoints?: number | null;
  princessTowersHitPoints?: number[] | null;
  opponentPrincessTowersHitPoints?: number[] | null;
  deck: Card[];
  supportCards?: Card[];
};

export type Chest = {
  name: string;
  index: number;
  image: string;
};

/** One of the current, prior, or best Path of Legends snapshots exposed upstream. */
export type PathOfLegendsResult = {
  trophies?: number;
  bestTrophies?: number;
  rank?: number | null;
};

export type Player = {
  tag: string;
  name: string;
  level?: number;
  trophies?: number;
  bestTrophies?: number;
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
  favoriteCard?: Card;
  starPoints?: number;
  experiencePoints?: number;
  totalExperiencePoints?: number;
  legacyTrophyRoadHighScore?: number;
  tournamentBattleCount?: number;
  clanCardsCollected?: number;
  donationsReceived?: number;
  role?: string;
  badges?: PlayerBadge[];
  achievements?: PlayerAchievement[];
  stats: Record<string, string>;
  deck: Card[];
  supportCards?: Card[];
  supportCardCollection?: Card[];
  cardCollectionAvailable?: boolean;
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
