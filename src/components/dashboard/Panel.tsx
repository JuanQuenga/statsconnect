import type { ReactNode } from "react";

/**
 * Every dashboard block wears the same console header: a hairline rule, an
 * uppercase label, and an optional count read out like a scoreboard.
 */
export function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section>
      <header className="flex items-center gap-4">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.26em] text-foreground">
          {title}
        </h2>
        {count !== undefined ? (
          <span className="numeric text-xl text-[var(--game-accent)]">
            {String(count).padStart(2, "0")}
          </span>
        ) : null}
        <span className="h-px flex-1 bg-border" aria-hidden />
      </header>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="bevel bevel-sm border border-dashed border-border/70 px-5 py-6 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
