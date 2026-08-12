import { useI18n } from "@/lib/i18n";

export function FooterNotice() {
  const { t } = useI18n();
  const policy = t("footer.policy");
  return (
    <footer className="mt-auto border-t border-border bg-card/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-end md:justify-between md:px-6">
        <div>
          <p className="font-display text-base text-foreground">BrawlStats.io</p>
          <p className="mt-1 max-w-xl">
            {t("footer.description")}
          </p>
        </div>
        <p className="text-xs leading-relaxed md:max-w-sm md:text-right">
          {t("footer.legal", { policy }).split(policy)[0]}
          <a
            className="text-accent underline-offset-2 hover:underline"
            href="https://supercell.com/en/fan-content-policy/"
            target="_blank"
            rel="noreferrer"
          >
            {policy}
          </a>
          {t("footer.legal", { policy }).split(policy)[1]}
        </p>
      </div>
    </footer>
  );
}
