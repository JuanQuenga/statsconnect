import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [{ title: "StatsConnect" }],
  }),
});

const CATALOG = [
  {
    id: "clash-royale",
    name: "Clash Royale",
    blurb: "Trophies, battles, deck, and chest cycle.",
  },
  {
    id: "brawl-stars",
    name: "Brawl Stars",
    blurb: "Trophies, wins, brawlers, and recent battles.",
  },
] as const;

function HomePage() {
  return (
    <section className="slide-up flex min-h-[58vh] flex-col justify-center gap-14 py-6 sm:gap-16 sm:py-10 md:py-14">
      <div className="max-w-2xl">
        <p className="eyebrow text-primary">StatsConnect</p>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          Your game stats, one hub.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Connect a game profile by player tag and open a single dashboard for
          your stats.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="/connect"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90"
          >
            Connect a game
          </a>
        </div>
      </div>

      <div className="max-w-3xl">
        <p className="eyebrow">Available games</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {CATALOG.map((game) => (
            <li
              key={game.id}
              className="surface-card p-5 transition-colors hover:bg-card/55"
            >
              <p className="font-display text-lg font-semibold text-foreground">
                {game.name}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {game.blurb}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
