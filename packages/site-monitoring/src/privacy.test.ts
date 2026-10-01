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

const privateHosts = [
  "P0Y89.example.test", "P0Y89.statsconnect.app", "P0Y89.google.com",
  "P0Y89.vercel.app", "P0Y89.com", "statsconnect.app.P0Y89.test",
  "%50%30%59%38%39.example.test", "P0Y89.example.test.",
  "xn--p0y89-9za.example.test", "192.0.2.89", "[2001:db8::89]",
];

test("unknown URL origins are replaced for routes and static sources, including parser variants", () => {
  for (const host of privateHosts) {
    for (const prefix of ["https://", "http://", "//"]) {
      const route = safeUrl(`${prefix}${host}:8089/cr/players/P0Y89?token=secret#private`);
      assert.equal(route, "https://redacted.invalid/cr/players/:id");
      assert.equal(safeUrl(route), route);
      const source = safeSourceUrl(`${prefix}${host}:8089/cr/assets/index-abcd.js?token=secret`);
      assert.equal(source, "https://redacted.invalid/cr/assets/index-abcd.js");
      assert.equal(safeSourceUrl(source), source);
    }
  }
  for (const value of [
    "blob:https://P0Y89.example.test/private", "blob:https://statsconnect.app/private",
    "data:text/plain,P0Y89", "file://P0Y89.example.test/assets/index.js",
    "javascript:private", "https://[invalid",
  ]) {
    assert.equal(safeUrl(value), "[redacted URL]");
    assert.equal(safeSourceUrl(value), "[redacted URL]");
  }
});

test("exact application hosts retain route and source attribution without credentials or ports", () => {
  for (const host of ["statsconnect.app", "bs.statsconnect.app", "cr.statsconnect.app"]) {
    assert.equal(safeUrl(`https://P0Y89:secret@${host.toUpperCase()}.:8089/players/P0Y89`), `https://${host}/players/:id`);
    assert.equal(safeSourceUrl(`https://${host}/bs/assets/index-abcd.js?token=secret`), `https://${host}/bs/assets/index-abcd.js`);
  }
  assert.equal(safeUrl("/cr/players/P0Y89"), "https://statsconnect.app/cr/players/:id");
  assert.equal(safeSourceUrl("/cr/assets/index-abcd.js"), "https://statsconnect.app/cr/assets/index-abcd.js");
});

test("both referrer representations omit arbitrary identifiers through both analytics passes", () => {
  for (const host of privateHosts) {
    for (const properties of [
      { $referrer: `https://${host}/cr/players/P0Y89?token=secret` },
      { $referring_domain: host },
      { $referrer: `https://${host}/`, $referring_domain: "www.google.com" },
    ]) {
      const captured = safeAnalyticsProperties(properties);
      assert.deepEqual(captured, {});
      assert.deepEqual(safeAnalyticsProperties(captured), {});
    }
  }
  for (const value of ["blob:https://www.google.com/private", "file://www.google.com/private", "not a URL"]) {
    assert.deepEqual(safeAnalyticsProperties({ $referrer: value, $referring_domain: "www.google.com" }), {});
  }
});

test("exact safe referrer hosts retain useful attribution and normalize case and trailing dots", () => {
  for (const host of ["www.google.com", "google.com", "www.bing.com", "duckduckgo.com", "bs.statsconnect.app"]) {
    for (const properties of [
      { $referrer: `https://P0Y89:secret@${host.toUpperCase()}.:8089/search?q=private` },
      { $referring_domain: `${host.toUpperCase()}.` },
    ]) {
      const captured = safeAnalyticsProperties(properties);
      assert.deepEqual(captured, { $referring_domain: host });
      assert.deepEqual(safeAnalyticsProperties(captured), captured);
    }
  }
  for (const value of ["www.google.com:8089", "www.google.com..", "www.google.com/private", "person@www.google.com"]) {
    assert.deepEqual(safeAnalyticsProperties({ $referring_domain: value }), {});
  }
});

test("Sentry sanitizes hostname identifiers in requests, both navigation URLs and both frame URL fields", () => {
  const event = sanitizeSentryEvent({
    request: { url: "https://P0Y89.example.test/cr/players/P0Y89" },
    breadcrumbs: [{ category: "navigation", data: {
      from: "https://P0Y89.statsconnect.app/cr/players", to: "//P0Y89.vercel.app/cr/players",
    } }],
    exception: { values: [{ stacktrace: { frames: [{
      filename: "https://P0Y89.example.test/assets/index-abcd.js",
      abs_path: "https://P0Y89.google.com/cr/assets/index-abcd.js", lineno: 42, colno: 7,
    }] } }] },
  });
  assert.doesNotMatch(JSON.stringify(event), /p0y89|example\.test|vercel\.app|google\.com/i);
  assert.equal(event.request?.url, "https://redacted.invalid/cr/players/:id");
  assert.equal(event.exception.values[0]?.stacktrace.frames[0]?.filename, "https://redacted.invalid/assets/index-abcd.js");
  assert.equal(event.exception.values[0]?.stacktrace.frames[0]?.lineno, 42);
  assert.equal(event.exception.values[0]?.stacktrace.frames[0]?.colno, 7);
});
