import type { QueryClient } from "@tanstack/react-query";
import {
  Link,
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
    <div className="relative flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="content-column flex h-14 items-center sm:h-16">
          <Link
            to="/"
            className="font-display text-lg font-semibold tracking-tight text-foreground no-underline transition-opacity hover:opacity-90 focus-visible:rounded-md sm:text-xl"
          >
            StatsConnect
          </Link>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="content-column flex-1 py-8 outline-none sm:py-10 md:py-12"
      >
        <Outlet />
      </main>

      <footer className="mt-auto border-t border-border/50">
        <div className="content-column flex flex-col gap-3 py-6 text-center sm:py-8">
          <p className="font-display text-sm font-semibold text-foreground/90">
            StatsConnect
          </p>
          <p className="mx-auto max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Fan-made hub for viewing connected game statistics. Not affiliated
            with, endorsed, sponsored, or specifically approved by Supercell.
            Supercell is not responsible for this content.
          </p>
        </div>
      </footer>
    </div>
  );
}

function NotFoundPage() {
  return (
    <section className="fade-in flex min-h-[50vh] flex-col items-center justify-center py-16 text-center">
      <p className="eyebrow">Page not found</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        This page does not exist
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
        The link may be outdated, or the page has moved. Return home to continue.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90"
      >
        Back to home
      </Link>
    </section>
  );
}
