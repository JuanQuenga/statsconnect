import { Outlet, createRootRoute } from "@tanstack/react-router";
import Link from "@/components/Link";
import { Layout } from "@/components/portfolio/Layout";

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFoundPage,
});

function NotFoundPage() {
  return (
    <Layout>
      <div className="data-state">
        <h1>Page not found</h1>
        <p>The arena you requested does not exist.</p>
        <Link href="/" className="pink-button">Return home</Link>
      </div>
    </Layout>
  );
}
