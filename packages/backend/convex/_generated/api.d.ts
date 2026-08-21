/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authOrigins from "../authOrigins.js";
import type * as brawl_clubs from "../brawl/clubs.js";
import type * as brawl_controls from "../brawl/controls.js";
import type * as brawl_crawler from "../brawl/crawler.js";
import type * as brawl_http from "../brawl/http.js";
import type * as brawl_ingest from "../brawl/ingest.js";
import type * as brawl_ingestPolicy from "../brawl/ingestPolicy.js";
import type * as brawl_pipeline from "../brawl/pipeline.js";
import type * as brawl_pipelinePolicy from "../brawl/pipelinePolicy.js";
import type * as brawl_players from "../brawl/players.js";
import type * as brawl_stats from "../brawl/stats.js";
import type * as brawl_upstreamIntake from "../brawl/upstreamIntake.js";
import type * as clash_analytics from "../clash/analytics.js";
import type * as clash_cache from "../clash/cache.js";
import type * as clash_clanManagement from "../clash/clanManagement.js";
import type * as clash_clanManagementActions from "../clash/clanManagementActions.js";
import type * as clash_clashApi from "../clash/clashApi.js";
import type * as clash_clashFetch from "../clash/clashFetch.js";
import type * as clash_crawler from "../clash/crawler.js";
import type * as clash_history from "../clash/history.js";
import type * as clash_lib_battles from "../clash/lib/battles.js";
import type * as clash_lib_domain from "../clash/lib/domain.js";
import type * as clash_lib_format from "../clash/lib/format.js";
import type * as clash_lib_mockData from "../clash/lib/mockData.js";
import type * as clash_lib_playerActivity from "../clash/lib/playerActivity.js";
import type * as clash_lib_tag from "../clash/lib/tag.js";
import type * as clash_lib_types from "../clash/lib/types.js";
import type * as clash_meta from "../clash/meta.js";
import type * as clash_news from "../clash/news.js";
import type * as clash_personalization from "../clash/personalization.js";
import type * as clash_players from "../clash/players.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as hub_access from "../hub/access.js";
import type * as hub_accessModel from "../hub/accessModel.js";
import type * as hub_adapters_brawl from "../hub/adapters/brawl.js";
import type * as hub_adapters_clash from "../hub/adapters/clash.js";
import type * as hub_adapters_guards from "../hub/adapters/guards.js";
import type * as hub_adapters_registry from "../hub/adapters/registry.js";
import type * as hub_adapters_stub from "../hub/adapters/stub.js";
import type * as hub_adapters_tags from "../hub/adapters/tags.js";
import type * as hub_adapters_types from "../hub/adapters/types.js";
import type * as hub_auth from "../hub/auth.js";
import type * as hub_billing_adapter from "../hub/billing/adapter.js";
import type * as hub_cacheAccess from "../hub/cacheAccess.js";
import type * as hub_internal_connectThrottle from "../hub/internal/connectThrottle.js";
import type * as hub_internal_entitlements from "../hub/internal/entitlements.js";
import type * as hub_internal_profileCache from "../hub/internal/profileCache.js";
import type * as hub_internal_watchTargets from "../hub/internal/watchTargets.js";
import type * as hub_model from "../hub/model.js";
import type * as hub_profiles from "../hub/profiles.js";
import type * as hub_savedProfiles from "../hub/savedProfiles.js";
import type * as hub_scheduling from "../hub/scheduling.js";
import type * as hub_validators from "../hub/validators.js";
import type * as hub_watchDemand from "../hub/watchDemand.js";
import type * as hub_watchTargetModel from "../hub/watchTargetModel.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authOrigins: typeof authOrigins;
  "brawl/clubs": typeof brawl_clubs;
  "brawl/controls": typeof brawl_controls;
  "brawl/crawler": typeof brawl_crawler;
  "brawl/http": typeof brawl_http;
  "brawl/ingest": typeof brawl_ingest;
  "brawl/ingestPolicy": typeof brawl_ingestPolicy;
  "brawl/pipeline": typeof brawl_pipeline;
  "brawl/pipelinePolicy": typeof brawl_pipelinePolicy;
  "brawl/players": typeof brawl_players;
  "brawl/stats": typeof brawl_stats;
  "brawl/upstreamIntake": typeof brawl_upstreamIntake;
  "clash/analytics": typeof clash_analytics;
  "clash/cache": typeof clash_cache;
  "clash/clanManagement": typeof clash_clanManagement;
  "clash/clanManagementActions": typeof clash_clanManagementActions;
  "clash/clashApi": typeof clash_clashApi;
  "clash/clashFetch": typeof clash_clashFetch;
  "clash/crawler": typeof clash_crawler;
  "clash/history": typeof clash_history;
  "clash/lib/battles": typeof clash_lib_battles;
  "clash/lib/domain": typeof clash_lib_domain;
  "clash/lib/format": typeof clash_lib_format;
  "clash/lib/mockData": typeof clash_lib_mockData;
  "clash/lib/playerActivity": typeof clash_lib_playerActivity;
  "clash/lib/tag": typeof clash_lib_tag;
  "clash/lib/types": typeof clash_lib_types;
  "clash/meta": typeof clash_meta;
  "clash/news": typeof clash_news;
  "clash/personalization": typeof clash_personalization;
  "clash/players": typeof clash_players;
  crons: typeof crons;
  http: typeof http;
  "hub/access": typeof hub_access;
  "hub/accessModel": typeof hub_accessModel;
  "hub/adapters/brawl": typeof hub_adapters_brawl;
  "hub/adapters/clash": typeof hub_adapters_clash;
  "hub/adapters/guards": typeof hub_adapters_guards;
  "hub/adapters/registry": typeof hub_adapters_registry;
  "hub/adapters/stub": typeof hub_adapters_stub;
  "hub/adapters/tags": typeof hub_adapters_tags;
  "hub/adapters/types": typeof hub_adapters_types;
  "hub/auth": typeof hub_auth;
  "hub/billing/adapter": typeof hub_billing_adapter;
  "hub/cacheAccess": typeof hub_cacheAccess;
  "hub/internal/connectThrottle": typeof hub_internal_connectThrottle;
  "hub/internal/entitlements": typeof hub_internal_entitlements;
  "hub/internal/profileCache": typeof hub_internal_profileCache;
  "hub/internal/watchTargets": typeof hub_internal_watchTargets;
  "hub/model": typeof hub_model;
  "hub/profiles": typeof hub_profiles;
  "hub/savedProfiles": typeof hub_savedProfiles;
  "hub/scheduling": typeof hub_scheduling;
  "hub/validators": typeof hub_validators;
  "hub/watchDemand": typeof hub_watchDemand;
  "hub/watchTargetModel": typeof hub_watchTargetModel;
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

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
