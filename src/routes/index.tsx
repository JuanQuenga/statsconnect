import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [{ title: "StatsConnect" }],
  }),
});

function HomePage() {
  return (
    <section className="flex min-h-[60vh] items-center py-16">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
          StatsConnect
        </p>
        <h1 className="mt-4 font-display text-5xl font-bold md:text-7xl">
          Your game stats, one hub.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          The foundation is ready. Game connections and dashboards arrive in the
          next build phase.
        </p>
      </div>
    </section>
  );
}
