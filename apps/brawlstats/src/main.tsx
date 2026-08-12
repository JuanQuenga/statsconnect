import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import {
  AppErrorBoundary,
  installGlobalErrorHandlers,
  reportClientError,
} from "@statsconnect/site-errors";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrawlStatsFatalError,
  BrawlStatsRouteError,
} from "./components/AppErrorPage";
import { routeTree } from "./routeTree.gen";
import { initializePwa } from "./lib/pwa";
import "./index.css";

const APP_NAME = "BrawlStats";
const removeGlobalErrorHandlers = installGlobalErrorHandlers(APP_NAME);
if (import.meta.hot) import.meta.hot.dispose(removeGlobalErrorHandlers);

initializePwa();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  basepath: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
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

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("BrawlStats could not find its root element.");

createRoot(rootElement, {
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
}).render(
  <StrictMode>
    <AppErrorBoundary app={APP_NAME} fallback={BrawlStatsFatalError}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
