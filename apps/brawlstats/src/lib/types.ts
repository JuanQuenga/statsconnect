export type BrawlerCatalogItem = {
  id: number;
  name: string;
  rarity: string;
  color: string;
  role: string;
  description: string;
  gadget: string;
  starPower: string;
  imageUrl?: string;
  released?: boolean;
};

export type PlayerProfile = {
  tag: string;
  name: string;
  trophies: number;
  highestTrophies: number;
  expLevel: number;
  expPoints: number;
  "3vs3Victories"?: number;
  soloVictories?: number;
  duoVictories?: number;
  icon?: { id: number };
  club?: { tag?: string; name?: string };
  ranked?: {
    currentRank?: number;
    currentRankName?: string;
    seasonBestRank?: number;
    seasonBestRankName?: string;
    bestRank?: number;
    bestRankName?: string;
  };
  brawlers?: Array<{
    id: number;
    name: string;
    power: number;
    rank: number;
    trophies: number;
    highestTrophies: number;
    gadgets?: Array<{ id: number; name: string }>;
    starPowers?: Array<{ id: number; name: string }>;
    gears?: Array<{ id: number; name: string }>;
    hypercharges?: Array<{ id: number; name: string }>;
    buffies?: Array<{ id: number; name: string }>;
  }>;
};

export type PlayerDirectoryResult = {
  tag: string;
  name: string;
  clubTag?: string;
  clubName?: string;
  trophies?: number;
  iconId?: number;
  sightings: number;
  updatedAt: number;
};

export type PlayerSearchResponse = {
  possibleTag?: string;
  players: PlayerDirectoryResult[];
};

export type PlayerSnapshot = {
  day: number;
  recordedAt: number;
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
  brawlers?: PlayerProfile["brawlers"];
};

export type PlayerBattle = {
  battleTime: string;
  battleTimestamp: number;
  mapId?: number;
  mapName?: string;
  mode: string;
  battleType?: string;
  result: "victory" | "defeat" | "draw" | "unknown";
  rank?: number;
  trophyChange?: number;
  brawlerId?: number;
  brawlerName?: string;
  brawlerPower?: number;
  brawlerTrophies?: number;
  starPlayer: boolean;
};

export type PlayerAggregate = {
  days: number;
  battles: number;
  wins: number;
  losses: number;
  draws: number;
  unknown: number;
  winRate: number;
  netTrophies: number;
  starPlayerRate: number;
};

export type PlayerAnalytics = {
  battles: PlayerBattle[];
  nextCursor?: number;
  hasMore: boolean;
  capped: boolean;
  summaries: PlayerAggregate[];
  streaks: { current: number; currentResult: PlayerBattle["result"]; longestWin: number };
  activity: Array<{ day: string; battles: number; wins: number }>;
  modes: Array<PlayerAggregate & { mode: string }>;
  brawlers: Array<PlayerAggregate & { brawlerId: number; brawlerName: string }>;
};

export type ClubProfile = {
  tag: string;
  name: string;
  description?: string;
  type?: string;
  badgeId?: number;
  requiredTrophies?: number;
  trophies?: number;
  members?: Array<{
    tag: string;
    name: string;
    role?: string;
    trophies: number;
    icon?: { id: number };
  }>;
};

export type RankingPlayer = {
  tag: string;
  name: string;
  trophies: number;
  rank?: number;
  icon?: { id: number };
  club?: { name?: string };
};

export type RankingClub = {
  tag: string;
  name: string;
  trophies: number;
  memberCount?: number;
  badgeId?: number;
};

export type EventItem = {
  startTime?: string;
  endTime?: string;
  event?: {
    id?: number;
    mode?: string;
    map?: string;
  };
};

export type BattleLogItem = {
  battleTime?: string;
  event?: {
    id?: number;
    mode?: string;
    map?: string;
  };
  battle?: {
    mode?: string;
    type?: string;
    result?: string;
    rank?: number;
    trophyChange?: number;
    starPlayer?: {
      tag?: string;
      brawler?: { id?: number; name?: string; trophies?: number };
    };
    teams?: Array<
      Array<{
        tag?: string;
        name?: string;
        brawler?: { id?: number; name?: string; power?: number; trophies?: number };
      }>
    >;
    players?: Array<{
      tag?: string;
      name?: string;
      brawler?: { id?: number; name?: string; power?: number; trophies?: number };
    }>;
  };
};

export type MapListItem = {
  id: number;
  name: string;
  hash: string;
  new?: boolean;
  disabled?: boolean;
  imageUrl?: string;
  lastActive?: number;
  dataUpdated?: number;
  credit?: string | null;
  gameMode?: {
    id: number;
    name: string;
    hash?: string;
    color?: string;
    bgColor?: string;
    imageUrl?: string;
  };
  environment?: {
    id?: number;
    name?: string;
    imageUrl?: string;
  };
};

export type MapBrawlerStat = {
  brawlerId: number;
  wins: number;
  losses: number;
  picks: number;
  starPlayer: number;
  winRate: number;
  useRate: number;
  trophyBucket: string;
};

export type MapTeamStat = {
  brawlerIds: number[];
  wins: number;
  losses: number;
  picks: number;
  winRate: number;
  trophyBucket: string;
};

export type MapDetailResponse = {
  map: MapListItem;
  stats: MapBrawlerStat[];
  teams: MapTeamStat[];
  sampleSize: number;
  minPicks: number;
};
