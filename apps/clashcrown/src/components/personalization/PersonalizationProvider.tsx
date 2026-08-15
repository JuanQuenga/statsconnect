import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
  type PersonalAlert,
} from "@/lib/convex";
import { isConvexConfigured } from "@/lib/convex";
import {
  readLocalPersonalization,
  replaceLocalDevice,
  writeLocalPersonalization,
  type AlertPreferences,
  type LocalPersonalizationState,
  type ProfileKind,
  type RecentProfile,
  type TrackedProfile,
} from "@/lib/recentProfiles";

export type ProfileInput = Pick<TrackedProfile, "kind" | "tag" | "name" | "clan">;

export type ObservationInput = ProfileInput & {
  trophies?: number;
  chestName?: string;
  chestIndex?: number;
  warTrophies?: number;
};

type SyncStatus = "local" | "connecting" | "synced" | "error";

type PersonalizationContextValue = {
  status: SyncStatus;
  profiles: TrackedProfile[];
  recents: RecentProfile[];
  preferences: AlertPreferences;
  devices: Array<{ label: string; createdAt: number; lastSeenAt: number }>;
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

function normalizeTag(tag: string) {
  return tag.replace(/^#/, "").trim().toUpperCase();
}

function keyOf(profile: Pick<ProfileInput, "kind" | "tag">) {
  return `${profile.kind}:${normalizeTag(profile.tag)}`;
}

function saveState(setState: React.Dispatch<React.SetStateAction<LocalPersonalizationState>>, update: (current: LocalPersonalizationState) => LocalPersonalizationState) {
  setState((current) => {
    const next = update(current);
    writeLocalPersonalization(next);
    return next;
  });
}

function deviceLabel() {
  if (typeof navigator === "undefined") return "Browser";
  const platform = navigator.platform || "Browser";
  return `${platform} browser`.slice(0, 60);
}

function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function randomPairCode() {
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

function formatPairCode(code: string) {
  return code.match(/.{1,6}/g)?.join("-") ?? code;
}

function normalizePairCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z2-9]/g, "");
}

function downloadJson(payload: object) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `clashcrown-personalization-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(href);
}

function showNotifications(alerts: PersonalAlert[]) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  for (const alert of alerts) new Notification(alert.title, { body: alert.body, tag: `clashcrown-${alert.type}` });
}

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  return isConvexConfigured ? <SyncedProvider>{children}</SyncedProvider> : <LocalProvider>{children}</LocalProvider>;
}

function LocalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readLocalPersonalization);
  const [permission, setPermission] = useState(notificationPermission);

  const value = useMemo<PersonalizationContextValue>(() => ({
    status: "local",
    profiles: state.profiles,
    recents: state.recents,
    preferences: state.preferences,
    devices: [],
    error: "",
    notificationPermission: permission,
    track: async (profile) => {
      if (profile.kind === "players") saveSharedProfile({ game: "clash-royale", tag: profile.tag, name: profile.name });
      saveState(setState, (current) => {
        const now = Date.now();
        const normalized = { ...profile, tag: normalizeTag(profile.tag) };
        const existing = current.profiles.find((candidate) => keyOf(candidate) === keyOf(normalized));
        const profiles = existing
          ? current.profiles.map((candidate) => candidate === existing ? { ...candidate, ...normalized, updatedAt: now } : candidate)
          : [{ ...normalized, isDefault: false, createdAt: now, updatedAt: now }, ...current.profiles];
        return { ...current, profiles };
      });
    },
    untrack: async (kind, tag) => {
      if (kind === "players") removeSharedProfile("clash-royale", tag);
      saveState(setState, (current) => ({
        ...current,
        profiles: current.profiles.filter((profile) => keyOf(profile) !== keyOf({ kind, tag })),
      }));
    },
    setDefault: async (tag) => saveState(setState, (current) => ({
      ...current,
      profiles: current.profiles.map((profile) => ({ ...profile, isDefault: profile.kind === "players" && tag !== null && profile.tag === normalizeTag(tag) })),
    })),
    remember: async (profile) => saveState(setState, (current) => {
      const recent = { ...profile, tag: normalizeTag(profile.tag), visitedAt: Date.now() };
      return { ...current, recents: [recent, ...current.recents.filter((candidate) => keyOf(candidate) !== keyOf(recent))].slice(0, 12) };
    }),
    clearRecents: () => saveState(setState, (current) => ({ ...current, recents: [] })),
    updatePreferences: async (preferences) => saveState(setState, (current) => ({ ...current, preferences })),
    requestNotifications: async () => {
      if (typeof Notification === "undefined") return "unsupported";
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    },
    observe: async () => undefined,
    createPairCode: async () => { throw new Error("Sync requires a configured Convex deployment."); },
    pairWithCode: async () => { throw new Error("Sync requires a configured Convex deployment."); },
    exportData: () => downloadJson({ exportedAt: new Date().toISOString(), sync: "local-only", profiles: state.profiles, recents: state.recents, preferences: state.preferences }),
    clearAll: async () => setState(replaceLocalDevice()),
  }), [permission, state]);

  return <PersonalizationContext.Provider value={value}>{children}</PersonalizationContext.Provider>;
}

function SyncedProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readLocalPersonalization);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState(notificationPermission);
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
  const remote = useQuery(personalStateQuery, ready ? { deviceSecret: state.deviceSecret } : "skip");

  useEffect(() => {
    let cancelled = false;
    void ensureAccount({
      deviceSecret: state.deviceSecret,
      deviceLabel: deviceLabel(),
      importedProfiles: state.migratedToSync ? [] : state.profiles.map(({ kind, tag, name, clan }) => ({ kind, tag, name, clan })),
      importedRecents: state.migratedToSync ? [] : state.recents.map(({ kind, tag, name, clan, visitedAt }) => ({ kind, tag, name, clan, visitedAt })),
      importedPreferences: state.preferences,
    }).then(() => {
      if (cancelled) return;
      saveState(setState, (current) => ({ ...current, migratedToSync: true }));
      setReady(true);
      setError("");
    }).catch((caught: unknown) => {
      if (cancelled) return;
      setReady(true);
      setError(caught instanceof Error ? caught.message : "Sync is temporarily unavailable. Local changes are still saved.");
    });
    return () => { cancelled = true; };
  }, [ensureAccount, state.deviceSecret]);

  useEffect(() => {
    if (!remote) return;
    saveState(setState, (current) => ({
      ...current,
      profiles: remote.profiles,
      recents: remote.recents,
      preferences: remote.preferences,
      migratedToSync: true,
    }));
    setError("");
  }, [remote]);

  const runRemote = useCallback(async (work: () => Promise<unknown>) => {
    try {
      await work();
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sync failed. The local copy is still available.");
      throw caught;
    }
  }, []);

  const value = useMemo<PersonalizationContextValue>(() => ({
    status: error ? "error" : remote ? "synced" : "connecting",
    profiles: state.profiles,
    recents: state.recents,
    preferences: state.preferences,
    devices: remote?.devices ?? [],
    error,
    notificationPermission: permission,
    track: async (profile) => {
      const normalized = { ...profile, tag: normalizeTag(profile.tag) };
      if (normalized.kind === "players") saveSharedProfile({ game: "clash-royale", tag: normalized.tag, name: normalized.name });
      saveState(setState, (current) => {
        const now = Date.now();
        const existing = current.profiles.find((candidate) => keyOf(candidate) === keyOf(normalized));
        const profiles = existing
          ? current.profiles.map((candidate) => candidate === existing ? { ...candidate, ...normalized, updatedAt: now } : candidate)
          : [{ ...normalized, isDefault: false, createdAt: now, updatedAt: now }, ...current.profiles];
        return { ...current, profiles };
      });
      await runRemote(() => saveProfile({ deviceSecret: state.deviceSecret, profile: normalized }));
    },
    untrack: async (kind, tag) => {
      if (kind === "players") removeSharedProfile("clash-royale", tag);
      saveState(setState, (current) => ({ ...current, profiles: current.profiles.filter((profile) => keyOf(profile) !== keyOf({ kind, tag })) }));
      await runRemote(() => removeProfile({ deviceSecret: state.deviceSecret, kind, tag: normalizeTag(tag) }));
    },
    setDefault: async (tag) => {
      saveState(setState, (current) => ({
        ...current,
        profiles: current.profiles.map((profile) => ({ ...profile, isDefault: profile.kind === "players" && tag !== null && profile.tag === normalizeTag(tag) })),
      }));
      await runRemote(() => saveDefault({ deviceSecret: state.deviceSecret, tag }));
    },
    remember: async (profile) => {
      const recent = { ...profile, tag: normalizeTag(profile.tag), visitedAt: Date.now() };
      saveState(setState, (current) => ({ ...current, recents: [recent, ...current.recents.filter((candidate) => keyOf(candidate) !== keyOf(recent))].slice(0, 12) }));
      await runRemote(() => saveRecent({ deviceSecret: state.deviceSecret, recent }));
    },
    clearRecents: () => {
      saveState(setState, (current) => ({ ...current, recents: [] }));
      void runRemote(() => clearRemoteRecents({ deviceSecret: state.deviceSecret })).catch(() => undefined);
    },
    updatePreferences: async (preferences) => {
      saveState(setState, (current) => ({ ...current, preferences }));
      await runRemote(() => savePreferences({ deviceSecret: state.deviceSecret, preferences }));
    },
    requestNotifications: async () => {
      if (typeof Notification === "undefined") return "unsupported";
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    },
    observe: async (observation) => {
      const alerts = await saveObservation({ deviceSecret: state.deviceSecret, ...observation, tag: normalizeTag(observation.tag) });
      showNotifications(alerts);
    },
    createPairCode: async () => {
      const raw = randomPairCode();
      const result = await createCode({ deviceSecret: state.deviceSecret, codeSecret: raw });
      return { code: formatPairCode(raw), expiresAt: result.expiresAt };
    },
    pairWithCode: async (code) => {
      const normalized = normalizePairCode(code);
      if (normalized.length < 40) throw new Error("Enter the complete pairing code.");
      await runRemote(() => redeemCode({ deviceSecret: state.deviceSecret, codeSecret: normalized, deviceLabel: deviceLabel() }));
    },
    exportData: () => downloadJson({
      exportedAt: new Date().toISOString(),
      sync: "paired-capability",
      profiles: state.profiles,
      recents: state.recents,
      preferences: state.preferences,
      devices: remote?.devices ?? [],
    }),
    clearAll: async () => {
      await runRemote(() => clearAccount({ deviceSecret: state.deviceSecret }));
      setState(replaceLocalDevice());
      setReady(false);
    },
  }), [
    clearAccount, clearRemoteRecents, createCode, error, permission, ready, redeemCode, remote, removeProfile, runRemote, saveDefault,
    saveObservation, savePreferences, saveProfile, saveRecent, state,
  ]);

  return <PersonalizationContext.Provider value={value}>{children}</PersonalizationContext.Provider>;
}

export function usePersonalization() {
  const value = useContext(PersonalizationContext);
  if (!value) throw new Error("usePersonalization must be used inside PersonalizationProvider.");
  return value;
}
