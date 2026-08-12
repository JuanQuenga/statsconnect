import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { convexUrl, isConvexConfigured } from "@/lib/convex";
import { routeTree } from "./routeTree.gen";
import "./styles/globals.css";

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
});
const convexClient = isConvexConfigured ? new ConvexReactClient(convexUrl) : null;

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function Providers({ children }: { children: ReactNode }) {
  const app = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return convexClient ? <ConvexProvider client={convexClient}>{app}</ConvexProvider> : app;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("ClashCrown could not find its root element.");

createRoot(rootElement).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
