export type ApiIconUrls = {
  small?: string;
  medium?: string;
  large?: string;
  /** Present on cards that have an Evolution, and on player cards once unlocked. */
  evolutionMedium?: string;
  /** Present on the cards that have a Hero variant. Never reported per battle slot. */
  heroMedium?: string;
};

export type ApiCard = {
  id: number;
  name: string;
  elixirCost?: number;
  rarity?: string;
  /** 0 (or absent) for the base card, 1 for an Evolution. */
  evolutionLevel?: number;
  maxEvolutionLevel?: number;
  level?: number;
  maxLevel?: number;
  starLevel?: number;
  count?: number;
  rarityIconUrls?: ApiIconUrls;
  iconUrls?: ApiIconUrls;
};

export type ApiArena = {
  id?: number;
  name?: string;
};

export type ApiClanReference = {
  tag?: string;
  name?: string;
  badgeId?: number;
  badgeUrls?: ApiIconUrls;
};

export type ApiPlayerLeagueStats = {
  trophies?: number;
  bestTrophies?: number;
  rank?: number | null;
};

export type ApiPlayer = {
  tag: string;
  name: string;
  expLevel?: number;
  trophies?: number;
  bestTrophies?: number;
  wins?: number;
  losses?: number;
  battleCount?: number;
  threeCrownWins?: number;
  challengeCardsWon?: number;
  challengeMaxWins?: number;
  tournamentCardsWon?: number;
  tournamentBattleCount?: number;
  donations?: number;
  donationsReceived?: number;
  totalDonations?: number;
  warDayWins?: number;
  clanCardsCollected?: number;
  role?: string;
  starPoints?: number;
  expPoints?: number;
  totalExpPoints?: number;
  legacyTrophyRoadHighScore?: number | null;
  currentPathOfLegendSeasonResult?: ApiPlayerLeagueStats;
  bestPathOfLegendSeasonResult?: ApiPlayerLeagueStats;
  lastPathOfLegendSeasonResult?: ApiPlayerLeagueStats;
  arena?: ApiArena;
  clan?: ApiClanReference;
  currentDeck?: ApiCard[];
  currentDeckSupportCards?: ApiCard[];
  currentFavouriteCard?: ApiCard;
  cards?: ApiCard[];
  supportCards?: ApiCard[];
  badges?: Array<{ name?: string; level?: number; maxLevel?: number; progress?: number; iconUrls?: ApiIconUrls }>;
  achievements?: Array<{ name?: string; stars?: number; value?: number; target?: number; info?: string }>;
};

export type ApiBattleParticipant = {
  tag?: string;
  name?: string;
  crowns?: number;
  kingTowerHitPoints?: number | null;
  princessTowersHitPoints?: number[] | null;
  trophyChange?: number;
  startingTrophies?: number;
  elixirLeaked?: number;
  clan?: ApiClanReference;
  cards?: ApiCard[];
  supportCards?: ApiCard[];
};

export type ApiBattle = {
  type?: string;
  battleTime?: string;
  isLadderTournament?: boolean;
  arena?: ApiArena;
  gameMode?: { id?: number; name?: string };
  deckSelection?: string;
  team?: ApiBattleParticipant[];
  opponent?: ApiBattleParticipant[];
};

export type ApiChest = {
  index?: number;
  name?: string;
};

export type ApiChestList = {
  items?: ApiChest[];
};

export type ApiClanMember = {
  tag?: string;
  name?: string;
  role?: string;
  expLevel?: number;
  trophies?: number;
  arena?: ApiArena;
  clanRank?: number;
  previousClanRank?: number;
  donations?: number;
  donationsReceived?: number;
  lastSeen?: string;
};

export type ApiClan = {
  tag: string;
  name: string;
  type?: string;
  description?: string;
  badgeId?: number;
  badgeUrls?: ApiIconUrls;
  clanScore?: number;
  clanWarTrophies?: number;
  requiredTrophies?: number;
  donationsPerWeek?: number;
  clanChestLevel?: number;
  clanChestMaxLevel?: number;
  members?: number;
  location?: ApiLocation;
  memberList?: ApiClanMember[];
};

export type ApiCardList = {
  items?: ApiCard[];
  /** Tower Troops (Tower Princess, Cannoneer, Dagger Duchess, ...). */
  supportItems?: ApiCard[];
};

/* -------------------------------------------------------------------------- */
/* Locations, rankings and leaderboards                                        */
/* -------------------------------------------------------------------------- */

export type ApiLocation = {
  id: number;
  name: string;
  isCountry?: boolean;
  countryCode?: string;
};

export type ApiPlayerRanking = {
  tag: string;
  name: string;
  rank?: number;
  previousRank?: number;
  expLevel?: number;
  trophies?: number;
  eloRating?: number;
  /** Returned by /leaderboard/{id}; trophies and expLevel are not. */
  score?: number;
  clan?: ApiClanReference;
  arena?: ApiArena;
};

export type ApiClanRanking = {
  tag: string;
  name: string;
  rank?: number;
  previousRank?: number;
  badgeId?: number;
  badgeUrls?: ApiIconUrls;
  clanScore?: number;
  clanWarTrophies?: number;
  members?: number;
  location?: ApiLocation;
};

export type ApiLeaderboard = {
  id: number;
  /** Genuinely null on many boards, not merely absent. */
  name?: string | null;
  /** Present on some season leaderboards. */
  iconUrls?: ApiIconUrls;
};

/* -------------------------------------------------------------------------- */
/* Clan Wars 2 (River Race)                                                    */
/* -------------------------------------------------------------------------- */

export type ApiRiverRaceParticipant = {
  tag?: string;
  name?: string;
  fame?: number;
  repairPoints?: number;
  boatAttacks?: number;
  decksUsed?: number;
  decksUsedToday?: number;
};

export type ApiRiverRaceClan = {
  tag?: string;
  name?: string;
  badgeId?: number;
  badgeUrls?: ApiIconUrls;
  fame?: number;
  repairPoints?: number;
  finishTime?: string;
  clanScore?: number;
  periodPoints?: number;
  participants?: ApiRiverRaceParticipant[];
};

export type ApiCurrentRiverRace = {
  state?: string;
  clan?: ApiRiverRaceClan;
  clans?: ApiRiverRaceClan[];
  sectionIndex?: number;
  periodIndex?: number;
  periodType?: string;
  periodLogs?: Array<{
    periodIndex?: number;
    items?: Array<{ clan?: { tag?: string }; pointsEarned?: number; progressStartOfDay?: number; progressEndOfDay?: number }>;
  }>;
};

export type ApiRiverRaceLogEntry = {
  seasonId?: number;
  sectionIndex?: number;
  createdDate?: string;
  standings?: Array<{
    rank?: number;
    trophyChange?: number;
    clan?: ApiRiverRaceClan;
  }>;
};

export type ApiRiverRaceLog = {
  items?: ApiRiverRaceLogEntry[];
};

/* -------------------------------------------------------------------------- */
/* Tournaments                                                                 */
/* -------------------------------------------------------------------------- */

export type ApiTournament = {
  tag: string;
  name?: string;
  type?: string;
  status?: string;
  creatorTag?: string;
  description?: string;
  capacity?: number;
  maxCapacity?: number;
  preparationDuration?: number;
  duration?: number;
  createdTime?: string;
  startedTime?: string;
  endedTime?: string;
  levelCap?: number;
  firstPlaceCardPrize?: number;
  gameMode?: { id?: number; name?: string };
};

export type ApiPaged<T> = {
  items?: T[];
  paging?: { cursors?: { after?: string; before?: string } };
};

/* -------------------------------------------------------------------------- */
/* Convex payload envelopes                                                    */
/* -------------------------------------------------------------------------- */

export type CachedPayload<T> = {
  data: T;
  fetchedAt: number;
  stale: boolean;
};

export type PlayerBundlePayload = {
  player: CachedPayload<ApiPlayer>;
  battles: CachedPayload<ApiBattle[]>;
  chests: CachedPayload<ApiChestList>;
};

export type ClanBundlePayload = {
  clan: CachedPayload<ApiClan>;
};

export type ClanWarPayload = {
  currentRace: CachedPayload<ApiCurrentRiverRace | null>;
  raceLog: CachedPayload<ApiRiverRaceLog | null>;
};

export type CardsPayload = {
  cards: CachedPayload<ApiCardList>;
};

export type LocationsPayload = {
  locations: CachedPayload<ApiPaged<ApiLocation>>;
};

export type RankingKind = "players" | "clans" | "clanwars";

export type RankingsPayload = {
  kind: RankingKind;
  locationId: number;
  rankings: CachedPayload<ApiPaged<ApiPlayerRanking | ApiClanRanking>>;
};

export type LeaderboardListPayload = {
  leaderboards: CachedPayload<ApiPaged<ApiLeaderboard>>;
};

export type LeaderboardPayload = {
  leaderboard: CachedPayload<ApiPaged<ApiPlayerRanking>>;
};

export type ClanSearchPayload = {
  results: CachedPayload<ApiPaged<ApiClan>>;
};

export type TournamentsPayload = {
  tournaments: CachedPayload<ApiPaged<ApiTournament>>;
};

// --- Battle-log pipeline --------------------------------------------------
// Shapes returned by the public queries in convex/meta.ts.

/** A count read with a bounded `take`, so the UI can render "500+" honestly. */
export type CountProbe = {
  count: number;
  capped: boolean;
};

export type PipelineRun = {
  _id: string;
  job: string;
  startedAt: number;
  finishedAt?: number;
  ok: boolean;
  note?: string;
  counters?: Record<string, number>;
};

export type PipelineStatusPayload = {
  now: number;
  counters: Record<string, number>;
  due: CountProbe;
  decksToday: CountProbe;
  battlesToday: number;
  apiCalls: { lastHour: number; failures: number; capped: boolean; buckets: number };
  crawler: {
    enabled: boolean;
    clanWatchEnabled: boolean;
    budgets: Record<"discover" | "crawl" | "clanWatch", { used: number; limit: number }>;
  };
  lastRuns: PipelineRun[];
  rankingsComputedAt: number | null;
};

export type RankedDeck = {
  _id: string;
  rank: number;
  deckHash: string;
  cardIds: number[];
  evolutionIds: number[];
  uses: number;
  wins: number;
  winRate: number;
  usageRate: number;
  computedAt: number;
};

export type TopDecksPayload = {
  windowDays: number;
  decks: RankedDeck[];
};

export type RankedCard = {
  cardId: number;
  uses: number;
  wins: number;
  winRate: number;
  usageRate: number;
};

export type TopCardsPayload = {
  windowDays: number;
  decksObserved: number;
  cards: RankedCard[];
};

export type RankedTowerTroop = {
  towerCardId: number;
  uses: number;
  wins: number;
  winRate: number;
  usageRate: number;
};

export type TopTowerTroopsPayload = {
  windowDays: number;
  decksObserved: number;
  towerTroops: RankedTowerTroop[];
};

export type DeckMetaPayload = {
  windowDays: number;
  uses: number;
  wins: number;
  winRate: number;
  crownsPerGame: number;
};

// --- Player name directory ------------------------------------------------

export type DirectoryHit = {
  tag: string;
  name: string;
  clanTag?: string;
  clanName?: string;
  trophies?: number;
  sightings: number;
  /** The name matched exactly, rather than through the fuzzy search index. */
  exact: boolean;
};

export type PlayerSearchPayload = {
  /** Set when the input could itself be a tag, which is offered as its own result. */
  tag: string | null;
  players: DirectoryHit[];
};

// --- Profile history --------------------------------------------------

/**
 * One row from `convex/cache.ts`'s `profileHistory` table: a snapshot taken
 * the moment someone loaded this profile and the tracked value had moved
 * since the last snapshot. `recordedAt` is an epoch-ms `Date.now()` value,
 * not an API date string, and the gaps between rows are however long it took
 * for someone to look at this profile again — not a fixed polling interval.
 */
export type ProfileHistoryPoint = {
  kind: "player" | "clan";
  tag: string;
  name: string;
  value: number;
  recordedAt: number;
};
