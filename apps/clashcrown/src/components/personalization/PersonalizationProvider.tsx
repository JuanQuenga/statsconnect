import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { removeSharedProfile, saveSharedProfile } from "@statsconnect/site-nav";
import {
  clearPersonalAccountMutation,
  clearPersonalRecentsMutation,
  createPairingCodeMutation,
  ensurePersonalAccountMutation,
  observePersonalProfileMutation,
  personalStateQuery,
  recordPersonalRecentMutation,
  redeemPairingCodeMutation,
  removePersonalProfileMutation,
  savePersonalProfileMutation,
  setDefaultPersonalProfileMutation,
  updatePersonalPreferencesMutation,
} from "@/lib/convex";
import { isConvexConfigured } from "@/lib/convex";
import {
  LocalPersonalizationAdapter,
  SynchronizedPersonalizationAdapter,
  type ObservationInput,
  type PersonalizationAlert,
  type PersonalizationDevice,
  type PersonalizationStore,
  type ProfileInput,
  type SynchronizedPersonalizationTransport,
  type SyncStatus,
} from "@/lib/personalizationPersistence";
import type {
  AlertPreferences,
  ProfileKind,
  RecentProfile,
  TrackedProfile,
} from "@/lib/recentProfiles";

export type { ObservationInput, ProfileInput } from "@/lib/personalizationPersistence";

type PersonalizationContextValue = {
  status: SyncStatus;
  profiles: TrackedProfile[];
  recents: RecentProfile[];
  preferences: AlertPreferences;
  devices: PersonalizationDevice[];
  error: string;
  notificationPermission: NotificationPermission | "unsupported";
  track: (profile: ProfileInput) => Promise<void>;
  untrack: (kind: ProfileKind, tag: string) => Promise<void>;
  setDefault: (tag: string | null) => Promise<void>;
  remember: (profile: ProfileInput) => Promise<void>;
  clearRecents: () => void;
  updatePreferences: (preferences: AlertPreferences) => Promise<void>;
  requestNotifications: () => Promise<NotificationPermission | "unsupported">;
  observe: (observation: ObservationInput) => Promise<void>;
  createPairCode: () => Promise<{ code: string; expiresAt: number }>;
  pairWithCode: (code: string) => Promise<void>;
  exportData: () => void;
  clearAll: () => Promise<void>;
};

const PersonalizationContext = createContext<PersonalizationContextValue | null>(null);

const sharedProfiles = {
  save: (profile: ProfileInput) => {
    if (profile.kind === "players") {
      saveSharedProfile({ game: "clash-royale", tag: profile.tag, name: profile.name });
    }
  },
  remove: (kind: ProfileKind, tag: string) => {
    if (kind === "players") removeSharedProfile("clash-royale", tag);
  },
};

function deviceLabel(): string {
  if (typeof navigator === "undefined") return "Browser";
  const platform = navigator.platform || "Browser";
  return `${platform} browser`.slice(0, 60);
}

function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function downloadJson(payload: object): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `clashcrown-personalization-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(href);
}

function showNotifications(alerts: PersonalizationAlert[]): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  for (const alert of alerts) {
    new Notification(alert.title, { body: alert.body, tag: `clashcrown-${alert.type}` });
  }
}

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  return isConvexConfigured ? <SynchronizedProvider>{children}</SynchronizedProvider> : <LocalProvider>{children}</LocalProvider>;
}

function LocalProvider({ children }: { children: ReactNode }) {
  const [adapter] = useState(() => new LocalPersonalizationAdapter({ sharedProfiles }));
  return <AdapterProvider adapter={adapter}>{children}</AdapterProvider>;
}

function SynchronizedProvider({ children }: { children: ReactNode }) {
  const ensureAccount = useMutation(ensurePersonalAccountMutation);
  const saveProfile = useMutation(savePersonalProfileMutation);
  const removeProfile = useMutation(removePersonalProfileMutation);
  const saveDefault = useMutation(setDefaultPersonalProfileMutation);
  const saveRecent = useMutation(recordPersonalRecentMutation);
  const clearRemoteRecents = useMutation(clearPersonalRecentsMutation);
  const savePreferences = useMutation(updatePersonalPreferencesMutation);
  const saveObservation = useMutation(observePersonalProfileMutation);
  const createCode = useMutation(createPairingCodeMutation);
  const redeemCode = useMutation(redeemPairingCodeMutation);
  const clearAccount = useMutation(clearPersonalAccountMutation);

  const [adapter] = useState(() => {
    const transport: SynchronizedPersonalizationTransport = {
      ensureAccount,
      saveProfile,
      removeProfile,
      setDefaultProfile: saveDefault,
      recordRecent: saveRecent,
      clearRecents: clearRemoteRecents,
      updatePreferences: savePreferences,
      observeProfile: saveObservation,
      createPairingCode: createCode,
      redeemPairingCode: redeemCode,
      clearAccount,
    };
    return new SynchronizedPersonalizationAdapter({ transport, sharedProfiles });
  });
  const snapshot = useAdapterSnapshot(adapter);
  const remote = useQuery(
    personalStateQuery,
    snapshot.readyForRemoteQuery ? { deviceSecret: snapshot.state.deviceSecret } : "skip",
  );

  useEffect(() => {
    void adapter.connect(deviceLabel());
  }, [adapter, snapshot.state.deviceSecret]);

  useEffect(() => {
    if (remote) adapter.receiveRemote(remote);
  }, [adapter, remote]);

  return <AdapterProvider adapter={adapter}>{children}</AdapterProvider>;
}

function AdapterProvider({
  adapter,
  children,
}: {
  adapter: PersonalizationStore;
  children: ReactNode;
}) {
  const snapshot = useAdapterSnapshot(adapter);
  const [permission, setPermission] = useState(notificationPermission);
  const { state } = snapshot;

  const value = useMemo<PersonalizationContextValue>(() => ({
    status: snapshot.status,
    profiles: state.profiles,
    recents: state.recents,
    preferences: state.preferences,
    devices: snapshot.devices,
    error: snapshot.error,
    notificationPermission: permission,
    track: adapter.track.bind(adapter),
    untrack: adapter.untrack.bind(adapter),
    setDefault: adapter.setDefault.bind(adapter),
    remember: adapter.remember.bind(adapter),
    clearRecents: adapter.clearRecents.bind(adapter),
    updatePreferences: adapter.updatePreferences.bind(adapter),
    requestNotifications: async () => {
      if (typeof Notification === "undefined") return "unsupported";
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    },
    observe: async (observation) => {
      showNotifications(await adapter.observe(observation));
    },
    createPairCode: adapter.createPairCode.bind(adapter),
    pairWithCode: (code) => adapter.pairWithCode(code, deviceLabel()),
    exportData: () => downloadJson({
      exportedAt: new Date().toISOString(),
      sync: snapshot.status === "local" ? "local-only" : "paired-capability",
      profiles: state.profiles,
      recents: state.recents,
      preferences: state.preferences,
      ...(snapshot.status === "local" ? {} : { devices: snapshot.devices }),
    }),
    clearAll: adapter.clearAll.bind(adapter),
  }), [adapter, permission, snapshot, state]);

  return <PersonalizationContext.Provider value={value}>{children}</PersonalizationContext.Provider>;
}

function useAdapterSnapshot(adapter: PersonalizationStore) {
  return useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
}

export function usePersonalization() {
  const value = useContext(PersonalizationContext);
  if (!value) throw new Error("usePersonalization must be used inside PersonalizationProvider.");
  return value;
}
