/* eslint-disable */
import type * as internal_profileCache from "../internal/profileCache.js";
import type * as internal_profileWrites from "../internal/profileWrites.js";
import type * as internal_connectThrottle from "../internal/connectThrottle.js";
import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";

declare const fullApi: ApiFromModules<{
  "internal/profileCache": typeof internal_profileCache;
  "internal/profileWrites": typeof internal_profileWrites;
  "internal/connectThrottle": typeof internal_connectThrottle;
}>;

type InternalFunction = FunctionReference<"query" | "mutation" | "action", "internal">;

export declare const api: Record<string, never>;
export declare const internal: FilterApi<typeof fullApi, InternalFunction>;
export declare const components: Record<string, never>;
