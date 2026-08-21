import assert from "node:assert/strict";
import test from "node:test";

import {
  authTrustedOrigins,
  CANONICAL_STATS_CONNECT_ORIGIN,
  LEGACY_STATS_CONNECT_ORIGINS,
} from "../convex/authOrigins.ts";

test("shared auth trusts the canonical host and temporary legacy host redirects", () => {
  assert.deepEqual(authTrustedOrigins(CANONICAL_STATS_CONNECT_ORIGIN), [
    CANONICAL_STATS_CONNECT_ORIGIN,
    ...LEGACY_STATS_CONNECT_ORIGINS,
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
