import assert from "node:assert/strict";
import test from "node:test";
import { reportClientError } from "../../site-errors/src/index.ts";
import { initializeMonitoring } from "./index.ts";

test("real Sentry redacts debug metadata URL copies while preserving source-map debug IDs", async () => {
  const descriptors = new Map(["window", "navigator", "fetch", "_sentryDebugIds"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const browser = new EventTarget();
  Object.defineProperty(browser, "location", { value: new URL("https://statsconnect.app/") });
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { doNotTrack: "0" } });
  const fixtures = [
    { url: "https://P0Y89.example.test/cr/assets/index-abcd.js", safe: "https://redacted.invalid/cr/assets/index-abcd.js", debugId: "11111111-1111-4111-8111-111111111111" },
    { url: "https://cr.statsconnect.app/cr/assets/index-abcd.js", safe: "https://cr.statsconnect.app/cr/assets/index-abcd.js", debugId: "22222222-2222-4222-8222-222222222222" },
  ];
  const stack = (url: string) => `Error: private\n    at render (${url}:42:7)`;
  Object.defineProperty(globalThis, "_sentryDebugIds", {
    configurable: true,
    value: Object.fromEntries(fixtures.map((fixture) => [stack(fixture.url), fixture.debugId])),
  });
  const envelopes: string[] = [];
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (_url: unknown, options?: RequestInit) => {
    if (typeof options?.body === "string") envelopes.push(options.body);
    return new Response("", { status: 200 });
  } });
  const sentry = await import("@sentry/react");
  try {
    await initializeMonitoring({ enabled: true, environment: "test", sentryDsn: "https://public@o0.ingest.sentry.io/1" });
    for (const fixture of fixtures) {
      const error = new Error("private");
      error.stack = stack(fixture.url);
      reportClientError({ app: "StatsConnect", error, source: "render" });
      await sentry.flush(1000);
      const envelope = envelopes.at(-1);
      assert.ok(envelope, "the real SDK sends an envelope through the intercepted transport");
      assert.doesNotMatch(envelope, /P0Y89|example\.test/i);
      const event: unknown = JSON.parse(envelope.split("\n")[2] ?? "null");
      assert.partialDeepStrictEqual(event, {
        debug_meta: { images: [{ type: "sourcemap", code_file: fixture.safe, debug_id: fixture.debugId }] },
        exception: { values: [{ stacktrace: { frames: [{ filename: fixture.safe, lineno: 42, colno: 7 }] } }] },
      });
    }
    assert.equal(envelopes.length, fixtures.length);
  } finally {
    await sentry.close(1000);
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
