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
    "https://cr.statsconnect.app",
    "https://bs.statsconnect.app",
    ...LEGACY_STATS_CONNECT_ORIGINS,
  ]);
});

test("the previous SITE_URL stays trusted during the canonical-domain rollout", () => {
  assert.deepEqual(authTrustedOrigins("https://stats.juanquenga.com"), [
    "https://stats.juanquenga.com",
    "https://statsconnect.app",
    "https://cr.statsconnect.app",
    "https://bs.statsconnect.app",
    "https://brawlstats.juanquenga.com",
    "https://clashcrown.juanquenga.com",
  ]);
});

test("shared auth preserves the configured Convex site URL alongside public origins", () => {
  const siteUrl = "https://example.convex.site";
  assert.deepEqual(authTrustedOrigins(siteUrl), [
    siteUrl,
    CANONICAL_STATS_CONNECT_ORIGIN,
    "https://cr.statsconnect.app",
    "https://bs.statsconnect.app",
    ...LEGACY_STATS_CONNECT_ORIGINS,
  ]);
});

test("game host trust is explicit and deduplicates a game SITE_URL", () => {
  const trusted = authTrustedOrigins("https://cr.statsconnect.app");
  assert.equal(trusted.filter((origin) => origin === "https://cr.statsconnect.app").length, 1);
  for (const origin of ["https://other.statsconnect.app", "https://statsconnect.app.evil", "https://evil-statsconnect.app", "http://bs.statsconnect.app", "https://*.statsconnect.app"]) {
    assert.ok(!trusted.includes(origin));
  }
});
