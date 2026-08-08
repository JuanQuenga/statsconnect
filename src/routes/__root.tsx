import type { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";

type RouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 md:px-6">
          <a href="/" className="font-display text-xl font-semibold">
            StatsConnect
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 md:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-border/50 py-6 text-center text-sm text-muted-foreground">
        StatsConnect
      </footer>
    </div>
  );
}

function NotFoundPage() {
  return (
    <section className="py-20 text-center">
      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
        Page not found
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold">
        There is nothing here yet.
      </h1>
    </section>
  );
}
