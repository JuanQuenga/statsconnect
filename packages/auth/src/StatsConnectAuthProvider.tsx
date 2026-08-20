import {
  ConvexBetterAuthProvider,
  type AuthClient,
} from "@convex-dev/better-auth/react";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ConvexReactClient, useConvexAuth, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { getBrowserConnectedProfilesAdapter } from "./browser-connected-profiles";
import {
  createConnectedProfilesModule,
  type AccountConnectedProfilesAdapter,
  type ConnectedProfile,
  type ConnectedProfileAccountSnapshot,
  type ConnectedProfileGame,
  type ConnectedProfilesModule,
  type ConnectedProfilesSnapshot,
  type PersistedConnectedProfile,
} from "./connected-profiles";
import { createSharedAuthStorage } from "./shared-auth-storage";

export type StatsConnectAccount = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type StatsConnectPlusOffer = {
  name: string;
  scope: string;
  availability: "foundation";
  checkoutAvailable: boolean;
  features: string[];
  notice: string;
};

export type StatsConnectAuthState = {
  account: StatsConnectAccount | null;
  isLoading: boolean;
  profiles: readonly ConnectedProfile[];
  profilesStatus: ConnectedProfilesSnapshot["status"];
  profilesError: string | null;
  plusOffer: StatsConnectPlusOffer | null;
  saveProfile: (profile: ConnectedProfile) => Promise<void>;
  removeProfile: (game: ConnectedProfileGame, tag: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

type AccountState = {
  user: StatsConnectAccount;
  profiles: PersistedConnectedProfile[];
} | null;

type ProfileInput = ConnectedProfile;

const accountStateRef = makeFunctionReference<"query", Record<string, never>, AccountState>(
  "hub/savedProfiles:accountState",
);
const accessRef = makeFunctionReference<
  "query",
  { now: number },
  { offer: StatsConnectPlusOffer }
>("hub/access:getAccess");
const mergeProfilesRef = makeFunctionReference<"mutation", { profiles: ProfileInput[] }, null>(
  "hub/savedProfiles:mergeBrowserProfiles",
);
const saveProfileRef = makeFunctionReference<"mutation", ProfileInput, null>("hub/savedProfiles:save");
const removeProfileRef = makeFunctionReference<"mutation", { game: ProfileInput["game"]; tag: string }, null>(
  "hub/savedProfiles:remove",
);

const noopAccountAdapter: AccountConnectedProfilesAdapter = {
  merge: async () => undefined,
  save: async () => undefined,
  remove: async () => undefined,
};

const defaultState: StatsConnectAuthState = {
  account: null,
  isLoading: false,
  profiles: [],
  profilesStatus: "guest",
  profilesError: null,
  plusOffer: null,
  saveProfile: async () => undefined,
  removeProfile: async () => undefined,
  signInWithGoogle: async () => undefined,
  signOut: async () => undefined,
};

const AuthContext = createContext<StatsConnectAuthState>(defaultState);

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

function useProfilesModule(
  createModule: () => ConnectedProfilesModule,
): { module: ConnectedProfilesModule; snapshot: ConnectedProfilesSnapshot } {
  const [module] = useState(createModule);
  useEffect(() => () => module.dispose(), [module]);
  const snapshot = useSyncExternalStore(module.subscribe, module.getSnapshot, module.getSnapshot);
  return { module, snapshot };
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

  if (!clients) return <GuestProfiles>{children}</GuestProfiles>;
  const authClient = clients.auth as unknown as AuthClient;

  return (
    <ConvexBetterAuthProvider client={clients.convex} authClient={authClient}>
      <ConfiguredAuth authClient={authClient}>{children}</ConfiguredAuth>
    </ConvexBetterAuthProvider>
  );
}

function GuestProfiles({ children }: { children: ReactNode }) {
  const profiles = useProfilesModule(() => createConnectedProfilesModule({
    account: noopAccountAdapter,
    browser: getBrowserConnectedProfilesAdapter(),
  }));
  const value = useMemo<StatsConnectAuthState>(() => ({
    ...defaultState,
    profiles: profiles.snapshot.profiles,
    profilesStatus: profiles.snapshot.status,
    profilesError: profiles.snapshot.error,
    saveProfile: profiles.module.save,
    removeProfile: profiles.module.remove,
    signOut: async () => profiles.module.signOut(),
  }), [profiles.module, profiles.snapshot]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ConfiguredAuth({
  authClient,
  children,
}: {
  authClient: AuthClient;
  children: ReactNode;
}) {
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const [accessNow] = useState(() => Date.now());
  const access = useQuery(accessRef, { now: accessNow });
  const accountState = useQuery(accountStateRef, isAuthenticated ? {} : "skip");
  const mergeProfiles = useMutation(mergeProfilesRef);
  const saveProfile = useMutation(saveProfileRef);
  const removeProfile = useMutation(removeProfileRef);
  const accountAdapter = useMemo<AccountConnectedProfilesAdapter>(() => ({
    merge: async (profiles) => {
      await mergeProfiles({ profiles: [...profiles] });
    },
    save: async (profile) => {
      await saveProfile(profile);
    },
    remove: async (game, tag) => {
      await removeProfile({ game, tag });
    },
  }), [mergeProfiles, removeProfile, saveProfile]);
  const profiles = useProfilesModule(() => createConnectedProfilesModule({
    account: accountAdapter,
    browser: getBrowserConnectedProfilesAdapter(),
  }));

  useEffect(() => {
    const snapshot: ConnectedProfileAccountSnapshot | null = accountState
      ? { userId: accountState.user.id, profiles: accountState.profiles }
      : null;
    void profiles.module.reconcileAccount(snapshot);
  }, [accountState, profiles.module]);

  const value = useMemo<StatsConnectAuthState>(() => ({
    account: accountState?.user ?? null,
    isLoading: isConvexAuthLoading || (isAuthenticated && accountState === undefined),
    profiles: profiles.snapshot.profiles,
    profilesStatus: profiles.snapshot.status,
    profilesError: profiles.snapshot.error,
    plusOffer: access?.offer ?? null,
    saveProfile: profiles.module.save,
    removeProfile: profiles.module.remove,
    signInWithGoogle: async () => {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
      });
    },
    signOut: async () => {
      await authClient.signOut();
      profiles.module.signOut();
    },
  }), [
    access,
    accountState,
    authClient,
    isAuthenticated,
    isConvexAuthLoading,
    profiles.module,
    profiles.snapshot,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useStatsConnectAuth(): StatsConnectAuthState {
  return useContext(AuthContext);
}
