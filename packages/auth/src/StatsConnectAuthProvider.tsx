import {
  ConvexBetterAuthProvider,
  type AuthClient,
} from "@convex-dev/better-auth/react";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import {
  readSharedProfiles,
  replaceSharedProfiles,
  subscribeSharedProfileUpdates,
} from "@statsconnect/site-nav/shared-profiles";
import { createAuthClient } from "better-auth/react";
import { ConvexReactClient } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { mergeSavedProfiles, type SavedProfile } from "./sync-profiles";
import { createSharedAuthStorage } from "./shared-auth-storage";

export type StatsConnectAccount = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type StatsConnectAuthState = {
  account: StatsConnectAccount | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

type AccountState = {
  user: StatsConnectAccount;
  profiles: SavedProfile[];
} | null;

type ProfileInput = {
  game: "brawl-stars" | "clash-royale";
  tag: string;
  name: string;
};

const accountStateRef = makeFunctionReference<"query", Record<string, never>, AccountState>(
  "hub/savedProfiles:accountState",
);
const mergeProfilesRef = makeFunctionReference<"mutation", { profiles: ProfileInput[] }, null>(
  "hub/savedProfiles:mergeBrowserProfiles",
);
const saveProfileRef = makeFunctionReference<"mutation", ProfileInput, null>("hub/savedProfiles:save");
const removeProfileRef = makeFunctionReference<"mutation", { game: ProfileInput["game"]; tag: string }, null>(
  "hub/savedProfiles:remove",
);

const unauthenticatedState: StatsConnectAuthState = {
  account: null,
  isLoading: false,
  signInWithGoogle: async () => undefined,
  signOut: async () => undefined,
};

const AuthContext = createContext<StatsConnectAuthState>(unauthenticatedState);

function siteUrlFromCloudUrl(convexUrl: string): string {
  return convexUrl.replace(/\.convex\.cloud\/?$/, ".convex.site");
}

function browserAuthStorage() {
  if (typeof window === "undefined") return undefined;
  return createSharedAuthStorage({
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    readCookie: () => document.cookie,
    writeCookie: (value) => {
      document.cookie = value;
    },
    legacyStorage: window.localStorage,
  });
}

export function StatsConnectAuthProvider({
  children,
  convexSiteUrl,
  convexUrl,
}: {
  children: ReactNode;
  convexSiteUrl?: string;
  convexUrl?: string;
}) {
  const configuredUrl = convexUrl?.trim();
  const configuredSiteUrl = convexSiteUrl?.trim() || (configuredUrl ? siteUrlFromCloudUrl(configuredUrl) : "");
  const clients = useMemo(() => {
    if (!configuredUrl || !configuredSiteUrl) return null;
    const authStorage = browserAuthStorage();
    return {
      convex: new ConvexReactClient(configuredUrl),
      auth: createAuthClient({
        baseURL: configuredSiteUrl,
        plugins: [convexClient(), crossDomainClient(authStorage ? { storage: authStorage } : {})],
      }),
    };
  }, [configuredSiteUrl, configuredUrl]);

  if (!clients) return <AuthContext.Provider value={unauthenticatedState}>{children}</AuthContext.Provider>;
  const authClient = clients.auth as unknown as AuthClient;

  return (
    <ConvexBetterAuthProvider client={clients.convex} authClient={authClient}>
      <ConfiguredAuth authClient={authClient}>{children}</ConfiguredAuth>
    </ConvexBetterAuthProvider>
  );
}

function ConfiguredAuth({
  authClient,
  children,
}: {
  authClient: AuthClient;
  children: ReactNode;
}) {
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const accountState = useQuery(accountStateRef, isAuthenticated ? {} : "skip");
  const mergeProfiles = useMutation(mergeProfilesRef);
  const saveProfile = useMutation(saveProfileRef);
  const removeProfile = useMutation(removeProfileRef);
  const migratedUserId = useRef<string | null>(null);
  const pendingProfiles = useRef<ProfileInput[]>([]);
  const [mergeCompletedUserId, setMergeCompletedUserId] = useState<string | null>(null);
  const [readyUserId, setReadyUserId] = useState<string | null>(null);

  useEffect(() => subscribeSharedProfileUpdates((update) => {
    if (!isAuthenticated) return;
    if (update.type === "save") {
      void saveProfile(update.profile).catch(() => undefined);
    } else {
      void removeProfile({ game: update.game, tag: update.tag }).catch(() => undefined);
    }
  }), [isAuthenticated, removeProfile, saveProfile]);

  useEffect(() => {
    if (!accountState || migratedUserId.current === accountState.user.id) return;
    migratedUserId.current = accountState.user.id;
    const browserProfiles = readSharedProfiles();
    const merged = mergeSavedProfiles(
      accountState.profiles,
      browserProfiles.map((profile) => ({ ...profile, updatedAt: 0 })),
    );
    const profiles = merged.map(({ game, name, tag }) => ({ game, name, tag }));
    pendingProfiles.current = profiles;
    replaceSharedProfiles(profiles);
    void mergeProfiles({ profiles })
      .then(() => setMergeCompletedUserId(accountState.user.id))
      .catch(() => {
        migratedUserId.current = null;
        setMergeCompletedUserId(null);
        setReadyUserId(null);
      });
  }, [accountState, mergeProfiles]);

  useEffect(() => {
    if (!accountState || mergeCompletedUserId !== accountState.user.id) return;
    const complete = pendingProfiles.current.every((pending) => accountState.profiles.some((profile) => (
      profile.game === pending.game && profile.tag === pending.tag && profile.name === pending.name
    )));
    if (complete) setReadyUserId(accountState.user.id);
  }, [accountState, mergeCompletedUserId]);

  useEffect(() => {
    if (!accountState || readyUserId !== accountState.user.id) return;
    replaceSharedProfiles(accountState.profiles.map(({ game, name, tag }) => ({ game, name, tag })));
  }, [accountState, readyUserId]);

  const value = useMemo<StatsConnectAuthState>(() => ({
    account: accountState?.user ?? null,
    isLoading: isConvexAuthLoading || (isAuthenticated && accountState === undefined),
    signInWithGoogle: async () => {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
      });
    },
    signOut: async () => {
      await authClient.signOut();
      migratedUserId.current = null;
      pendingProfiles.current = [];
      setMergeCompletedUserId(null);
      setReadyUserId(null);
      replaceSharedProfiles([]);
    },
  }), [accountState, authClient, isAuthenticated, isConvexAuthLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useStatsConnectAuth(): StatsConnectAuthState {
  return useContext(AuthContext);
}
