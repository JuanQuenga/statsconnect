import { Link, useRouterState } from "@tanstack/react-router";
import {
  SiteNavigation,
  type SiteNavigationLinkAdapterProps,
} from "@statsconnect/site-nav";
import { PlayerSearch } from "@/components/PlayerSearch";
import { useI18n } from "@/lib/i18n";

const statsConnectOrigin = import.meta.env.VITE_STATSCONNECT_ORIGIN?.trim();

function BrawlStatsLink({ children, className, href, onNavigate }: SiteNavigationLinkAdapterProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = href === "/" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      to={href as never}
      className={className}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}

export function SiteNav() {
  const { t } = useI18n();
  const links = [
    { href: "/", label: t("home") },
    { href: "/players", label: t("players") },
    { href: "/clubs", label: t("clubs") },
    { href: "/maps", label: t("maps") },
    { href: "/brawlers", label: t("brawlers") },
    { href: "/meta", label: t("meta") },
    { href: "/progression", label: t("progression") },
    { href: "/leaderboards", label: t("leaderboards") },
  ];
  return (
    <SiteNavigation
      accentColor="#f5c85b"
      currentSite="brawl-stars"
      statsConnectOrigin={statsConnectOrigin}
      linkAdapter={BrawlStatsLink}
      links={links}
      brand={
        <Link to="/" aria-label="BrawlStats home">
          <img
            src={`${import.meta.env.BASE_URL}assets/generated/brawlstats-logo.png`}
            alt="BrawlStats"
          />
        </Link>
      }
      renderSearch={(onNavigate) => (
        <PlayerSearch compact buttonLabel={t("search")} onNavigate={onNavigate} />
      )}
    />
  );
}
