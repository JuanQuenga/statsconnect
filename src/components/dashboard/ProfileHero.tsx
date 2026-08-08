import { Badge } from "@/components/ui/badge";
import type { ProfileSummary } from "@/lib/contracts";
import { gameName } from "@/lib/contracts";

export function ProfileHero({ summary }: { summary: ProfileSummary }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-6 sm:p-8">
      <div className="absolute inset-y-0 left-0 w-1 bg-[var(--game-accent)]" aria-hidden />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {summary.display.avatarUrl ? <img src={summary.display.avatarUrl} alt="" className="size-20 rounded-2xl bg-muted object-contain p-1" /> : <div className="flex size-20 items-center justify-center rounded-2xl bg-muted font-display text-2xl font-semibold">{summary.display.name.slice(0, 1).toUpperCase()}</div>}
        <div className="min-w-0 flex-1"><p className="eyebrow">{gameName(summary.game)}</p><h1 className="mt-2 truncate font-display text-3xl font-semibold tracking-tight sm:text-4xl">{summary.display.name}</h1><div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span>{summary.playerTag}</span>{summary.display.affiliation ? <Badge variant="outline">{summary.display.affiliation.name}</Badge> : null}</div></div>
        {summary.display.headline ? <div className="sm:text-right"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{summary.display.headline.label}</p><p className="mt-1 font-display text-3xl font-semibold text-[var(--game-accent)]">{summary.display.headline.value.toLocaleString()}</p></div> : null}
      </div>
    </section>
  );
}
