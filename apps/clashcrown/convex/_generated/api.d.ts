/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cache from "../cache.js";
import type * as clashApi from "../clashApi.js";
import type * as clashFetch from "../clashFetch.js";
import type * as crawler from "../crawler.js";
import type * as crons from "../crons.js";
import type * as meta from "../meta.js";
import type * as players from "../players.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  cache: typeof cache;
  clashApi: typeof clashApi;
  clashFetch: typeof clashFetch;
  crawler: typeof crawler;
  crons: typeof crons;
  meta: typeof meta;
  players: typeof players;
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
