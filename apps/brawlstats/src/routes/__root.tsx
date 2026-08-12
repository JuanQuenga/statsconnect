import { createRootRoute, HeadContent, Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { buttonVariants } from "@/components/ui/button";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  return (
    <>
      <HeadContent />
      <AppShell>
        <Outlet />
      </AppShell>
    </>
  );
}

function NotFoundPage() {
  useEffect(() => {
    const previousTitle = document.title;
    const existingRobots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const robots = existingRobots ?? document.createElement("meta");
    const previousRobots = existingRobots?.content;

    document.title = "Page not found · BrawlStats.io";
    if (!existingRobots) {
      robots.name = "robots";
      document.head.append(robots);
    }
    robots.content = "noindex, nofollow";

    return () => {
      document.title = previousTitle;
      if (!existingRobots) robots.remove();
      else robots.content = previousRobots ?? "";
    };
  }, []);

  return (
    <section className="page-shell flex min-h-[58vh] flex-col items-center justify-center space-y-0 py-16 text-center" aria-labelledby="not-found-title">
      <p className="font-display text-[7rem] leading-[0.8] tracking-[-0.06em] text-primary/20 sm:text-[10rem]" aria-hidden>
        404
      </p>
      <p className="eyebrow mt-7">Match not found</p>
      <h1 id="not-found-title" className="mt-3 font-display text-4xl md:text-5xl">
        This page does not exist
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        The link may be outdated, or the page may have moved.
      </p>
      <Link to="/" className={`${buttonVariants({ size: "lg" })} mt-9`}>
        Back to BrawlStats
      </Link>
    </section>
  );
}
