import { queryOptions } from "@tanstack/react-query";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import type {
  AdapterResult,
  ConnectedProfile,
  GameId,
  HubState,
  ProfileErrorCode,
  ProfileId,
  ProfileStats,
  ProfileSummary,
} from "./contracts";
import { normalizeTag, TagError } from "./tags";
import { getViewerId } from "./viewer";

const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim();
const convex = convexUrl ? new ConvexHttpClient(convexUrl, { logger: false }) : null;

const refs = {
  getHubState: makeFunctionReference<"query", { viewerId: string }, HubState>("hub/profiles:getHubState"),
  preview: makeFunctionReference<"action", { viewerId: string; game: GameId; playerTag: string }, AdapterResult<ProfileSummary>>("hub/profiles:preview"),
  connect: makeFunctionReference<"action", { viewerId: string; game: GameId; playerTag: string }, { profile: ConnectedProfile; activeProfileId: ProfileId; summary: AdapterResult<ProfileSummary> }>("hub/profiles:connect"),
  disconnect: makeFunctionReference<"mutation", { viewerId: string; profileId: ProfileId }, { removed: boolean; activeProfileId: ProfileId | null }>("hub/profiles:disconnect"),
  setActive: makeFunctionReference<"mutation", { viewerId: string; profileId: ProfileId }, { activeProfileId: ProfileId }>("hub/profiles:setActive"),
  getStats: makeFunctionReference<"action", { viewerId: string; profileId: ProfileId }, AdapterResult<ProfileStats>>("hub/profileData:getStats"),
};

const errorCodes: ReadonlySet<string> = new Set<ProfileErrorCode>([
  "INVALID_VIEWER",
  "PROFILE_NOT_CONNECTED",
  "INVALID_TAG",
  "PROFILE_NOT_FOUND",
  "NOT_CONFIGURED",
  "UPSTREAM_FORBIDDEN",
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "BAD_UPSTREAM_RESPONSE",
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProfileErrorCode(value: unknown): value is ProfileErrorCode {
  return typeof value === "string" && errorCodes.has(value);
}

export class DataClientError extends Error {
  readonly code: ProfileErrorCode;

  constructor(code: ProfileErrorCode, message: string) {
    super(message);
    this.name = "DataClientError";
    this.code = code;
  }
}

function requireConvex(): ConvexHttpClient {
  if (!convex) {
    throw new DataClientError(
      "NOT_CONFIGURED",
      "StatsConnect is not configured. Add VITE_CONVEX_URL for this deployment.",
    );
  }
  return convex;
}

function toClientError(error: unknown): DataClientError {
  if (error instanceof DataClientError) return error;
  if (error instanceof TagError) return new DataClientError("INVALID_TAG", error.message);
  if (error instanceof ConvexError && record(error.data)) {
    const code = error.data.code;
    const message = error.data.message;
    if (isProfileErrorCode(code) && typeof message === "string") {
      return new DataClientError(code, message);
    }
  }
  if (error instanceof Error) {
    return new DataClientError("UPSTREAM_UNAVAILABLE", error.message);
  }
  return new DataClientError("UPSTREAM_UNAVAILABLE", "StatsConnect could not complete the request.");
}

async function request<T>(operation: (client: ConvexHttpClient) => Promise<T>): Promise<T> {
  try {
    return await operation(requireConvex());
  } catch (error) {
    throw toClientError(error);
  }
}

export const dataClient = {
  mode: convex ? "convex" as const : "unconfigured" as const,

  getHubState(): Promise<HubState> {
    return request((client) => client.query(refs.getHubState, { viewerId: getViewerId() }));
  },

  preview(game: GameId, playerTag: string): Promise<AdapterResult<ProfileSummary>> {
    return request((client) => client.action(refs.preview, {
      viewerId: getViewerId(),
      game,
      playerTag: normalizeTag(playerTag),
    }));
  },

  connect(game: GameId, playerTag: string): Promise<{ profile: ConnectedProfile; activeProfileId: ProfileId; summary: AdapterResult<ProfileSummary> }> {
    return request((client) => client.action(refs.connect, {
      viewerId: getViewerId(),
      game,
      playerTag: normalizeTag(playerTag),
    }));
  },

  disconnect(profileId: ProfileId): Promise<{ removed: boolean; activeProfileId: ProfileId | null }> {
    return request((client) => client.mutation(refs.disconnect, { viewerId: getViewerId(), profileId }));
  },

  setActive(profileId: ProfileId): Promise<{ activeProfileId: ProfileId }> {
    return request((client) => client.mutation(refs.setActive, { viewerId: getViewerId(), profileId }));
  },

  getStats(profileId: ProfileId): Promise<AdapterResult<ProfileStats>> {
    return request((client) => client.action(refs.getStats, { viewerId: getViewerId(), profileId }));
  },
};

export function hubQueryOptions() {
  return queryOptions({
    queryKey: ["hub-state", getViewerId()],
    queryFn: () => dataClient.getHubState(),
  });
}

export function statsQueryOptions(profileId: ProfileId) {
  return queryOptions({
    queryKey: ["profile-stats", profileId],
    queryFn: () => dataClient.getStats(profileId),
  });
}
