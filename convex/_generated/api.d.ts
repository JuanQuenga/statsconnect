/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adapters_brawl from "../adapters/brawl.js";
import type * as adapters_clash from "../adapters/clash.js";
import type * as adapters_guards from "../adapters/guards.js";
import type * as adapters_registry from "../adapters/registry.js";
import type * as adapters_stub from "../adapters/stub.js";
import type * as adapters_tags from "../adapters/tags.js";
import type * as adapters_types from "../adapters/types.js";
import type * as cacheAccess from "../cacheAccess.js";
import type * as internal_connectThrottle from "../internal/connectThrottle.js";
import type * as internal_profileCache from "../internal/profileCache.js";
import type * as internal_profileWrites from "../internal/profileWrites.js";
import type * as model from "../model.js";
import type * as profileData from "../profileData.js";
import type * as profiles from "../profiles.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "adapters/brawl": typeof adapters_brawl;
  "adapters/clash": typeof adapters_clash;
  "adapters/guards": typeof adapters_guards;
  "adapters/registry": typeof adapters_registry;
  "adapters/stub": typeof adapters_stub;
  "adapters/tags": typeof adapters_tags;
  "adapters/types": typeof adapters_types;
  cacheAccess: typeof cacheAccess;
  "internal/connectThrottle": typeof internal_connectThrottle;
  "internal/profileCache": typeof internal_profileCache;
  "internal/profileWrites": typeof internal_profileWrites;
  model: typeof model;
  profileData: typeof profileData;
  profiles: typeof profiles;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
