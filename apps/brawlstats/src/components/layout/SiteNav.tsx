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
    { href: "/", label: t("nav.home") },
    { href: "/players", label: t("nav.players") },
    { href: "/clubs", label: t("nav.clubs") },
    { href: "/maps", label: t("nav.maps") },
    { href: "/brawlers", label: t("nav.brawlers") },
    { href: "/meta", label: t("nav.meta") },
    { href: "/progression", label: t("nav.progression") },
    { href: "/leaderboards", label: t("nav.leaderboards") },
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
        <PlayerSearch compact buttonLabel={t("common.search")} onNavigate={onNavigate} />
      )}
    />
  );
}
