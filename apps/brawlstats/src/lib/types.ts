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
  brawlers?: Array<{
    id: number;
    name: string;
    power: number;
    rank: number;
    trophies: number;
    highestTrophies: number;
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

export type ClubActivityType = "join" | "leave" | "role_change" | "trophy_change";

export type ClubSnapshot = {
  day: number;
  recordedAt: number;
  name: string;
  trophies: number;
  memberCount: number;
  requiredTrophies?: number;
};

export type ClubActivityEvent = {
  recordedAt: number;
  playerTag: string;
  playerName: string;
  type: ClubActivityType;
  fromRole?: string;
  toRole?: string;
  fromTrophies?: number;
  toTrophies?: number;
  trophyDelta?: number;
};

export type TrackedClubMember = {
  tag: string;
  name: string;
  role: string;
  trophies: number;
  iconId?: number;
  firstSeenAt: number;
  lastSeenAt: number;
  joinedAt: number;
  lastProfileAt?: number;
};

export type ClubHistoryResponse = {
  trackedSinceAt?: number;
  lastSeenAt?: number;
  snapshots: ClubSnapshot[];
  events: ClubActivityEvent[];
  roster: TrackedClubMember[];
  summary: {
    joins: number;
    leaves: number;
    roleChanges: number;
    trophyChange: number;
    activeMembers: number;
  };
};

export type TrackedClubSummary = {
  tag: string;
  name: string;
  badgeId?: number;
  trophies: number;
  memberCount: number;
  trackedSinceAt: number;
  lastSeenAt: number;
  activity7d: number;
  trophyChange7d: number;
};

export type ClubCommunityResponse = { clubs: TrackedClubSummary[] };

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
