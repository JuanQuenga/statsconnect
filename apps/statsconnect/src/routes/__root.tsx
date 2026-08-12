import type { QueryClient } from "@tanstack/react-query";
import { Link, createRootRouteWithContext } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { buttonVariants } from "@/components/ui/button";

type RouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
  notFoundComponent: NotFoundPage,
});

function NotFoundPage() {
  return (
    <section className="boot-in flex min-h-[52vh] flex-col items-center justify-center py-16 text-center">
      <p className="numeric text-[7rem] leading-none text-[var(--ambient)]/25 sm:text-[10rem]">
        404
      </p>
      <p className="eyebrow mt-2">Page not found</p>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        This page does not exist
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        The link may be outdated, or the page has moved. Return home to continue.
      </p>
      <Link to="/" className={`${buttonVariants({ size: "lg" })} mt-9`}>
        Back to lobby
      </Link>
    </section>
  );
}
