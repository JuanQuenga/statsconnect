import assert from "node:assert/strict";
import test from "node:test";
import {
  createConnectedProfilesModule,
  type AccountConnectedProfilesAdapter,
  type BrowserConnectedProfilesAdapter,
  type ConnectedProfile,
  type PersistedConnectedProfile,
} from "./connected-profiles.ts";

function browserAdapter(initial: readonly PersistedConnectedProfile[] = []) {
  let profiles = [...initial];
  const listeners = new Set<() => void>();
  const adapter: BrowserConnectedProfilesAdapter = {
    read: () => profiles,
    replace: (next) => {
      profiles = [...next];
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    adapter,
    externalReplace: (next: readonly PersistedConnectedProfile[]) => adapter.replace(next),
    read: () => profiles,
  };
}

function accountAdapter({
  failMerge = false,
  failSave = false,
  failRemove = false,
}: {
  failMerge?: boolean;
  failSave?: boolean;
  failRemove?: boolean;
} = {}) {
  const merged: ConnectedProfile[][] = [];
  const saved: ConnectedProfile[] = [];
  const removed: Array<{ game: ConnectedProfile["game"]; tag: string }> = [];
  const adapter: AccountConnectedProfilesAdapter = {
    merge: async (profiles) => {
      merged.push([...profiles]);
      if (failMerge) throw new Error("account merge failed");
    },
    save: async (profile) => {
      saved.push(profile);
      if (failSave) throw new Error("account save failed");
    },
    remove: async (game, tag) => {
      removed.push({ game, tag });
      if (failRemove) throw new Error("account remove failed");
    },
  };
  return { adapter, merged, saved, removed };
}

test("guest save persists and publishes normalized profile state through the Interface", async () => {
  const browser = browserAdapter();
  const account = accountAdapter();
  const profiles = createConnectedProfilesModule({
    account: account.adapter,
    browser: browser.adapter,
    now: () => 42,
  });

  await profiles.save({ game: "brawl-stars", tag: "#abc", name: " <c2>Harmiox</c> " });

  assert.deepEqual(profiles.getSnapshot(), {
    profiles: [{ game: "brawl-stars", tag: "ABC", name: "Harmiox" }],
    status: "guest",
    error: null,
  });
  assert.equal(browser.read()[0]?.updatedAt, 42);
  assert.deepEqual(account.saved, []);
  profiles.dispose();
});

test("sign-in merges guest and account profiles once and keeps the newest duplicate", async () => {
  const browser = browserAdapter([
    { game: "brawl-stars", tag: "ABC", name: "Guest name", updatedAt: 20 },
  ]);
  const account = accountAdapter();
  const profiles = createConnectedProfilesModule({ account: account.adapter, browser: browser.adapter });

  await profiles.reconcileAccount({
    userId: "user-1",
    profiles: [
      { game: "brawl-stars", tag: "ABC", name: "Old account name", updatedAt: 10 },
      { game: "clash-royale", tag: "XYZ", name: "Linda", updatedAt: 30 },
    ],
  });

  assert.deepEqual(account.merged, [[
    { game: "clash-royale", tag: "XYZ", name: "Linda" },
    { game: "brawl-stars", tag: "ABC", name: "Guest name" },
  ]]);
  assert.equal(profiles.getSnapshot().status, "synced");
  assert.deepEqual(profiles.getSnapshot().profiles, account.merged[0]);
  profiles.dispose();
});

test("signed-in save and remove synchronize account persistence through the Interface", async () => {
  const browser = browserAdapter();
  const account = accountAdapter();
  const profiles = createConnectedProfilesModule({
    account: account.adapter,
    browser: browser.adapter,
    now: () => 50,
  });
  await profiles.reconcileAccount({ userId: "user-1", profiles: [] });

  await profiles.save({ game: "clash-royale", tag: "#P0Y", name: "Juan" });
  await profiles.remove("clash-royale", "p0y");

  assert.deepEqual(account.saved, [{ game: "clash-royale", tag: "P0Y", name: "Juan" }]);
  assert.deepEqual(account.removed, [{ game: "clash-royale", tag: "P0Y" }]);
  assert.deepEqual(profiles.getSnapshot().profiles, []);
  profiles.dispose();
});

test("browser changes from another app synchronize through the account Adapter", async () => {
  const browser = browserAdapter();
  const account = accountAdapter();
  const profiles = createConnectedProfilesModule({ account: account.adapter, browser: browser.adapter });
  await profiles.reconcileAccount({ userId: "user-1", profiles: [] });

  browser.externalReplace([
    { game: "brawl-stars", tag: "Q2L", name: "Steve", updatedAt: 80 },
  ]);
  await Promise.resolve();

  assert.deepEqual(account.saved, [{ game: "brawl-stars", tag: "Q2L", name: "Steve" }]);
  assert.deepEqual(profiles.getSnapshot().profiles, [
    { game: "brawl-stars", tag: "Q2L", name: "Steve" },
  ]);
  profiles.dispose();
});

test("sign-out clears account profiles from browser and returns to guest state", async () => {
  const browser = browserAdapter();
  const account = accountAdapter();
  const profiles = createConnectedProfilesModule({ account: account.adapter, browser: browser.adapter });
  await profiles.reconcileAccount({
    userId: "user-1",
    profiles: [{ game: "brawl-stars", tag: "ABC", name: "Harmiox", updatedAt: 10 }],
  });

  profiles.signOut();

  assert.deepEqual(profiles.getSnapshot(), { profiles: [], status: "guest", error: null });
  assert.deepEqual(browser.read(), []);
  profiles.dispose();
});

test("failed sign-in merge retains the complete local result and reports the error", async () => {
  const browser = browserAdapter([
    { game: "brawl-stars", tag: "ABC", name: "Guest", updatedAt: 10 },
  ]);
  const account = accountAdapter({ failMerge: true });
  const profiles = createConnectedProfilesModule({ account: account.adapter, browser: browser.adapter });

  await profiles.reconcileAccount({
    userId: "user-1",
    profiles: [{ game: "clash-royale", tag: "P0Y", name: "Account", updatedAt: 20 }],
  });

  assert.deepEqual(profiles.getSnapshot(), {
    profiles: [
      { game: "clash-royale", tag: "P0Y", name: "Account" },
      { game: "brawl-stars", tag: "ABC", name: "Guest" },
    ],
    status: "error",
    error: "account merge failed",
  });
  assert.equal(account.merged.length, 1);
  profiles.dispose();
});

test("failed account save keeps the guest-visible update and reports the failure", async () => {
  const browser = browserAdapter();
  const account = accountAdapter({ failSave: true });
  const profiles = createConnectedProfilesModule({ account: account.adapter, browser: browser.adapter });
  await profiles.reconcileAccount({ userId: "user-1", profiles: [] });

  await assert.rejects(
    profiles.save({ game: "brawl-stars", tag: "ABC", name: "Harmiox" }),
    /account save failed/,
  );

  assert.deepEqual(profiles.getSnapshot().profiles, [
    { game: "brawl-stars", tag: "ABC", name: "Harmiox" },
  ]);
  assert.equal(profiles.getSnapshot().status, "error");
  assert.equal(profiles.getSnapshot().error, "account save failed");
  profiles.dispose();
});

test("failed account remove keeps the profile removed locally and reports the failure", async () => {
  const browser = browserAdapter();
  const account = accountAdapter({ failRemove: true });
  const profiles = createConnectedProfilesModule({ account: account.adapter, browser: browser.adapter });
  await profiles.reconcileAccount({
    userId: "user-1",
    profiles: [{ game: "clash-royale", tag: "P0Y", name: "Juan", updatedAt: 10 }],
  });

  await assert.rejects(
    profiles.remove("clash-royale", "P0Y"),
    /account remove failed/,
  );

  assert.deepEqual(profiles.getSnapshot().profiles, []);
  assert.equal(profiles.getSnapshot().status, "error");
  assert.equal(profiles.getSnapshot().error, "account remove failed");
  profiles.dispose();
});
