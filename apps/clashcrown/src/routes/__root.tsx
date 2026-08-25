import { Outlet, createRootRoute, useLocation } from "@tanstack/react-router";
import { ArenaRouteHero } from "@/components/portfolio/ArenaRouteHero";
import Head from "@/components/Head";
import Link from "@/components/Link";
import { Layout } from "@/components/portfolio/Layout";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  const { pathname } = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const canonicalPath = base && base !== "/" && (pathname === base || pathname.startsWith(`${base}/`))
    ? pathname.slice(base.length) || "/"
    : pathname || "/";

  return (
    <>
      <Head>
        <link rel="canonical" href={canonicalPath} />
      </Head>
      <Outlet />
    </>
  );
}

function NotFoundPage() {
  return (
    <Layout>
      <Head>
        <title>Page not found | StatsConnect · Clash Royale statistics</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <ArenaRouteHero
        eyebrow="404"
        title="This page does not exist"
        summary="The link may be outdated, or the page may have moved."
        actions={
          <div className="app-error-actions">
            <Link href="/" className="pink-button">Back to StatsConnect Clash Royale</Link>
            <Link href="/players" className="app-error-home">Find a player</Link>
          </div>
        }
      />
    </Layout>
  );
}
