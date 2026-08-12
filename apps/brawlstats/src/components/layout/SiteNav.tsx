import { Link, useRouterState } from "@tanstack/react-router";
import {
  SiteNavigation,
  type SiteNavigationLinkAdapterProps,
} from "@statsconnect/site-nav";
import { PlayerSearch } from "@/components/PlayerSearch";

const links = [
  { href: "/", label: "Home" },
  { href: "/players", label: "Players" },
  { href: "/clubs", label: "Clubs" },
  { href: "/maps", label: "Maps" },
  { href: "/leaderboards", label: "Leaderboards" },
] as const;

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
        <PlayerSearch compact buttonLabel="Search" onNavigate={onNavigate} />
      )}
    />
  );
}
