import { Outlet, createRootRoute } from "@tanstack/react-router";
import Head from "@/components/Head";
import Link from "@/components/Link";
import { Layout } from "@/components/portfolio/Layout";

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFoundPage,
});

function NotFoundPage() {
  return (
    <Layout>
      <Head>
        <title>Page not found | Royale Stats</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <section className="data-state not-found-state" aria-labelledby="not-found-title">
        <p className="not-found-code" aria-hidden>404</p>
        <p className="app-error-eyebrow">Arena not found</p>
        <h1 id="not-found-title">This page does not exist</h1>
        <p>The link may be outdated, or the page may have moved.</p>
        <div className="app-error-actions">
          <Link href="/" className="pink-button">Back to Royale Stats</Link>
          <Link href="/players" className="app-error-home">Find a player</Link>
        </div>
      </section>
    </Layout>
  );
}
