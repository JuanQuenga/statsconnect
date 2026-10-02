import { useI18n } from "@/lib/i18n";
import { CommunityLinks } from "@statsconnect/monetization";

const creatorCode = import.meta.env.VITE_SUPERCELL_CREATOR_CODE?.trim();

export function FooterNotice() {
  const { t, locale } = useI18n();
  const policy = t("footer.policy");
  return (
    <footer className="mt-auto border-t border-border bg-card/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-end md:justify-between md:px-6">
        <div>
          <p className="font-display text-base text-foreground">StatsConnect</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Brawl Stars statistics</p>
          <p className="mt-3 max-w-xl">
            {t("footer.description")}
          </p>
          {creatorCode ? <p className="mt-3 text-xs text-muted-foreground">Support this site in the Brawl Stars Shop with creator code <strong className="font-semibold text-foreground">{creatorCode}</strong>.</p> : null}
          <CommunityLinks
            supportUrl={import.meta.env.VITE_STATSCONNECT_SUPPORT_URL}
            monthlySupportUrl={import.meta.env.VITE_STATSCONNECT_MONTHLY_SUPPORT_URL}
            supportPortalUrl={import.meta.env.VITE_STATSCONNECT_SUPPORT_PORTAL_URL}
            locale={locale}
          />
        </div>
        <div className="text-xs leading-relaxed md:max-w-sm md:text-right">
          <a className="text-accent underline-offset-2 hover:underline" href="https://statsconnect.app/privacy">Privacy policy</a>
          <p className="mt-2">
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
      </div>
    </footer>
  );
}
