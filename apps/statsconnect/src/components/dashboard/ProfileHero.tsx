import { Badge } from "@/components/ui/badge";
import type { ProfileSummary } from "@/lib/contracts";
import { gameName } from "@/lib/contracts";

export function ProfileHero({ summary }: { summary: ProfileSummary }) {
  return (
    <section className="bevel bevel-lg relative overflow-hidden border border-border/60 bg-card/70 p-7 backdrop-blur-sm sm:p-10">
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[var(--game-accent)]"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full opacity-25 blur-3xl"
        style={{ backgroundColor: "var(--game-accent)" }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -bottom-24 left-1/3 size-72 rounded-full opacity-15 blur-3xl"
        style={{ backgroundColor: "var(--game-accent-2)" }}
        aria-hidden
      />

      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-5">
          {summary.display.avatarUrl ? (
            <img
              src={summary.display.avatarUrl}
              alt=""
              className="bevel bevel-sm size-20 shrink-0 border border-border/70 bg-black/40 object-contain p-2 sm:size-24"
            />
          ) : (
            <div className="bevel bevel-sm grid size-20 shrink-0 place-items-center border border-border/70 bg-black/40 font-display text-3xl font-bold text-[var(--game-accent)] sm:size-24">
              {summary.display.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="eyebrow text-[var(--game-accent)]">
              {gameName(summary.game)}
            </p>
            <h1 className="mt-2 truncate font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              {summary.display.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="font-numeric text-xl tracking-[0.14em] text-muted-foreground">
                {summary.playerTag}
              </span>
              {summary.display.affiliation ? (
                <Badge variant="outline">{summary.display.affiliation.name}</Badge>
              ) : null}
            </div>
          </div>
        </div>

        {summary.display.headline ? (
          <div className="shrink-0 border-t border-border/60 pt-6 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0 lg:text-right">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {summary.display.headline.label}
            </p>
            <p className="numeric mt-3 text-7xl text-[var(--game-accent)] sm:text-8xl">
              {summary.display.headline.value.toLocaleString()}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
