export function FooterNotice() {
  return (
    <footer className="mt-auto border-t border-border/50">
      <div className="content-column flex flex-col gap-3 py-6 text-center sm:py-8">
        <p className="font-display text-sm font-semibold text-foreground/90">StatsConnect</p>
        <p className="mx-auto max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Fan-made hub for viewing connected game statistics. Not affiliated with,
          endorsed, sponsored, or specifically approved by Supercell. Supercell is
          not responsible for this content.
        </p>
      </div>
    </footer>
  );
}
