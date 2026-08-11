export function FooterNotice() {
  return (
    <footer className="mt-auto border-t border-border bg-card/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-end md:justify-between md:px-6">
        <div>
          <p className="font-display text-base text-foreground">BrawlStats.io</p>
          <p className="mt-1 max-w-xl">
            Fan-made statistics for Brawl Stars. Map meta is aggregated from official battle logs collected by
            BrawlStats — not affiliated with Brawlify or Supercell.
          </p>
        </div>
        <p className="text-xs leading-relaxed md:max-w-sm md:text-right">
          Not affiliated with, endorsed, sponsored, or specifically approved by Supercell. See{" "}
          <a
            className="text-accent underline-offset-2 hover:underline"
            href="https://supercell.com/en/fan-content-policy/"
            target="_blank"
            rel="noreferrer"
          >
            Supercell&apos;s Fan Content Policy
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
