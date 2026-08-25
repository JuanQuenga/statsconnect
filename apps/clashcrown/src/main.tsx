import { StatsConnectAuthProvider } from "@statsconnect/auth";
import type { MountedStatsConnectApplication } from "@statsconnect/site-nav";
import {
  AppErrorBoundary,
  installGlobalErrorHandlers,
  reportClientError,
} from "@statsconnect/site-errors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ClashRoyaleFatalError,
  ClashRoyaleRouteError,
} from "@/components/AppErrorPage";
import { PersonalizationProvider } from "@/components/personalization/PersonalizationProvider";
import { routeTree } from "./routeTree.gen";
import "./styles/globals.css";

const APP_NAME = "StatsConnect Clash Royale";
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

function isBenignViewTransitionAbort(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error) || !("message" in error)) {
    return false;
  }

  const name = error.name;
  const message = error.message;
  if (typeof name !== "string" || typeof message !== "string") return false;

  return (
    (name === "AbortError" || name === "InvalidStateError") &&
    /transition/i.test(message)
  );
}

function createApplicationRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    // Keep route changes in the browser's same-document transition pipeline.
    // Individual navigation adapters opt out for search/hash-only updates.
    defaultViewTransition: true,
    basepath: basePath,
    defaultErrorComponent: ClashRoyaleRouteError,
    defaultOnCatch: (error, errorInfo) => {
      reportClientError({
        app: APP_NAME,
        error,
        source: "route",
        componentStack: errorInfo.componentStack ?? undefined,
      });
    },
  });

  // TanStack awaits this promise from its history subscriber. A browser can
  // reject it when a newer transition supersedes an active one; keep that
  // expected race from becoming an unhandled rejection while preserving real
  // route/load failures.
  const startViewTransition = router.startViewTransition;
  router.startViewTransition = (fn) => {
    const transitionRequested = router.shouldViewTransition ?? true;
    const nativeSupported = typeof document !== "undefined" &&
      typeof document.startViewTransition === "function";

    try {
      return startViewTransition(fn).catch((error: unknown) => {
        if (nativeSupported && transitionRequested && isBenignViewTransitionAbort(error)) {
          return;
        }
        throw error;
      });
    } catch (error: unknown) {
      if (nativeSupported && transitionRequested && isBenignViewTransitionAbort(error)) {
        // A synchronous native failure happens before the update callback is
        // invoked. Continue the route update without the transition, and let
        // callback/load errors remain rejected instead of masking them.
        return Promise.resolve().then(fn);
      }
      throw error;
    }
  };

  return router;
}

function navigationPath(href: string): string {
  return href.split(/[?#]/, 1)[0] || "/";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type ClashRoyaleRouter = ReturnType<typeof createApplicationRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: ClashRoyaleRouter;
  }
}

function localHref(href: string): string {
  const url = new URL(href, window.location.href);
  const pathname = basePath !== "/" && (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`))
    ? url.pathname.slice(basePath.length) || "/"
    : url.pathname;
  return `${pathname}${url.search}${url.hash}`;
}

function Providers({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
  return (
    <StatsConnectAuthProvider
      convexUrl={import.meta.env.VITE_CONVEX_URL ?? import.meta.env.NEXT_PUBLIC_CONVEX_URL}
      convexSiteUrl={import.meta.env.VITE_CONVEX_SITE_URL}
    >
      <QueryClientProvider client={queryClient}>
        <PersonalizationProvider>{children}</PersonalizationProvider>
      </QueryClientProvider>
    </StatsConnectAuthProvider>
  );
}

export function mountApplication(rootElement: HTMLElement): MountedStatsConnectApplication {
  const removeGlobalErrorHandlers = installGlobalErrorHandlers(APP_NAME);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
      },
    },
  });
  const router = createApplicationRouter();

  const root = createRoot(rootElement, {
    onUncaughtError: (error, errorInfo) => {
      reportClientError({
        app: APP_NAME,
        error,
        source: "uncaught",
        componentStack: errorInfo.componentStack,
      });
    },
    onRecoverableError: (error, errorInfo) => {
      reportClientError({
        app: APP_NAME,
        error,
        source: "recoverable",
        componentStack: errorInfo.componentStack,
      });
    },
  });

  root.render(
    <StrictMode>
      <AppErrorBoundary app={APP_NAME} fallback={ClashRoyaleFatalError}>
        <Providers queryClient={queryClient}>
          <RouterProvider router={router} />
        </Providers>
      </AppErrorBoundary>
    </StrictMode>,
  );

  return {
    navigate: (href) => {
      const local = localHref(href);
      void router.navigate({
        href: local,
        viewTransition: !prefersReducedMotion() && navigationPath(local) !== router.state.location.pathname,
      });
    },
    unmount: () => {
      root.unmount();
      removeGlobalErrorHandlers();
      queryClient.clear();
    },
  };
}

window.__statsConnectMounts ??= {};
window.__statsConnectMounts["clash-royale"] = mountApplication;

if (!window.__statsConnectApplicationShell) {
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("StatsConnect Clash Royale could not find its root element.");
  mountApplication(rootElement);
}
