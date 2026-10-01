import assert from "node:assert/strict";
import test from "node:test";
import { reportClientError } from "../../site-errors/src/index.ts";
import { captureSiteEvent, initializeMonitoring } from "./index.ts";

test("real Sentry sends one sanitized queued error across module copies and respects DNT", async () => {
  const descriptors = new Map(["window", "navigator", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const browser = new EventTarget();
  Object.defineProperty(browser, "location", { value: new URL("https://statsconnect.app/cr/players/P0Y89?token=secret") });
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  const privacy = { doNotTrack: "0" };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: privacy });
  const envelopes: string[] = [];
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (_url: unknown, options?: RequestInit) => {
    if (typeof options?.body === "string") envelopes.push(options.body);
    return new Response("", { status: 200 });
  } });
  try {
    const config = { enabled: true, environment: "test", sentryDsn: "https://public@o0.ingest.sentry.io/1" };
    const ready = initializeMonitoring(config);
    const startupError = new TypeError("Private tag P0Y89 token=secret");
    reportClientError({ app: "StatsConnect Clash Royale", error: startupError, source: "render" });
    const secondCopy: typeof import("./index.ts") = await import(new URL("./index.ts?separate-game-bundle", import.meta.url).href);
    assert.equal(secondCopy.initializeMonitoring(config), ready);
    await ready;
    const sentry = await import("@sentry/react");
    assert.ok(sentry.getClient(), "configured initialization creates a real SDK client");
    reportClientError({ app: "StatsConnect Clash Royale", error: startupError, source: "route" });
    await sentry.flush(1000);
    assert.equal(envelopes.length, 1, "startup error is queued and repeated error objects are deduplicated");
    assert.doesNotMatch(envelopes[0] ?? "", /P0Y89|secret/);
    assert.match(envelopes[0] ?? "", /StatsConnect Clash Royale/);
    privacy.doNotTrack = "1";
    reportClientError({ app: "StatsConnect", error: new Error("DNT error"), source: "route" });
    await sentry.flush(1000);
    assert.equal(envelopes.length, 1);
    captureSiteEvent("player_lookup_submitted", { game: "clash-royale" });
    assert.equal(window.__statsconnectMonitoring?.pending.length, 0, "Sentry-only configuration never queues analytics");
    await sentry.close(1000);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
