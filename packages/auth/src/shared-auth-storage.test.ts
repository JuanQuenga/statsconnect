import assert from "node:assert/strict";
import test from "node:test";

import { createSharedAuthStorage } from "./shared-auth-storage.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

test("shared auth storage migrates a legacy local value into a parent-domain cookie", () => {
  let cookie = "";
  const writes: string[] = [];
  const storage = createSharedAuthStorage({
    hostname: "stats.juanquenga.com",
    protocol: "https:",
    readCookie: () => cookie,
    writeCookie: (value) => {
      writes.push(value);
      cookie = value.split(";", 1)[0] ?? "";
    },
    legacyStorage: memoryStorage({ "better-auth_cookie": "session-json" }),
  });

  assert.equal(storage.getItem("better-auth_cookie"), "session-json");
  assert.match(writes[0] ?? "", /^better-auth_cookie=session-json;/);
  assert.match(writes[0] ?? "", /Domain=\.juanquenga\.com/);
  assert.match(writes[0] ?? "", /Max-Age=2592000;/);
  assert.doesNotMatch(writes[0] ?? "", /Max-Age=31536000/);
  assert.match(writes[0] ?? "", /SameSite=Lax/);
  assert.match(writes[0] ?? "", /; Secure$/);
});

test("shared auth storage prefers a session already written by another subdomain", () => {
  const storage = createSharedAuthStorage({
    hostname: "brawlstats.juanquenga.com",
    protocol: "https:",
    readCookie: () => `better-auth_cookie=${encodeURIComponent("shared-session")}`,
    writeCookie: () => undefined,
    legacyStorage: memoryStorage({ "better-auth_cookie": "local-session" }),
  });

  assert.equal(storage.getItem("better-auth_cookie"), "shared-session");
});

test("non-production hosts retain ordinary local storage", () => {
  const legacyStorage = memoryStorage({ key: "local" });
  const storage = createSharedAuthStorage({
    hostname: "localhost",
    protocol: "http:",
    readCookie: () => "",
    writeCookie: () => undefined,
    legacyStorage,
  });

  assert.equal(storage, legacyStorage);
});

test("statsconnect.app migrates apex local auth into a cookie readable by both game hosts", () => {
  const localStorage = memoryStorage({ "better-auth_cookie": "session-json" });
  let cookie = "";
  const storage = createSharedAuthStorage({
    hostname: "statsconnect.app",
    protocol: "https:",
    readCookie: () => cookie,
    writeCookie: (value) => { cookie = value; },
    legacyStorage: localStorage,
  });

  assert.equal(storage.getItem("better-auth_cookie"), "session-json");
  assert.match(cookie, /; Domain=\.statsconnect\.app;/);
  assert.match(cookie, /; Path=\/;/);
  assert.match(cookie, /; SameSite=Lax; Secure$/);
  for (const hostname of ["cr.statsconnect.app", "bs.statsconnect.app"]) {
    const sibling = createSharedAuthStorage({
      hostname, protocol: "https:", readCookie: () => cookie,
      writeCookie: () => assert.fail("Existing shared auth should not be rewritten"),
      legacyStorage: memoryStorage({ "better-auth_cookie": "stale-local" }),
    });
    assert.equal(sibling.getItem("better-auth_cookie"), "session-json");
  }
});

test("all production hosts write into their exact parent domain", () => {
  for (const hostname of ["statsconnect.app", "cr.statsconnect.app", "bs.statsconnect.app", "juanquenga.com", "stats.juanquenga.com"]) {
    let cookie = "";
    createSharedAuthStorage({ hostname, protocol: "https:", readCookie: () => "", writeCookie: (value) => { cookie = value; }, legacyStorage: memoryStorage() }).setItem("session", "new");
    assert.ok(cookie.includes(`Domain=.${hostname.endsWith("statsconnect.app") ? "statsconnect.app" : "juanquenga.com"};`));
  }
});

test("lookalike hosts cannot opt into either shared auth domain", () => {
  for (const hostname of ["statsconnect.app.evil", "evil-statsconnect.app", "notstatsconnect.app", "juanquenga.com.evil", "notjuanquenga.com"]) {
    const legacyStorage = memoryStorage();
    const storage = createSharedAuthStorage({ hostname, protocol: "https:", readCookie: () => "", writeCookie: () => assert.fail(hostname), legacyStorage });
    assert.equal(storage, legacyStorage);
  }
});
