import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import {
  AppErrorBoundary,
  installGlobalErrorHandlers,
  reportClientError,
} from "@statsconnect/site-errors";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ClashCrownFatalError,
  ClashCrownRouteError,
} from "@/components/AppErrorPage";
import { convexUrl, isConvexConfigured } from "@/lib/convex";
import { PersonalizationProvider } from "@/components/personalization/PersonalizationProvider";
import { routeTree } from "./routeTree.gen";
import "./styles/globals.css";

const APP_NAME = "ClashCrown";
const removeGlobalErrorHandlers = installGlobalErrorHandlers(APP_NAME);
if (import.meta.hot) import.meta.hot.dispose(removeGlobalErrorHandlers);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
    },
  },
});

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  basepath: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
  defaultErrorComponent: ClashCrownRouteError,
  defaultOnCatch: (error, errorInfo) => {
    reportClientError({
      app: APP_NAME,
      error,
      source: "route",
      componentStack: errorInfo.componentStack ?? undefined,
    });
  },
});
const convexClient = isConvexConfigured ? new ConvexReactClient(convexUrl) : null;

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function Providers({ children }: { children: ReactNode }) {
  const app = (
    <QueryClientProvider client={queryClient}>
      <PersonalizationProvider>{children}</PersonalizationProvider>
    </QueryClientProvider>
  );
  return convexClient ? <ConvexProvider client={convexClient}>{app}</ConvexProvider> : app;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("ClashCrown could not find its root element.");

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
    <AppErrorBoundary app={APP_NAME} fallback={ClashCrownFatalError}>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </AppErrorBoundary>
  </StrictMode>,
);
