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

function createApplicationRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
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
    navigate: (href) => void router.navigate({ href: localHref(href) }),
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
