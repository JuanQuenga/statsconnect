import assert from "node:assert/strict";
import test from "node:test";

import { createClashUpstream } from "../convex/clash/clashFetch.ts";

const configuredEnvironment = {
  CLASH_ROYALE_API_TOKEN: "test-token",
  CLASH_ROYALE_API_BASE_URL: "https://example.test/v1/",
};

test("a named operation applies configuration and records a successful request", async () => {
  const observations = [];
  let requestedUrl = "";
  let authorization = "";
  const upstream = createClashUpstream({
    environment: configuredEnvironment,
    transport: async (url, init) => {
      requestedUrl = url;
      authorization = new Headers(init.headers).get("Authorization") ?? "";
      return Response.json({ tag: "#2PP", name: "Ada", currentWinLoseStreak: -3 });
    },
    observe: async (observation) => {
      observations.push(observation);
    },
    now: () => 100,
  });

  const result = await upstream.player("2PP");

  assert.equal(result.ok, true);
  assert.equal(requestedUrl, "https://example.test/v1/players/%232PP");
  assert.equal(authorization, "Bearer test-token");
  assert.equal(result.ok ? result.data.currentWinLoseStreak : undefined, -3);
  assert.deepEqual(observations, [{
    operation: "player",
    endpoint: "/players/{tag}",
    status: 200,
    ok: true,
    fetchedAt: 100,
    durationMs: 0,
  }]);
});

test("missing configuration returns a nonretryable configuration failure", async () => {
  const observations = [];
  const upstream = createClashUpstream({
    environment: {},
    transport: async () => {
      throw new Error("transport should not run");
    },
    observe: async (observation) => {
      observations.push(observation);
    },
    now: () => 200,
  });

  const result = await upstream.cards();

  assert.deepEqual(result, {
    ok: false,
    kind: "configuration",
    status: 0,
    code: "MISSING_API_TOKEN",
    message: "Add CLASH_ROYALE_API_TOKEN to the Convex deployment environment.",
    retryable: false,
  });
  assert.equal(observations[0]?.errorKind, "configuration");
});

test("an invalid base URL fails before transport runs", async () => {
  const upstream = createClashUpstream({
    environment: {
      CLASH_ROYALE_API_TOKEN: "test-token",
      CLASH_ROYALE_API_BASE_URL: "not a URL",
    },
    transport: async () => {
      throw new Error("transport should not run");
    },
  });

  const result = await upstream.cards();

  assert.equal(result.ok, false);
  assert.equal(result.kind, "configuration");
  assert.equal(result.code, "INVALID_API_BASE_URL");
});

test("a malformed successful payload becomes an invalid response failure", async () => {
  const observations = [];
  const upstream = createClashUpstream({
    environment: configuredEnvironment,
    transport: async () => Response.json({ tag: "#2PP" }),
    observe: async (observation) => {
      observations.push(observation);
    },
  });

  const result = await upstream.player("2PP");

  assert.equal(result.ok, false);
  assert.equal(result.kind, "invalid_response");
  assert.equal(result.code, "CLASH_API_INVALID_RESPONSE");
  assert.match(result.message, /player\.name/);
  assert.equal(observations[0]?.ok, false);
  assert.equal(observations[0]?.errorKind, "invalid_response");
});

test("a transport exception becomes a retryable network failure", async () => {
  const upstream = createClashUpstream({
    environment: configuredEnvironment,
    transport: async () => {
      throw new Error("connection closed");
    },
  });

  const result = await upstream.cards();

  assert.deepEqual(result, {
    ok: false,
    kind: "network",
    status: 0,
    code: "CLASH_API_NETWORK",
    message: "The Clash Royale API could not be reached from the backend.",
    retryable: true,
  });
});

test("http failures keep status and retry guidance", async () => {
  const upstream = createClashUpstream({
    environment: configuredEnvironment,
    transport: async () => Response.json({ reason: "busy" }, { status: 429 }),
  });

  const result = await upstream.leaderboards();

  assert.deepEqual(result, {
    ok: false,
    kind: "http",
    status: 429,
    code: "CLASH_API_429",
    message: "The Clash Royale API rate limit was reached. Try again shortly.",
    retryable: true,
  });
});

test("a logging failure does not replace valid upstream data", async () => {
  const upstream = createClashUpstream({
    environment: configuredEnvironment,
    transport: async () => Response.json({ items: [{ id: 7, name: "Board" }] }),
    observe: async () => {
      throw new Error("log unavailable");
    },
  });

  const result = await upstream.leaderboards();

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.data.items?.[0]?.id : null, 7);
});
