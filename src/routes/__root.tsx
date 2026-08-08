import type { QueryClient } from "@tanstack/react-query";
import { Link, createRootRouteWithContext } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";

type RouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
  notFoundComponent: NotFoundPage,
});

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
