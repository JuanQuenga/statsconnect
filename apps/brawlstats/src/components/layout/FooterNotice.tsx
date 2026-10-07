import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { CommunityLinks } from "@statsconnect/monetization";

const creatorCode = import.meta.env.VITE_SUPERCELL_CREATOR_CODE?.trim();

const siteLinks = [
  { href: "https://statsconnect.app/about", label: "About" },
  { href: "https://statsconnect.app/faq", label: "FAQ" },
  { href: "https://statsconnect.app/privacy", label: "Privacy policy" },
  { href: "https://statsconnect.app/terms", label: "Terms" },
  { href: "https://statsconnect.app/contact", label: "Contact" },
];

export function FooterNotice() {
  const { t, locale } = useI18n();
  const policy = t("footer.policy");
  const [legalBefore, legalAfter] = t("footer.legal", { policy }).split(policy);
  const exploreLinks = [
    { to: "/players", label: t("nav.players") },
    { to: "/clubs", label: t("nav.clubs") },
    { to: "/brawlers", label: t("nav.brawlers") },
    { to: "/maps", label: t("nav.maps") },
    { to: "/meta", label: t("nav.meta") },
    { to: "/leaderboards", label: t("nav.leaderboards") },
    { to: "/settings", label: t("nav.settings") },
  ] as const;

  return (
    <footer className="mt-auto border-t-[3px] border-[var(--ink)] bg-[#081230]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-12 pb-8 text-sm text-muted-foreground md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)] md:px-6">
        <div className="max-w-md">
          <p className="font-display text-2xl text-foreground">
            StatsConnect <span className="text-primary">Brawl Stars</span>
          </p>
          <p className="mt-3 leading-relaxed">{t("footer.description")}</p>
          {creatorCode ? (
            <p className="mt-3 text-xs">
              Support this site in the Brawl Stars Shop with creator code{" "}
              <strong className="font-semibold text-foreground">{creatorCode}</strong>.
            </p>
          ) : null}
        </div>
        <nav aria-label="Brawl Stars pages">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2">
            {exploreLinks.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="hover:text-foreground">{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="StatsConnect">
          <ul className="grid gap-2">
            {siteLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="hover:text-foreground">{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mx-auto max-w-7xl border-t border-border/60 px-4 pt-5 pb-8 text-xs leading-relaxed text-muted-foreground md:px-6">
        <CommunityLinks
          supportUrl={import.meta.env.VITE_STATSCONNECT_SUPPORT_URL}
          monthlySupportUrl={import.meta.env.VITE_STATSCONNECT_MONTHLY_SUPPORT_URL}
          supportPortalUrl={import.meta.env.VITE_STATSCONNECT_SUPPORT_PORTAL_URL}
          locale={locale}
        />
        <p className="mt-3 max-w-3xl">
          {legalBefore}
          <a
            className="text-accent underline-offset-2 hover:underline"
            href="https://supercell.com/en/fan-content-policy/"
            target="_blank"
            rel="noreferrer"
          >
            {policy}
          </a>
          {legalAfter}
        </p>
      </div>
    </footer>
  );
}
