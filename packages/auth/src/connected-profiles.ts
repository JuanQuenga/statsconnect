export type ConnectedProfileGame = "brawl-stars" | "clash-royale";

export type ConnectedProfile = {
  game: ConnectedProfileGame;
  tag: string;
  name: string;
};

export type PersistedConnectedProfile = ConnectedProfile & {
  updatedAt: number;
};

export type ConnectedProfilesStatus = "guest" | "reconciling" | "synced" | "error";

export type ConnectedProfilesSnapshot = {
  profiles: readonly ConnectedProfile[];
  status: ConnectedProfilesStatus;
  error: string | null;
};

export type ConnectedProfileAccountSnapshot = {
  userId: string;
  profiles: readonly PersistedConnectedProfile[];
};

export type BrowserConnectedProfilesAdapter = {
  read: () => readonly PersistedConnectedProfile[];
  replace: (profiles: readonly PersistedConnectedProfile[]) => void;
  subscribe: (listener: () => void) => () => void;
};

export type AccountConnectedProfilesAdapter = {
  merge: (profiles: readonly ConnectedProfile[]) => Promise<void>;
  save: (profile: ConnectedProfile) => Promise<void>;
  remove: (game: ConnectedProfileGame, tag: string) => Promise<void>;
};

export type ConnectedProfilesModule = {
  getSnapshot: () => ConnectedProfilesSnapshot;
  subscribe: (listener: () => void) => () => void;
  reconcileAccount: (account: ConnectedProfileAccountSnapshot | null) => Promise<void>;
  save: (profile: ConnectedProfile) => Promise<void>;
  remove: (game: ConnectedProfileGame, tag: string) => Promise<void>;
  signOut: () => void;
  dispose: () => void;
};

const MAX_PROFILES_PER_GAME = 8;

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Connected profiles could not be synchronized.";
}

export function normalizeConnectedProfile(
  profile: ConnectedProfile,
  updatedAt: number,
): PersistedConnectedProfile | null {
  const tag = profile.tag.trim().replace(/^#/, "").toUpperCase().slice(0, 24);
  const name = profile.name
    .replace(/<\/?c(?:[0-9a-f]{1,8})?>/gi, "")
    .trim()
    .slice(0, 48);
  return tag && name ? { game: profile.game, tag, name, updatedAt } : null;
}

function keyOf(profile: Pick<ConnectedProfile, "game" | "tag">): string {
  return `${profile.game}:${profile.tag.trim().replace(/^#/, "").toUpperCase()}`;
}

export function mergeConnectedProfiles(
  ...groups: ReadonlyArray<readonly PersistedConnectedProfile[]>
): PersistedConnectedProfile[] {
  const merged = new Map<string, PersistedConnectedProfile>();
  for (const group of groups) {
    for (const candidate of group) {
      const profile = normalizeConnectedProfile(candidate, candidate.updatedAt);
      if (!profile) continue;
      const key = keyOf(profile);
      const current = merged.get(key);
      if (!current || profile.updatedAt > current.updatedAt) merged.set(key, profile);
    }
  }

  const counts: Record<ConnectedProfileGame, number> = {
    "brawl-stars": 0,
    "clash-royale": 0,
  };
  return [...merged.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .filter((profile) => {
      if (counts[profile.game] >= MAX_PROFILES_PER_GAME) return false;
      counts[profile.game] += 1;
      return true;
    });
}

function publicProfiles(
  profiles: readonly PersistedConnectedProfile[],
): readonly ConnectedProfile[] {
  return profiles.map(publicProfile);
}

function publicProfile(
  profile: PersistedConnectedProfile,
): ConnectedProfile {
  return { game: profile.game, name: profile.name, tag: profile.tag };
}

export function createConnectedProfilesModule({
  account,
  browser,
  now = Date.now,
}: {
  account: AccountConnectedProfilesAdapter;
  browser: BrowserConnectedProfilesAdapter;
  now?: () => number;
}): ConnectedProfilesModule {
  let profiles = mergeConnectedProfiles(browser.read());
  let accountUserId: string | null = null;
  let migratedUserId: string | null = null;
  let status: ConnectedProfilesStatus = "guest";
  let syncError: string | null = null;
  let writingBrowser = false;
  const pendingSaves = new Map<string, PersistedConnectedProfile>();
  const pendingRemovals = new Set<string>();
  const listeners = new Set<() => void>();
  let currentSnapshot: ConnectedProfilesSnapshot = {
    profiles: publicProfiles(profiles),
    status,
    error: syncError,
  };

  function snapshot(): ConnectedProfilesSnapshot {
    return currentSnapshot;
  }

  function notify(): void {
    currentSnapshot = { profiles: publicProfiles(profiles), status, error: syncError };
    for (const listener of listeners) listener();
  }

  function replaceBrowser(next: readonly PersistedConnectedProfile[]): void {
    profiles = mergeConnectedProfiles(next);
    writingBrowser = true;
    try {
      browser.replace(profiles);
    } finally {
      writingBrowser = false;
    }
    notify();
  }

  function markError(error: unknown): void {
    status = "error";
    syncError = errorMessage(error);
    notify();
  }

  async function persistExternalChange(
    previous: readonly PersistedConnectedProfile[],
    next: readonly PersistedConnectedProfile[],
  ): Promise<void> {
    if (!accountUserId) return;
    const previousByKey = new Map(previous.map((profile) => [keyOf(profile), profile]));
    const nextByKey = new Map(next.map((profile) => [keyOf(profile), profile]));
    const removedKeys = [...previousByKey.keys()].filter((key) => !nextByKey.has(key));
    // External snapshots carry no revision marker, so a shrunken list cannot
    // prove it is newer than local state. Refuse to relay deletions while
    // unsynced local additions are queued, and treat a fully emptied snapshot
    // as unverifiable: legitimate empties arrive through sign-out and account
    // reconciliation instead. Preserved profiles are republished to browser
    // storage and the next trusted account snapshot repairs any drift.
    const distrustRemovals = removedKeys.length > 0
      && (pendingSaves.size > 0 || next.length === 0);
    const effectiveNext = distrustRemovals
      ? mergeConnectedProfiles(next, previous, [...pendingSaves.values()])
      : next;
    if (distrustRemovals) replaceBrowser(effectiveNext);

    const effectiveByKey = new Map(effectiveNext.map((profile) => [keyOf(profile), profile]));
    const work: Promise<void>[] = [];

    for (const [key, profile] of effectiveByKey) {
      const before = previousByKey.get(key);
      if (before?.name === profile.name) continue;
      pendingRemovals.delete(key);
      pendingSaves.set(key, profile);
      work.push(account.save(publicProfile(profile)));
    }
    for (const [key, profile] of previousByKey) {
      if (effectiveByKey.has(key)) continue;
      pendingSaves.delete(key);
      pendingRemovals.add(key);
      work.push(account.remove(profile.game, profile.tag));
    }

    if (work.length === 0) return;
    status = "reconciling";
    syncError = null;
    notify();
    try {
      await Promise.all(work);
      status = "synced";
      notify();
    } catch (error) {
      markError(error);
    }
  }

  const unsubscribeBrowser = browser.subscribe(() => {
    if (writingBrowser) return;
    const previous = profiles;
    const next = mergeConnectedProfiles(browser.read());
    profiles = next;
    notify();
    void persistExternalChange(previous, next);
  });

  async function reconcileAccount(
    accountSnapshot: ConnectedProfileAccountSnapshot | null,
  ): Promise<void> {
    if (!accountSnapshot) {
      accountUserId = null;
      migratedUserId = null;
      pendingSaves.clear();
      pendingRemovals.clear();
      status = "guest";
      syncError = null;
      profiles = mergeConnectedProfiles(browser.read());
      notify();
      return;
    }

    accountUserId = accountSnapshot.userId;
    if (migratedUserId !== accountSnapshot.userId) {
      const merged = mergeConnectedProfiles(accountSnapshot.profiles, profiles);
      replaceBrowser(merged);
      status = "reconciling";
      syncError = null;
      notify();
      try {
        await account.merge(publicProfiles(merged));
        migratedUserId = accountSnapshot.userId;
        pendingSaves.clear();
        pendingRemovals.clear();
        status = "synced";
        notify();
      } catch (error) {
        migratedUserId = null;
        markError(error);
      }
      return;
    }

    const accountByKey = new Map(accountSnapshot.profiles.map((profile) => [keyOf(profile), profile]));
    for (const [key, pending] of pendingSaves) {
      const stored = accountByKey.get(key);
      if (stored?.name === pending.name) pendingSaves.delete(key);
    }
    for (const key of pendingRemovals) {
      if (!accountByKey.has(key)) pendingRemovals.delete(key);
    }

    const visibleAccountProfiles = accountSnapshot.profiles.filter(
      (profile) => !pendingRemovals.has(keyOf(profile)),
    );
    replaceBrowser(mergeConnectedProfiles(visibleAccountProfiles, [...pendingSaves.values()]));
    if (status !== "error") status = "synced";
    notify();
  }

  async function save(profileInput: ConnectedProfile): Promise<void> {
    const profile = normalizeConnectedProfile(profileInput, now());
    if (!profile) throw new Error("A connected profile requires a player tag and name.");
    const key = keyOf(profile);
    pendingRemovals.delete(key);
    pendingSaves.set(key, profile);
    replaceBrowser(mergeConnectedProfiles([profile], profiles));
    if (!accountUserId) return;

    status = "reconciling";
    syncError = null;
    notify();
    try {
      await account.save(publicProfile(profile));
      status = "synced";
      notify();
    } catch (error) {
      markError(error);
      throw error;
    }
  }

  async function remove(game: ConnectedProfileGame, tag: string): Promise<void> {
    const key = keyOf({ game, tag });
    const existing = profiles.find((profile) => keyOf(profile) === key);
    pendingSaves.delete(key);
    pendingRemovals.add(key);
    replaceBrowser(profiles.filter((profile) => keyOf(profile) !== key));
    if (!accountUserId || !existing) return;

    status = "reconciling";
    syncError = null;
    notify();
    try {
      await account.remove(game, existing.tag);
      status = "synced";
      notify();
    } catch (error) {
      markError(error);
      throw error;
    }
  }

  return {
    getSnapshot: snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reconcileAccount,
    save,
    remove,
    signOut: () => {
      accountUserId = null;
      migratedUserId = null;
      pendingSaves.clear();
      pendingRemovals.clear();
      status = "guest";
      syncError = null;
      replaceBrowser([]);
    },
    dispose: unsubscribeBrowser,
  };
}
