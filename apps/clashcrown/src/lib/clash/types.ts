import type { FunctionReturnType } from "convex/server";
import { clashBackend } from "@/lib/platformBackend";

/** Clash transport types come from the generated Platform Backend Interface. */
export type PlayerBundlePayload = FunctionReturnType<typeof clashBackend.profiles.player>;
export type ClanBundlePayload = FunctionReturnType<typeof clashBackend.profiles.clan>;
export type ClanWarPayload = FunctionReturnType<typeof clashBackend.profiles.clanWar>;
export type CardsPayload = FunctionReturnType<typeof clashBackend.catalog.cards>;
export type LocationsPayload = FunctionReturnType<typeof clashBackend.catalog.locations>;
export type RankingsPayload = FunctionReturnType<typeof clashBackend.catalog.rankings>;
export type LeaderboardListPayload = FunctionReturnType<typeof clashBackend.catalog.leaderboards>;
export type LeaderboardPayload = FunctionReturnType<typeof clashBackend.catalog.leaderboard>;
export type ClanSearchPayload = FunctionReturnType<typeof clashBackend.catalog.searchClans>;
export type TournamentsPayload = FunctionReturnType<typeof clashBackend.catalog.globalTournaments>;

export type CachedPayload<T> = Omit<PlayerBundlePayload["player"], "data"> & { data: T };
export type ApiPlayer = PlayerBundlePayload["player"]["data"];
export type ApiBattle = PlayerBundlePayload["battles"]["data"][number];
export type ApiChestList = PlayerBundlePayload["chests"]["data"];
export type ApiCardList = CardsPayload["cards"]["data"];
export type ApiClan = ClanBundlePayload["clan"]["data"];
export type ApiCurrentRiverRace = NonNullable<ClanWarPayload["currentRace"]["data"]>;
export type ApiRiverRaceLog = NonNullable<ClanWarPayload["raceLog"]["data"]>;
export type ApiLocation = NonNullable<LocationsPayload["locations"]["data"]["items"]>[number];
export type ApiLeaderboard = NonNullable<LeaderboardListPayload["leaderboards"]["data"]["items"]>[number];
export type ApiPlayerRanking = NonNullable<LeaderboardPayload["leaderboard"]["data"]["items"]>[number];
type ApiRanking = NonNullable<RankingsPayload["rankings"]["data"]["items"]>[number];
export type ApiClanRanking = Extract<ApiRanking, { clanScore?: number }>;
export type ApiTournament = NonNullable<TournamentsPayload["tournaments"]["data"]["items"]>[number];
export type ApiCard = NonNullable<ApiCardList["items"]>[number];
export type ApiIconUrls = NonNullable<ApiCard["iconUrls"]>;
export type ApiArena = NonNullable<ApiPlayer["arena"]>;
export type ApiPlayerLeagueStats = NonNullable<ApiPlayer["currentPathOfLegendSeasonResult"]>;
export type ApiBattleParticipant = NonNullable<ApiBattle["team"]>[number];
export type ApiClanMember = NonNullable<ApiClan["memberList"]>[number];
export type ApiRiverRaceClan = NonNullable<ApiCurrentRiverRace["clan"]>;
export type ApiRiverRaceParticipant = NonNullable<ApiRiverRaceClan["participants"]>[number];
export type ApiRiverRaceLogEntry = NonNullable<ApiRiverRaceLog["items"]>[number];
export type ApiPaged<T> = Omit<LocationsPayload["locations"]["data"], "items"> & { items?: T[] };
export type RankingKind = RankingsPayload["kind"];

export type PipelineStatusPayload = FunctionReturnType<typeof clashBackend.meta.pipelineStatus>;
export type CountProbe = PipelineStatusPayload["due"];
export type PipelineRun = PipelineStatusPayload["lastRuns"][number];
export type TopDecksPayload = FunctionReturnType<typeof clashBackend.meta.topDecks>;
export type RankedDeck = TopDecksPayload["decks"][number];
export type TopCardsPayload = FunctionReturnType<typeof clashBackend.meta.topCards>;
export type RankedCard = TopCardsPayload["cards"][number];
export type TopTowerTroopsPayload = FunctionReturnType<typeof clashBackend.meta.topTowerTroops>;
export type RankedTowerTroop = TopTowerTroopsPayload["towerTroops"][number];
export type DeckMetaPayload = FunctionReturnType<typeof clashBackend.meta.deckMeta>;

export type PlayerSearchPayload = FunctionReturnType<typeof clashBackend.players.search>;
export type DirectoryHit = PlayerSearchPayload["players"][number];
export type ProfileHistoryPoint = FunctionReturnType<typeof clashBackend.history.profile>[number];
