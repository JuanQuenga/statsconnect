import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { clashBackend } from "@/lib/platformBackend";

export const playerHistoryQuery = clashBackend.history.player;
export const leaderboardBoardsQuery = clashBackend.history.leaderboardBoards;
export const leaderboardSnapshotsQuery = clashBackend.history.leaderboardSnapshots;
export const leaderboardSnapshotQuery = clashBackend.history.leaderboardSnapshot;

export type PlayerHistorySnapshot = FunctionReturnType<typeof playerHistoryQuery>[number];
export type PathSnapshot = NonNullable<PlayerHistorySnapshot["path"]>["current"];
export type HistoricalLeaderboard = FunctionReturnType<typeof leaderboardBoardsQuery>[number];
export type HistoricalLeaderboardSnapshot = FunctionReturnType<typeof leaderboardSnapshotsQuery>[number];
export type HistoricalLeaderboardDetail = NonNullable<FunctionReturnType<typeof leaderboardSnapshotQuery>>;
export type HistoricalLeaderboardEntry = HistoricalLeaderboardDetail["entries"][number];
export type HistoricalLeaderboardSnapshotId = FunctionArgs<typeof leaderboardSnapshotQuery>["snapshotId"];
