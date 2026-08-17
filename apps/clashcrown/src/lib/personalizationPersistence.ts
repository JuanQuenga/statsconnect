import type { FunctionArgs, FunctionReturnType } from "convex/server";
import {
  readLocalPersonalization,
  replaceLocalDevice,
  writeLocalPersonalization,
  type AlertPreferences,
  type LocalPersonalizationState,
  type ProfileKind,
  type RecentProfile,
  type TrackedProfile,
} from "./recentProfiles.ts";
import type { clashBackend } from "./platformBackend.ts";

const MAX_RECENTS = 12;
const SYNC_UNAVAILABLE_MESSAGE = "Sync requires a configured Convex deployment.";
const SYNC_ERROR_MESSAGE = "Sync failed. The local copy is still available.";

export type ProfileInput = FunctionArgs<typeof clashBackend.personalization.saveProfile>["profile"];
export type ObservationInput = Omit<
  FunctionArgs<typeof clashBackend.personalization.observeProfile>,
  "deviceSecret"
>;
export type PersonalizationAlert = FunctionReturnType<
  typeof clashBackend.personalization.observeProfile
>[number];

export type SyncStatus = "local" | "connecting" | "synced" | "error";

export type SynchronizedPersonalizationState = Pick<
  NonNullable<FunctionReturnType<typeof clashBackend.personalization.getState>>,
  "preferences" | "profiles" | "recents" | "devices"
>;
export type PersonalizationDevice = SynchronizedPersonalizationState["devices"][number];

export type PersonalizationStoreSnapshot = {
  state: LocalPersonalizationState;
  status: SyncStatus;
  devices: PersonalizationDevice[];
  error: string;
  readyForRemoteQuery: boolean;
};

export type PersonalizationCache = {
  read: () => LocalPersonalizationState;
  write: (state: LocalPersonalizationState) => void;
  reset: () => LocalPersonalizationState;
};

export type SharedProfilePersistence = {
  save: (profile: ProfileInput) => void;
  remove: (kind: ProfileKind, tag: string) => void;
};

type RecentInput = FunctionArgs<typeof clashBackend.personalization.recordRecent>["recent"];

export type SynchronizedPersonalizationTransport = {
  ensureAccount: (
    args: FunctionArgs<typeof clashBackend.personalization.ensureAccount>
  ) => Promise<FunctionReturnType<typeof clashBackend.personalization.ensureAccount>>;
  saveProfile: (
    args: FunctionArgs<typeof clashBackend.personalization.saveProfile>
  ) => Promise<FunctionReturnType<typeof clashBackend.personalization.saveProfile>>;
  removeProfile: (
    args: FunctionArgs<typeof clashBackend.personalization.removeProfile>
  ) => Promise<FunctionReturnType<typeof clashBackend.personalization.removeProfile>>;
  setDefaultProfile: (
    args: FunctionArgs<typeof clashBackend.personalization.setDefaultProfile>
  ) => Promise<FunctionReturnType<typeof clashBackend.personalization.setDefaultProfile>>;
  recordRecent: (
    args: FunctionArgs<typeof clashBackend.personalization.recordRecent>
  ) => Promise<FunctionReturnType<typeof clashBackend.personalization.recordRecent>>;
  clearRecents: (
    args: FunctionArgs<typeof clashBackend.personalization.clearRecents>
  ) => Promise<FunctionReturnType<typeof clashBackend.personalization.clearRecents>>;
  updatePreferences: (
    args: FunctionArgs<typeof clashBackend.personalization.updatePreferences>
  ) => Promise<FunctionReturnType<typeof clashBackend.personalization.updatePreferences>>;
  observeProfile: (
    args: FunctionArgs<typeof clashBackend.personalization.observeProfile>
  ) => Promise<FunctionReturnType<typeof clashBackend.personalization.observeProfile>>;
  createPairingCode: (
    args: FunctionArgs<typeof clashBackend.personalization.createPairingCode>
  ) => Promise<FunctionReturnType<typeof clashBackend.personalization.createPairingCode>>;
  redeemPairingCode: (
    args: FunctionArgs<typeof clashBackend.personalization.redeemPairingCode>
  ) => Promise<FunctionReturnType<typeof clashBackend.personalization.redeemPairingCode>>;
  clearAccount: (
    args: FunctionArgs<typeof clashBackend.personalization.clearAccount>
  ) => Promise<FunctionReturnType<typeof clashBackend.personalization.clearAccount>>;
};

export type PersonalizationStore = {
  getSnapshot: () => PersonalizationStoreSnapshot;
  subscribe: (listener: () => void) => () => void;
  track: (profile: ProfileInput) => Promise<void>;
  untrack: (kind: ProfileKind, tag: string) => Promise<void>;
  setDefault: (tag: string | null) => Promise<void>;
  remember: (profile: ProfileInput) => Promise<void>;
  clearRecents: () => void;
  updatePreferences: (preferences: AlertPreferences) => Promise<void>;
  observe: (observation: ObservationInput) => Promise<PersonalizationAlert[]>;
  createPairCode: () => Promise<{ code: string; expiresAt: number }>;
  pairWithCode: (code: string, deviceLabel: string) => Promise<void>;
  clearAll: () => Promise<void>;
};

type AdapterOptions = {
  store?: PersonalizationCache;
  sharedProfiles?: SharedProfilePersistence;
  now?: () => number;
};

const browserStore: PersonalizationCache = {
  read: readLocalPersonalization,
  write: writeLocalPersonalization,
  reset: replaceLocalDevice,
};

const ignoredSharedProfiles: SharedProfilePersistence = {
  save: () => undefined,
  remove: () => undefined,
};

export function normalizeProfileTag(tag: string): string {
  return tag.replace(/^#/, "").trim().toUpperCase();
}

function profileKey(profile: Pick<ProfileInput, "kind" | "tag">): string {
  return `${profile.kind}:${normalizeProfileTag(profile.tag)}`;
}

function normalizeProfile(profile: ProfileInput): ProfileInput {
  return { ...profile, tag: normalizeProfileTag(profile.tag) };
}

function normalizePersistenceState(state: LocalPersonalizationState): LocalPersonalizationState {
  const trackedKeys = new Set<string>();
  let hasDefault = false;
  const profiles = state.profiles.flatMap((profile) => {
    const normalized = { ...profile, tag: normalizeProfileTag(profile.tag) };
    const key = profileKey(normalized);
    if (trackedKeys.has(key)) return [];
    trackedKeys.add(key);
    const isDefault = normalized.kind === "players" && normalized.isDefault && !hasDefault;
    if (isDefault) hasDefault = true;
    return [{ ...normalized, isDefault }];
  });

  const recentKeys = new Set<string>();
  const recents = [...state.recents]
    .sort((left, right) => right.visitedAt - left.visitedAt)
    .flatMap((recent) => {
      const normalized = { ...recent, tag: normalizeProfileTag(recent.tag) };
      const key = profileKey(normalized);
      if (recentKeys.has(key)) return [];
      recentKeys.add(key);
      return [normalized];
    })
    .slice(0, MAX_RECENTS);

  return {
    ...state,
    profiles,
    recents,
    preferences: { ...state.preferences },
  };
}

function withTrackedProfile(
  state: LocalPersonalizationState,
  input: ProfileInput,
  now: number,
): LocalPersonalizationState {
  const profile = normalizeProfile(input);
  const key = profileKey(profile);
  const existing = state.profiles.find((candidate) => profileKey(candidate) === key);
  const profiles = existing
    ? state.profiles.map((candidate) => profileKey(candidate) === key
      ? { ...candidate, ...profile, tag: profile.tag, updatedAt: now }
      : candidate)
    : [{ ...profile, isDefault: false, createdAt: now, updatedAt: now }, ...state.profiles];
  return { ...state, profiles };
}

function withoutTrackedProfile(
  state: LocalPersonalizationState,
  kind: ProfileKind,
  tag: string,
): LocalPersonalizationState {
  const key = profileKey({ kind, tag });
  return { ...state, profiles: state.profiles.filter((profile) => profileKey(profile) !== key) };
}

function withDefaultProfile(state: LocalPersonalizationState, tag: string | null): LocalPersonalizationState {
  const normalizedTag = tag === null ? null : normalizeProfileTag(tag);
  return {
    ...state,
    profiles: state.profiles.map((profile) => ({
      ...profile,
      isDefault: profile.kind === "players" && normalizedTag !== null && profile.tag === normalizedTag,
    })),
  };
}

function withRecentProfile(
  state: LocalPersonalizationState,
  input: ProfileInput,
  visitedAt: number,
): LocalPersonalizationState {
  const recent: RecentProfile = { ...normalizeProfile(input), visitedAt };
  const key = profileKey(recent);
  return {
    ...state,
    recents: [recent, ...state.recents.filter((candidate) => profileKey(candidate) !== key)].slice(0, MAX_RECENTS),
  };
}

abstract class StatefulPersonalizationAdapter implements PersonalizationStore {
  private readonly listeners = new Set<() => void>();
  protected readonly store: PersonalizationCache;
  protected readonly sharedProfiles: SharedProfilePersistence;
  protected readonly now: () => number;
  protected snapshot: PersonalizationStoreSnapshot;

  protected constructor(status: SyncStatus, options: AdapterOptions) {
    this.store = options.store ?? browserStore;
    this.sharedProfiles = options.sharedProfiles ?? ignoredSharedProfiles;
    this.now = options.now ?? Date.now;
    const state = normalizePersistenceState(this.store.read());
    this.store.write(state);
    this.snapshot = {
      state,
      status,
      devices: [],
      error: "",
      readyForRemoteQuery: false,
    };
  }

  readonly getSnapshot = (): PersonalizationStoreSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  protected publish(next: PersonalizationStoreSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  protected persist(state: LocalPersonalizationState): void {
    this.store.write(state);
    this.publish({ ...this.snapshot, state });
  }

  protected resetLocalState(): void {
    const state = this.store.reset();
    this.store.write(state);
    this.publish({ ...this.snapshot, state });
  }

  async track(input: ProfileInput): Promise<void> {
    const profile = normalizeProfile(input);
    if (profile.kind === "players") this.sharedProfiles.save(profile);
    this.persist(withTrackedProfile(this.snapshot.state, profile, this.now()));
    await this.didTrack(profile);
  }

  async untrack(kind: ProfileKind, tag: string): Promise<void> {
    const normalizedTag = normalizeProfileTag(tag);
    if (kind === "players") this.sharedProfiles.remove(kind, normalizedTag);
    this.persist(withoutTrackedProfile(this.snapshot.state, kind, normalizedTag));
    await this.didUntrack(kind, normalizedTag);
  }

  async setDefault(tag: string | null): Promise<void> {
    const normalizedTag = tag === null ? null : normalizeProfileTag(tag);
    this.persist(withDefaultProfile(this.snapshot.state, normalizedTag));
    await this.didSetDefault(normalizedTag);
  }

  async remember(input: ProfileInput): Promise<void> {
    const visitedAt = this.now();
    const profile = normalizeProfile(input);
    this.persist(withRecentProfile(this.snapshot.state, profile, visitedAt));
    await this.didRemember({ ...profile, visitedAt });
  }

  clearRecents(): void {
    this.persist({ ...this.snapshot.state, recents: [] });
    this.didClearRecents();
  }

  async updatePreferences(preferences: AlertPreferences): Promise<void> {
    this.persist({ ...this.snapshot.state, preferences: { ...preferences } });
    await this.didUpdatePreferences(preferences);
  }

  async observe(_observation: ObservationInput): Promise<PersonalizationAlert[]> {
    return [];
  }

  async createPairCode(): Promise<{ code: string; expiresAt: number }> {
    throw new Error(SYNC_UNAVAILABLE_MESSAGE);
  }

  async pairWithCode(_code: string, _deviceLabel: string): Promise<void> {
    throw new Error(SYNC_UNAVAILABLE_MESSAGE);
  }

  async clearAll(): Promise<void> {
    this.resetLocalState();
  }

  protected async didTrack(_profile: ProfileInput): Promise<void> {}
  protected async didUntrack(_kind: ProfileKind, _tag: string): Promise<void> {}
  protected async didSetDefault(_tag: string | null): Promise<void> {}
  protected async didRemember(_recent: RecentInput): Promise<void> {}
  protected didClearRecents(): void {}
  protected async didUpdatePreferences(_preferences: AlertPreferences): Promise<void> {}
}

export class LocalPersonalizationAdapter extends StatefulPersonalizationAdapter {
  constructor(options: AdapterOptions = {}) {
    super("local", options);
  }
}

type SynchronizedAdapterOptions = AdapterOptions & {
  transport: SynchronizedPersonalizationTransport;
  createPairSecret?: () => string;
};

export class SynchronizedPersonalizationAdapter extends StatefulPersonalizationAdapter {
  private readonly transport: SynchronizedPersonalizationTransport;
  private readonly createPairSecret: () => string;
  private connecting: Promise<void> | null = null;
  private connectedDeviceSecret = "";
  private hasRemoteState = false;

  constructor(options: SynchronizedAdapterOptions) {
    super("connecting", options);
    this.transport = options.transport;
    this.createPairSecret = options.createPairSecret ?? randomPairCode;
  }

  connect(deviceLabel: string): Promise<void> {
    const { state } = this.snapshot;
    if (this.connectedDeviceSecret === state.deviceSecret) return Promise.resolve();
    if (this.connecting) return this.connecting;

    this.publish({ ...this.snapshot, status: "connecting", error: "" });
    const deviceSecret = state.deviceSecret;
    this.connecting = this.transport.ensureAccount({
      deviceSecret,
      deviceLabel,
      importedProfiles: state.migratedToSync
        ? []
        : state.profiles.map(({ kind, tag, name, clan }) => ({ kind, tag, name, clan })),
      importedRecents: state.migratedToSync
        ? []
        : state.recents.map(({ kind, tag, name, clan, visitedAt }) => ({ kind, tag, name, clan, visitedAt })),
      importedPreferences: state.preferences,
    }).then(() => {
      if (this.snapshot.state.deviceSecret !== deviceSecret) return;
      const nextState = { ...this.snapshot.state, migratedToSync: true as const };
      this.store.write(nextState);
      this.connectedDeviceSecret = deviceSecret;
      this.publish({
        ...this.snapshot,
        state: nextState,
        status: this.hasRemoteState ? "synced" : "connecting",
        error: "",
        readyForRemoteQuery: true,
      });
    }).catch((caught: unknown) => {
      if (this.snapshot.state.deviceSecret !== deviceSecret) return;
      this.publish({
        ...this.snapshot,
        status: "error",
        error: errorMessage(caught, "Sync is temporarily unavailable. Local changes are still saved."),
        readyForRemoteQuery: true,
      });
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  receiveRemote(state: SynchronizedPersonalizationState): void {
    const localState = normalizePersistenceState({
      ...this.snapshot.state,
      profiles: state.profiles,
      recents: state.recents.slice(0, MAX_RECENTS),
      preferences: state.preferences,
      migratedToSync: true,
    });
    this.hasRemoteState = true;
    this.store.write(localState);
    this.publish({
      ...this.snapshot,
      state: localState,
      status: "synced",
      devices: state.devices,
      error: "",
    });
  }

  override async observe(observation: ObservationInput): Promise<PersonalizationAlert[]> {
    const normalized = { ...observation, tag: normalizeProfileTag(observation.tag) };
    return this.runRemote(() => this.transport.observeProfile({
      deviceSecret: this.snapshot.state.deviceSecret,
      ...normalized,
    }));
  }

  override async createPairCode(): Promise<{ code: string; expiresAt: number }> {
    const codeSecret = this.createPairSecret();
    const result = await this.runRemote(() => this.transport.createPairingCode({
      deviceSecret: this.snapshot.state.deviceSecret,
      codeSecret,
    }));
    return { code: formatPairCode(codeSecret), expiresAt: result.expiresAt };
  }

  override async pairWithCode(code: string, deviceLabel: string): Promise<void> {
    const codeSecret = normalizePairCode(code);
    if (codeSecret.length < 40) throw new Error("Enter the complete pairing code.");
    await this.runRemote(() => this.transport.redeemPairingCode({
      deviceSecret: this.snapshot.state.deviceSecret,
      codeSecret,
      deviceLabel,
    }));
  }

  override async clearAll(): Promise<void> {
    await this.runRemote(() => this.transport.clearAccount({ deviceSecret: this.snapshot.state.deviceSecret }));
    this.connectedDeviceSecret = "";
    this.hasRemoteState = false;
    const state = this.store.reset();
    this.store.write(state);
    this.publish({
      ...this.snapshot,
      state,
      status: "connecting",
      devices: [],
      error: "",
      readyForRemoteQuery: false,
    });
  }

  protected override async didTrack(profile: ProfileInput): Promise<void> {
    await this.runRemote(() => this.transport.saveProfile({
      deviceSecret: this.snapshot.state.deviceSecret,
      profile,
    }));
  }

  protected override async didUntrack(kind: ProfileKind, tag: string): Promise<void> {
    await this.runRemote(() => this.transport.removeProfile({
      deviceSecret: this.snapshot.state.deviceSecret,
      kind,
      tag,
    }));
  }

  protected override async didSetDefault(tag: string | null): Promise<void> {
    await this.runRemote(() => this.transport.setDefaultProfile({
      deviceSecret: this.snapshot.state.deviceSecret,
      tag,
    }));
  }

  protected override async didRemember(recent: RecentInput): Promise<void> {
    await this.runRemote(() => this.transport.recordRecent({
      deviceSecret: this.snapshot.state.deviceSecret,
      recent,
    }));
  }

  protected override didClearRecents(): void {
    void this.runRemote(() => this.transport.clearRecents({
      deviceSecret: this.snapshot.state.deviceSecret,
    })).catch(() => undefined);
  }

  protected override async didUpdatePreferences(preferences: AlertPreferences): Promise<void> {
    await this.runRemote(() => this.transport.updatePreferences({
      deviceSecret: this.snapshot.state.deviceSecret,
      preferences,
    }));
  }

  private async runRemote<Result>(work: () => Promise<Result>): Promise<Result> {
    try {
      const result = await work();
      this.publish({
        ...this.snapshot,
        status: this.hasRemoteState ? "synced" : "connecting",
        error: "",
      });
      return result;
    } catch (caught: unknown) {
      this.publish({
        ...this.snapshot,
        status: "error",
        error: errorMessage(caught, SYNC_ERROR_MESSAGE),
      });
      throw caught;
    }
  }
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

function randomPairCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(26));
  let code = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      code += alphabet[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) code += alphabet[(buffer << (5 - bits)) & 31];
  return code;
}

function formatPairCode(code: string): string {
  return code.match(/.{1,6}/g)?.join("-") ?? code;
}

function normalizePairCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-9]/g, "");
}
