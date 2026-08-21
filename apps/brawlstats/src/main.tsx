import { StatsConnectAuthProvider } from "@statsconnect/auth";
import type { MountedStatsConnectApplication } from "@statsconnect/site-nav";
import {
  AppErrorBoundary,
  installGlobalErrorHandlers,
  reportClientError,
} from "@statsconnect/site-errors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrawlStatsFatalError,
  BrawlStatsRouteError,
} from "./components/AppErrorPage";
import "./index.css";
import { initializePwa } from "./lib/pwa";
import { routeTree } from "./routeTree.gen";

const APP_NAME = "StatsConnect Brawl Stars";
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

initializePwa();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
  });
}

function createApplicationRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    basepath: basePath,
    defaultErrorComponent: BrawlStatsRouteError,
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

type BrawlStatsRouter = ReturnType<typeof createApplicationRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: BrawlStatsRouter;
  }
}

function localHref(href: string): string {
  const url = new URL(href, window.location.href);
  const pathname = basePath !== "/" && (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`))
    ? url.pathname.slice(basePath.length) || "/"
    : url.pathname;
  return `${pathname}${url.search}${url.hash}`;
}

export function mountApplication(rootElement: HTMLElement): MountedStatsConnectApplication {
  const removeGlobalErrorHandlers = installGlobalErrorHandlers(APP_NAME);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
  const router = createApplicationRouter(queryClient);
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
      <AppErrorBoundary app={APP_NAME} fallback={BrawlStatsFatalError}>
        <StatsConnectAuthProvider
          convexUrl={import.meta.env.VITE_CONVEX_URL}
          convexSiteUrl={import.meta.env.VITE_CONVEX_SITE_URL}
        >
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </StatsConnectAuthProvider>
      </AppErrorBoundary>
    </StrictMode>,
  );

  return {
    navigate: (href) => void router.navigate({ to: localHref(href) as never }),
    unmount: () => {
      root.unmount();
      removeGlobalErrorHandlers();
      queryClient.clear();
    },
  };
}

window.__statsConnectMounts ??= {};
window.__statsConnectMounts["brawl-stars"] = mountApplication;

if (!window.__statsConnectApplicationShell) {
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("StatsConnect Brawl Stars could not find its root element.");
  mountApplication(rootElement);
}
