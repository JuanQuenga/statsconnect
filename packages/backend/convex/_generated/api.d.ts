/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as brawl_clubs from "../brawl/clubs.js";
import type * as brawl_crawler from "../brawl/crawler.js";
import type * as brawl_ingest from "../brawl/ingest.js";
import type * as brawl_pipeline from "../brawl/pipeline.js";
import type * as brawl_players from "../brawl/players.js";
import type * as brawl_stats from "../brawl/stats.js";
import type * as clash_cache from "../clash/cache.js";
import type * as clash_clashApi from "../clash/clashApi.js";
import type * as clash_clashFetch from "../clash/clashFetch.js";
import type * as clash_crawler from "../clash/crawler.js";
import type * as clash_lib_battles from "../clash/lib/battles.js";
import type * as clash_lib_format from "../clash/lib/format.js";
import type * as clash_lib_mockData from "../clash/lib/mockData.js";
import type * as clash_lib_tag from "../clash/lib/tag.js";
import type * as clash_lib_types from "../clash/lib/types.js";
import type * as clash_meta from "../clash/meta.js";
import type * as clash_players from "../clash/players.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as hub_adapters_brawl from "../hub/adapters/brawl.js";
import type * as hub_adapters_clash from "../hub/adapters/clash.js";
import type * as hub_adapters_guards from "../hub/adapters/guards.js";
import type * as hub_adapters_registry from "../hub/adapters/registry.js";
import type * as hub_adapters_stub from "../hub/adapters/stub.js";
import type * as hub_adapters_tags from "../hub/adapters/tags.js";
import type * as hub_adapters_types from "../hub/adapters/types.js";
import type * as hub_cacheAccess from "../hub/cacheAccess.js";
import type * as hub_internal_connectThrottle from "../hub/internal/connectThrottle.js";
import type * as hub_internal_profileCache from "../hub/internal/profileCache.js";
import type * as hub_internal_profileWrites from "../hub/internal/profileWrites.js";
import type * as hub_model from "../hub/model.js";
import type * as hub_profileData from "../hub/profileData.js";
import type * as hub_profiles from "../hub/profiles.js";
import type * as hub_validators from "../hub/validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "brawl/clubs": typeof brawl_clubs;
  "brawl/crawler": typeof brawl_crawler;
  "brawl/ingest": typeof brawl_ingest;
  "brawl/pipeline": typeof brawl_pipeline;
  "brawl/players": typeof brawl_players;
  "brawl/stats": typeof brawl_stats;
  "clash/cache": typeof clash_cache;
  "clash/clashApi": typeof clash_clashApi;
  "clash/clashFetch": typeof clash_clashFetch;
  "clash/crawler": typeof clash_crawler;
  "clash/lib/battles": typeof clash_lib_battles;
  "clash/lib/format": typeof clash_lib_format;
  "clash/lib/mockData": typeof clash_lib_mockData;
  "clash/lib/tag": typeof clash_lib_tag;
  "clash/lib/types": typeof clash_lib_types;
  "clash/meta": typeof clash_meta;
  "clash/players": typeof clash_players;
  crons: typeof crons;
  http: typeof http;
  "hub/adapters/brawl": typeof hub_adapters_brawl;
  "hub/adapters/clash": typeof hub_adapters_clash;
  "hub/adapters/guards": typeof hub_adapters_guards;
  "hub/adapters/registry": typeof hub_adapters_registry;
  "hub/adapters/stub": typeof hub_adapters_stub;
  "hub/adapters/tags": typeof hub_adapters_tags;
  "hub/adapters/types": typeof hub_adapters_types;
  "hub/cacheAccess": typeof hub_cacheAccess;
  "hub/internal/connectThrottle": typeof hub_internal_connectThrottle;
  "hub/internal/profileCache": typeof hub_internal_profileCache;
  "hub/internal/profileWrites": typeof hub_internal_profileWrites;
  "hub/model": typeof hub_model;
  "hub/profileData": typeof hub_profileData;
  "hub/profiles": typeof hub_profiles;
  "hub/validators": typeof hub_validators;
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
