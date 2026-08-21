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
  StatsConnectFatalError,
  StatsConnectRouteError,
} from "./components/AppErrorPage";
import { routeTree } from "./routeTree.gen";

const APP_NAME = "StatsConnect";

function createApplicationRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultErrorComponent: StatsConnectRouteError,
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

type StatsConnectRouter = ReturnType<typeof createApplicationRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: StatsConnectRouter;
  }
}

function localHref(href: string): string {
  const url = new URL(href, window.location.href);
  return `${url.pathname}${url.search}${url.hash}`;
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
      <AppErrorBoundary app={APP_NAME} fallback={StatsConnectFatalError}>
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
