import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserConnectedProfilesAdapter } from "./browser-connected-profiles.ts";

test("browser Adapter migrates legacy Site Navigation storage into Hub profile storage", () => {
  const values = new Map<string, string>([
    ["statsconnect.profiles.v1", JSON.stringify([
      { game: "brawl-stars", tag: "#abc", name: "<c2>Harmiox</c>" },
    ])],
  ]);
  const cookies: string[] = [];
  const adapter = createBrowserConnectedProfilesAdapter({
    hostname: "stats.juanquenga.com",
    protocol: "https:",
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    readCookie: () => "",
    writeCookie: (value) => cookies.push(value),
    subscribeExternal: () => () => undefined,
    notify: () => undefined,
  });

  assert.deepEqual(adapter.read(), [
    { game: "brawl-stars", tag: "ABC", name: "Harmiox", updatedAt: 0 },
  ]);
  assert.ok(values.has("statsconnect.connected-profiles.v2"));
  assert.match(cookies[0] ?? "", /statsconnect_connected_profiles=/);
  assert.match(cookies[0] ?? "", /Domain=\.juanquenga\.com/);
});
