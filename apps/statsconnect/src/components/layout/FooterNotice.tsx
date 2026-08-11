const hints: ReadonlyArray<{ key: string; label: string }> = [
  { key: "◀ ▶", label: "Browse" },
  { key: "Enter", label: "Select" },
  { key: "Tab", label: "Next panel" },
];

export function FooterNotice() {
  return (
    <footer className="relative z-10 mt-auto border-t border-border/50 bg-background/60 backdrop-blur-xl">
      <div className="content-column flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {hints.map((hint) => (
            <li key={hint.key} className="flex items-center gap-2">
              <kbd className="bevel bevel-sm border border-border/70 bg-white/[0.04] px-2 py-1 font-display text-[11px] font-semibold tracking-wider text-foreground/80">
                {hint.key}
              </kbd>
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {hint.label}
              </span>
            </li>
          ))}
        </ul>
        <p className="max-w-2xl text-[11px] leading-relaxed text-muted-foreground/80 md:text-right">
          Fan-made hub for viewing connected game statistics. Not affiliated with,
          endorsed, sponsored, or specifically approved by Supercell. Supercell is
          not responsible for this content.
        </p>
      </div>
    </footer>
  );
}
