import assert from "node:assert/strict";
import test from "node:test";

import {
  authTrustedOrigins,
  CANONICAL_STATS_CONNECT_ORIGIN,
  LEGACY_STATS_CONNECT_ORIGINS,
} from "../convex/authOrigins.ts";

test("shared auth trusts the canonical host and temporary legacy host redirects", () => {
  assert.equal(CANONICAL_STATS_CONNECT_ORIGIN, "https://statsconnect.app");
  assert.deepEqual(LEGACY_STATS_CONNECT_ORIGINS, [
    "https://stats.juanquenga.com",
    "https://brawlstats.juanquenga.com",
    "https://clashcrown.juanquenga.com",
  ]);
  assert.deepEqual(authTrustedOrigins(CANONICAL_STATS_CONNECT_ORIGIN), [
    CANONICAL_STATS_CONNECT_ORIGIN,
    ...LEGACY_STATS_CONNECT_ORIGINS,
  ]);
});

test("the previous SITE_URL stays trusted during the canonical-domain rollout", () => {
  assert.deepEqual(authTrustedOrigins("https://stats.juanquenga.com"), [
    "https://stats.juanquenga.com",
    "https://statsconnect.app",
    "https://brawlstats.juanquenga.com",
    "https://clashcrown.juanquenga.com",
  ]);
});

test("shared auth preserves the configured Convex site URL alongside public origins", () => {
  const siteUrl = "https://example.convex.site";
  assert.deepEqual(authTrustedOrigins(siteUrl), [
    siteUrl,
    CANONICAL_STATS_CONNECT_ORIGIN,
    ...LEGACY_STATS_CONNECT_ORIGINS,
  ]);
});
