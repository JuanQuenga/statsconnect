import assert from "node:assert/strict";
import test from "node:test";
import { safeAnalyticsProperties, safePathname, safeSourceUrl, safeUrl } from "./privacy.ts";
import { sanitizeSentryEvent } from "./sentry-privacy.ts";

test("pageviews retain route meaning without player tags, query tokens, or fragments", () => {
  assert.equal(safeUrl("https://statsconnect.app/games/clash-royale/%23P0Y89?token=secret#player"), "https://statsconnect.app/games/clash-royale/:id");
  assert.equal(safePathname("/cr/players/P0Y89/history"), "/cr/players/:id/history");
  assert.equal(safePathname("/unexpected-private-value"), "/:id");
});

test("analytics sends only supported product dimensions and anonymous SDK metadata", () => {
  const safe = safeAnalyticsProperties({
    game: "clash-royale", stage: "preview", reason: "not-found",
    distinct_id: "anonymous-uuid", $session_id: "session-uuid",
    email: "person@example.com", playerTag: "P0Y89", error: "token=private",
    $current_url: "https://statsconnect.app/connect/clash-royale?tag=P0Y89",
    $referrer: "https://www.google.com/search?q=private+player",
    $initial_current_url: "https://statsconnect.app/?token=secret",
  });
  assert.deepEqual(safe, {
    game: "clash-royale", stage: "preview", reason: "not-found",
    distinct_id: "anonymous-uuid", $session_id: "session-uuid",
    $current_url: "https://statsconnect.app/connect/clash-royale",
    $referring_domain: "www.google.com",
  });
  assert.deepEqual(safeAnalyticsProperties({ game: "private", reason: "person@example.com", stage: "tag" }), {});
});

test("referrer attribution survives capture and before_send sanitation without accepting URLs or credentials", () => {
  const captured = safeAnalyticsProperties({
    $referrer: "https://www.google.com/search?q=private+player",
    $current_url: "https://statsconnect.app/cr/players/P0Y89?token=secret",
    environment: "production",
  });
  assert.deepEqual(safeAnalyticsProperties(captured), captured);
  assert.equal(captured.$referring_domain, "www.google.com");
  for (const value of ["https://google.com/search?q=secret", "person@example.com", "google.com/private", "google.com?token=secret", "google.com#secret"]) {
    assert.deepEqual(safeAnalyticsProperties({ $referring_domain: value }), {});
  }
});

test("Sentry strips account data and arbitrary error text while keeping actionable source positions", () => {
  const event = sanitizeSentryEvent({
    user: { email: "person@example.com" }, extra: { tag: "P0Y89" },
    contexts: { auth: { token: "secret" } }, message: "person@example.com",
    tags: { app: "statsconnect", source: "route", playerTag: "P0Y89" },
    request: { url: "https://statsconnect.app/cr/players/P0Y89?token=secret", cookies: { auth: "secret" }, headers: { Authorization: "secret" } },
    breadcrumbs: [
      { category: "console", message: "person@example.com" },
      { category: "navigation", data: { to: "/cr/players/P0Y89?token=secret" } },
    ],
    exception: { values: [{ type: "TypeError", value: "tag=P0Y89 token=secret", stacktrace: { frames: [{ filename: "https://statsconnect.app/assets/index-abcd.js?token=secret", lineno: 42, colno: 7 }] } }] },
  });
  const serialized = JSON.stringify(event);
  assert.doesNotMatch(serialized, /person@example|P0Y89|secret/);
  assert.match(serialized, /index-abcd\.js/);
  assert.equal(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.lineno, 42);
  assert.deepEqual(event.tags, { app: "statsconnect", source: "route" });
  assert.equal(event.breadcrumbs?.length, 1);
  assert.equal(safeSourceUrl("https://statsconnect.app/assets/index.js#private"), "https://statsconnect.app/assets/index.js");
});
