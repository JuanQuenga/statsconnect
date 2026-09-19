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

test("statsconnect.app writes secure parent-domain profile cookies shared by game hosts", () => {
  const cookies: string[] = [];
  const adapter = createBrowserConnectedProfilesAdapter({
    hostname: "statsconnect.app",
    protocol: "https:",
    storage: { getItem: () => null, setItem: () => undefined },
    readCookie: () => "",
    writeCookie: (value) => cookies.push(value),
    subscribeExternal: () => () => undefined,
    notify: () => undefined,
  });

  adapter.replace([{ game: "brawl-stars", tag: "#ABC", name: "Player", updatedAt: 1 }]);
  assert.equal(cookies.length, 1);
  assert.match(cookies[0] ?? "", /; Path=\//);
  assert.match(cookies[0] ?? "", /; Secure/);
  assert.match(cookies[0] ?? "", /Domain=\.statsconnect\.app$/);
  assert.equal(adapter.read()[0]?.tag, "ABC");
});

test("game siblings read the apex shared profile cookie and write to the same parent", () => {
  let cookie = "";
  for (const hostname of ["statsconnect.app", "cr.statsconnect.app", "bs.statsconnect.app"]) {
    const adapter = createBrowserConnectedProfilesAdapter({
      hostname, protocol: "https:",
      storage: { getItem: () => null, setItem: () => undefined },
      readCookie: () => cookie, writeCookie: (value) => { cookie = value; },
      subscribeExternal: () => () => undefined, notify: () => undefined,
    });
    if (hostname === "statsconnect.app") adapter.replace([{ game: "clash-royale", tag: "#ABC", name: "Player", updatedAt: 1 }]);
    assert.equal(adapter.read()[0]?.tag, "ABC");
    adapter.replace(adapter.read());
    assert.match(cookie, /; Domain=\.statsconnect\.app$/);
  }
});

test("lookalike and local hosts retain host-only profile cookies", () => {
  for (const hostname of ["localhost", "statsconnect.app.evil", "evil-statsconnect.app", "notstatsconnect.app", "juanquenga.com.evil", "notjuanquenga.com"]) {
    let cookie = "";
    const adapter = createBrowserConnectedProfilesAdapter({
      hostname, protocol: "https:",
      storage: { getItem: () => null, setItem: () => undefined },
      readCookie: () => "", writeCookie: (value) => { cookie = value; },
      subscribeExternal: () => () => undefined, notify: () => undefined,
    });
    adapter.replace([]);
    assert.doesNotMatch(cookie, /Domain=/);
  }
});
