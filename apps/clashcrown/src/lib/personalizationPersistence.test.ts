import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalPersonalizationAdapter,
  SynchronizedPersonalizationAdapter,
  type PersonalizationCache,
  type PersonalizationStore,
  type SynchronizedPersonalizationTransport,
} from "./personalizationPersistence.ts";
import {
  defaultAlertPreferences,
  type LocalPersonalizationState,
} from "./recentProfiles.ts";
import type { Id } from "../../../../packages/backend/convex/_generated/dataModel.ts";

const INITIAL_SECRET = "initial-device-secret-with-at-least-forty-characters";
const RESET_SECRET = "replacement-device-secret-with-at-least-forty-characters";
const ACCOUNT_ID = "test-personal-account" as Id<"clashPersonalAccounts">;

function emptyState(deviceSecret = INITIAL_SECRET): LocalPersonalizationState {
  return {
    deviceSecret,
    migratedToSync: false,
    profiles: [],
    recents: [],
    preferences: { ...defaultAlertPreferences },
  };
}

function memoryStore(): PersonalizationCache {
  let state = emptyState();
  return {
    read: () => state,
    write: (next) => {
      state = next;
    },
    reset: () => {
      state = emptyState(RESET_SECRET);
      return state;
    },
  };
}

function synchronizedTransport(
  overrides: Partial<SynchronizedPersonalizationTransport> = {},
): SynchronizedPersonalizationTransport {
  return {
    ensureAccount: async () => ACCOUNT_ID,
    saveProfile: async () => null,
    removeProfile: async () => null,
    setDefaultProfile: async () => null,
    recordRecent: async () => null,
    clearRecents: async () => null,
    updatePreferences: async () => null,
    observeProfile: async () => [],
    createPairingCode: async () => ({ expiresAt: 1 }),
    redeemPairingCode: async () => ACCOUNT_ID,
    clearAccount: async () => null,
    ...overrides,
  };
}

type AdapterFactory = () => PersonalizationStore;

const adapterFactories: Array<{ name: string; create: AdapterFactory }> = [
  {
    name: "local Adapter",
    create: () => new LocalPersonalizationAdapter({ store: memoryStore(), now: incrementingClock() }),
  },
  {
    name: "synchronized Adapter",
    create: () => new SynchronizedPersonalizationAdapter({
      store: memoryStore(),
      now: incrementingClock(),
      transport: synchronizedTransport(),
    }),
  },
];

for (const factory of adapterFactories) {
  test(`${factory.name} normalizes repeat tracking without losing saved fields`, async () => {
    const adapter = factory.create();

    await adapter.track({ kind: "players", tag: " #abc123 ", name: "First name" });
    await adapter.setDefault("#abc123");
    await adapter.track({ kind: "players", tag: "abc123", name: "Updated name", clan: "Royals" });

    const [profile] = adapter.getSnapshot().state.profiles;
    assert.equal(adapter.getSnapshot().state.profiles.length, 1);
    assert.deepEqual(profile, {
      kind: "players",
      tag: "ABC123",
      name: "Updated name",
      clan: "Royals",
      isDefault: true,
      createdAt: 1,
      updatedAt: 2,
    });

    await adapter.untrack("players", "#abc123");
    assert.deepEqual(adapter.getSnapshot().state.profiles, []);
  });

  test(`${factory.name} keeps exactly one default player`, async () => {
    const adapter = factory.create();
    await adapter.track({ kind: "players", tag: "ONE", name: "One" });
    await adapter.track({ kind: "players", tag: "TWO", name: "Two" });
    await adapter.track({ kind: "clans", tag: "CLAN", name: "Clan" });

    await adapter.setDefault("#two");
    assert.deepEqual(
      adapter.getSnapshot().state.profiles.filter((profile) => profile.isDefault).map((profile) => profile.tag),
      ["TWO"],
    );

    await adapter.setDefault(null);
    assert.equal(adapter.getSnapshot().state.profiles.some((profile) => profile.isDefault), false);
  });

  test(`${factory.name} deduplicates and caps recent profiles`, async () => {
    const adapter = factory.create();
    for (let index = 0; index < 13; index += 1) {
      await adapter.remember({ kind: "players", tag: `TAG${index}`, name: `Player ${index}` });
    }
    await adapter.remember({ kind: "players", tag: "#tag5", name: "Player Five" });

    const recents = adapter.getSnapshot().state.recents;
    assert.equal(recents.length, 12);
    assert.equal(recents[0]?.tag, "TAG5");
    assert.equal(recents[0]?.name, "Player Five");
    assert.equal(recents.filter((profile) => profile.tag === "TAG5").length, 1);
    assert.equal(recents.some((profile) => profile.tag === "TAG0"), false);

    adapter.clearRecents();
    assert.deepEqual(adapter.getSnapshot().state.recents, []);
  });

  test(`${factory.name} persists preferences and resets all personalization`, async () => {
    const adapter = factory.create();
    await adapter.track({ kind: "players", tag: "ABC", name: "Player" });
    await adapter.updatePreferences({ chestAlerts: true, progressionAlerts: true, warAlerts: false });

    assert.deepEqual(adapter.getSnapshot().state.preferences, {
      chestAlerts: true,
      progressionAlerts: true,
      warAlerts: false,
    });

    await adapter.clearAll();
    assert.deepEqual(adapter.getSnapshot().state, emptyState(RESET_SECRET));
  });
}

test("synchronized Adapter imports once, then accepts the synchronized record", async () => {
  const importedProfiles: string[][] = [];
  const adapter = new SynchronizedPersonalizationAdapter({
    store: memoryStore(),
    transport: synchronizedTransport({
      ensureAccount: async ({ importedProfiles: profiles }) => {
        importedProfiles.push(profiles.map((profile) => profile.tag));
        return ACCOUNT_ID;
      },
    }),
  });
  await adapter.track({ kind: "players", tag: "#local", name: "Local" });
  await adapter.connect("Test browser");

  assert.deepEqual(importedProfiles, [["LOCAL"]]);
  assert.equal(adapter.getSnapshot().state.migratedToSync, true);
  assert.equal(adapter.getSnapshot().readyForRemoteQuery, true);

  adapter.receiveRemote({
    profiles: [{
      kind: "players",
      tag: "REMOTE",
      name: "Remote",
      clan: undefined,
      isDefault: true,
      createdAt: 10,
      updatedAt: 11,
    }],
    recents: [],
    preferences: { chestAlerts: true, progressionAlerts: false, warAlerts: false },
    devices: [{ label: "Test browser", createdAt: 1, lastSeenAt: 2 }],
  });

  assert.equal(adapter.getSnapshot().status, "synced");
  assert.equal(adapter.getSnapshot().state.profiles[0]?.tag, "REMOTE");
  assert.equal(adapter.getSnapshot().devices[0]?.label, "Test browser");
});

test("synchronized Adapter keeps the local profile when remote saving fails", async () => {
  const adapter = new SynchronizedPersonalizationAdapter({
    store: memoryStore(),
    transport: synchronizedTransport({
      saveProfile: async () => {
        throw new Error("Remote unavailable");
      },
    }),
  });

  await assert.rejects(
    adapter.track({ kind: "players", tag: "#abc", name: "Player" }),
    /Remote unavailable/,
  );
  assert.equal(adapter.getSnapshot().state.profiles[0]?.tag, "ABC");
  assert.equal(adapter.getSnapshot().status, "error");
  assert.equal(adapter.getSnapshot().error, "Remote unavailable");
});

test("synchronized Adapter formats pairing codes without changing their persisted secret", async () => {
  const secret = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789ABCDEFGHJK";
  let createdSecret = "";
  let redeemedSecret = "";
  const adapter = new SynchronizedPersonalizationAdapter({
    store: memoryStore(),
    createPairSecret: () => secret,
    transport: synchronizedTransport({
      createPairingCode: async ({ codeSecret }) => {
        createdSecret = codeSecret;
        return { expiresAt: 100 };
      },
      redeemPairingCode: async ({ codeSecret }) => {
        redeemedSecret = codeSecret;
        return ACCOUNT_ID;
      },
    }),
  });

  const pairing = await adapter.createPairCode();
  await adapter.pairWithCode(pairing.code, "Second browser");

  assert.equal(createdSecret, secret);
  assert.equal(redeemedSecret, secret);
  assert.equal(pairing.code.replaceAll("-", ""), secret);
});

function incrementingClock(): () => number {
  let value = 0;
  return () => {
    value += 1;
    return value;
  };
}
