import { Link, createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";

export const Route = createFileRoute("/$")({ component: CatchAllPage });

function CatchAllPage() {
  return <section className="fade-in flex min-h-[50vh] flex-col items-center justify-center py-16 text-center"><p className="eyebrow">Page not found</p><h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">This page does not exist</h1><p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">The link may be outdated, or the page has moved.</p><Link to="/" className={`${buttonVariants()} mt-8`}>Back to home</Link></section>;
}
