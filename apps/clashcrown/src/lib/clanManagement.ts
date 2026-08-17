import type { FunctionReturnType } from "convex/server";
import { clashBackend } from "@/lib/platformBackend";

export const observeClanManagementAction = clashBackend.clanManagement.observe;
export const clanManagementDashboardQuery = clashBackend.clanManagement.dashboard;

export type ClanManagementDashboard = NonNullable<FunctionReturnType<typeof clanManagementDashboardQuery>>;
export type ClanManagementMember = ClanManagementDashboard["members"][number];
export type ClanManagementEvent = ClanManagementDashboard["events"][number];
export type ClanAttention = ClanManagementMember["attention"];
export type ClanEventKind = ClanManagementEvent["kind"];
