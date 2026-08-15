import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import {
  AppErrorBoundary,
  installGlobalErrorHandlers,
  reportClientError,
} from "@statsconnect/site-errors";
import { StatsConnectAuthProvider } from "@statsconnect/auth";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  StatsConnectFatalError,
  StatsConnectRouteError,
} from "./components/AppErrorPage";
import "./index.css";
import { routeTree } from "./routeTree.gen";

const APP_NAME = "StatsConnect";
const removeGlobalErrorHandlers = installGlobalErrorHandlers(APP_NAME);
if (import.meta.hot) import.meta.hot.dispose(removeGlobalErrorHandlers);

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

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("StatsConnect could not find its root element.");
}

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
