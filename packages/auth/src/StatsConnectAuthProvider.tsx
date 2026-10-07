import {
  ClerkProvider,
  useAuth as useClerkAuth,
  useClerk,
} from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexProvider, ConvexReactClient, useConvexAuth, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import {
  createProfileTrackingState,
  requireProfileTrackingAuth,
  ProfileTrackingAuthRequiredError,
  StatsConnectAuthConfigurationError,
  type ProfileTrackingInterface,
  type ProfileTrackingState,
} from "./profile-tracking";

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
  profileTracking: ProfileTrackingState;
  trackProfile: ProfileTrackingInterface["trackProfile"];
  untrackProfile: ProfileTrackingInterface["untrackProfile"];
  plusOffer: StatsConnectPlusOffer | null;
  saveProfile: (profile: ConnectedProfile) => Promise<void>;
  removeProfile: (game: ConnectedProfileGame, tag: string) => Promise<void>;
  /** Opens Clerk's sign-in modal (every sign-in method enabled in Clerk). */
  signIn: () => Promise<void>;
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
  profileTracking: createProfileTrackingState({
    status: "unauthenticated",
    authenticated: false,
    profiles: [],
    error: null,
  }),
  trackProfile: async () => {
    throw new ProfileTrackingAuthRequiredError();
  },
  untrackProfile: async () => {
    throw new ProfileTrackingAuthRequiredError();
  },
  plusOffer: null,
  saveProfile: async () => undefined,
  removeProfile: async () => undefined,
  signIn: async () => {
    throw new StatsConnectAuthConfigurationError();
  },
  signOut: async () => undefined,
};

const AuthContext = createContext<StatsConnectAuthState>(defaultState);

function useProfilesModule(
  createModule: () => ConnectedProfilesModule,
): { module: ConnectedProfilesModule; snapshot: ConnectedProfilesSnapshot } {
  const [module] = useState(createModule);
  useEffect(() => () => module.dispose(), [module]);
  const snapshot = useSyncExternalStore(module.subscribe, module.getSnapshot, module.getSnapshot);
  return { module, snapshot };
}

function useConvexReactClient(configuredUrl: string): ConvexReactClient | null {
  const pendingCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientRef = useRef<{ url: string; client: ConvexReactClient } | null>(null);

  if (configuredUrl && !clientRef.current) {
    clientRef.current = { url: configuredUrl, client: new ConvexReactClient(configuredUrl) };
  }

  const entry = clientRef.current;
  useEffect(() => {
    if (!entry) return;
    if (pendingCloseRef.current) {
      clearTimeout(pendingCloseRef.current);
      pendingCloseRef.current = null;
    }
    return () => {
      pendingCloseRef.current = setTimeout(() => {
        entry.client.close();
        if (clientRef.current === entry) clientRef.current = null;
        pendingCloseRef.current = null;
      }, 0);
    };
  }, [entry]);

  return entry?.client ?? null;
}

export function StatsConnectAuthProvider({
  children,
  clerkPublishableKey,
  convexUrl,
  onConvexTokenProvider,
}: {
  children: ReactNode;
  clerkPublishableKey?: string;
  convexUrl?: string;
  /** Receives the signed-in Clerk token fetcher (null while signed out). */
  onConvexTokenProvider?: (provider: (() => Promise<string | null>) | null) => void;
}) {
  const configuredUrl = convexUrl?.trim();
  const publishableKey = clerkPublishableKey?.trim();
  const convex = useConvexReactClient(configuredUrl ?? "");

  if (!configuredUrl || !publishableKey || !convex) {
    const guest = <GuestProfiles onTokenProvider={onConvexTokenProvider}>{children}</GuestProfiles>;
    // Without Clerk, public Convex queries still need a client in context.
    return convex ? <ConvexProvider client={convex}>{guest}</ConvexProvider> : guest;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useClerkAuth}>
        {/* Must render under ClerkProvider: the bridge reads Clerk context. */}
        {onConvexTokenProvider ? (
          <ConvexTokenBridge onTokenProvider={onConvexTokenProvider} />
        ) : null}
        <ConfiguredAuth>{children}</ConfiguredAuth>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

/**
 * Feeds the standalone Hub ConvexHttpClient the signed-in Clerk token so
 * authenticated preview calls throttle per account instead of per browser.
 * Only the provider mounts this (inside ClerkProvider); onTokenProvider
 * receives null again on sign-out or unmount.
 */
function ConvexTokenBridge({
  onTokenProvider,
}: {
  onTokenProvider: (provider: (() => Promise<string | null>) | null) => void;
}): null {
  const { getToken, isSignedIn } = useClerkAuth();
  useEffect(() => {
    onTokenProvider(isSignedIn ? () => getToken({ template: "convex" }) : null);
    return () => onTokenProvider(null);
  }, [getToken, isSignedIn, onTokenProvider]);
  return null;
}

function GuestProfiles({
  children,
  onTokenProvider,
}: {
  children: ReactNode;
  onTokenProvider?: (provider: (() => Promise<string | null>) | null) => void;
}) {
  const profiles = useProfilesModule(() => createConnectedProfilesModule({
    account: noopAccountAdapter,
    browser: getBrowserConnectedProfilesAdapter(),
  }));
  const value = useMemo<StatsConnectAuthState>(() => ({
    ...defaultState,
    profiles: profiles.snapshot.profiles,
    profilesStatus: profiles.snapshot.status,
    profilesError: profiles.snapshot.error,
    profileTracking: createProfileTrackingState({
      status: profiles.snapshot.status === "error" ? "error" : "unauthenticated",
      authenticated: false,
      profiles: [],
      error: profiles.snapshot.error,
    }),
    trackProfile: async () => {
      throw new ProfileTrackingAuthRequiredError();
    },
    untrackProfile: async () => {
      throw new ProfileTrackingAuthRequiredError();
    },
    saveProfile: profiles.module.save,
    removeProfile: profiles.module.remove,
    signIn: async () => {
      throw new StatsConnectAuthConfigurationError();
    },
    signOut: async () => profiles.module.signOut(),
  }), [profiles.module, profiles.snapshot]);
  // Guest mode has no Clerk tokens, so never leave a stale fetcher behind.
  useEffect(() => {
    onTokenProvider?.(null);
  }, [onTokenProvider]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ConfiguredAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const clerk = useClerk();
  const [accessNow] = useState(() => Date.now());
  const access = useQuery(accessRef, isAuthenticated ? { now: accessNow } : "skip");
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

  const trackProfile = useCallback(async (profile: ConnectedProfile) => {
    requireProfileTrackingAuth(isAuthenticated);
    await profiles.module.save(profile);
  }, [isAuthenticated, profiles.module]);
  const untrackProfile = useCallback(async (game: ConnectedProfileGame, tag: string) => {
    requireProfileTrackingAuth(isAuthenticated);
    await profiles.module.remove(game, tag);
  }, [isAuthenticated, profiles.module]);
  const accountReady = isAuthenticated && !isConvexAuthLoading && accountState !== undefined;
  const accountTrackedProfiles = useMemo(
    () => accountReady && accountState
      ? accountState.profiles.map(({ game, tag, name }) => ({ game, tag, name }))
      : [],
    [accountReady, accountState],
  );

  const value = useMemo<StatsConnectAuthState>(() => ({
    account: accountState?.user ?? null,
    isLoading: isConvexAuthLoading || (isAuthenticated && accountState === undefined),
    profiles: profiles.snapshot.profiles,
    profilesStatus: profiles.snapshot.status,
    profilesError: profiles.snapshot.error,
    profileTracking: createProfileTrackingState({
      status: isConvexAuthLoading || (isAuthenticated && accountState === undefined)
        ? "loading"
        : profiles.snapshot.status === "error"
          ? "error"
          : isAuthenticated
            ? "ready"
            : "unauthenticated",
      authenticated: isAuthenticated,
      profiles: accountTrackedProfiles,
      error: profiles.snapshot.error,
    }),
    trackProfile,
    untrackProfile,
    plusOffer: access?.offer ?? null,
    saveProfile: profiles.module.save,
    removeProfile: profiles.module.remove,
    // Clerk's own modal, not a headless Google redirect: it shows the
    // StatsConnect Clerk branding and every enabled method, and completes
    // the OAuth round trip itself before returning to this page.
    signIn: async () => {
      const returnTo = window.location.href;
      clerk.openSignIn({ fallbackRedirectUrl: returnTo, signUpFallbackRedirectUrl: returnTo });
    },
    signOut: async () => {
      await clerk.signOut();
      profiles.module.signOut();
    },
  }), [
    access,
    accountState,
    clerk,
    isAuthenticated,
    isConvexAuthLoading,
    accountTrackedProfiles,
    profiles.module,
    profiles.snapshot,
    trackProfile,
    untrackProfile,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useStatsConnectAuth(): StatsConnectAuthState {
  return useContext(AuthContext);
}

export function useStatsConnectProfileTracking(): ProfileTrackingInterface {
  const auth = useStatsConnectAuth();
  return {
    ...auth.profileTracking,
    trackProfile: auth.trackProfile,
    untrackProfile: auth.untrackProfile,
  };
}
