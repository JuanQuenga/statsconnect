import Image from "@/components/Image";
import Link from "@/components/Link";
import { ProfileSearch } from "@/components/portfolio/ProfileSearch";
import { useRouterState } from "@tanstack/react-router";
import {
  SiteNavigation,
  type SiteNavigationLinkAdapterProps,
} from "@statsconnect/site-nav";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/meta", label: "Meta" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/history", label: "History" },
  { href: "/cards", label: "Cards" },
  { href: "/decks", label: "Deck Builder" },
  { href: "/clans/search", label: "Clans" },
  { href: "/tournaments", label: "Tournaments" }
];

const statsConnectOrigin = (
  import.meta.env.VITE_STATSCONNECT_ORIGIN?.trim() ||
  import.meta.env.NEXT_PUBLIC_STATSCONNECT_ORIGIN?.trim()
);

function ClashCrownLink({ children, className, href, onNavigate }: SiteNavigationLinkAdapterProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = href === "/" ? pathname === href : pathname.startsWith(href);

  return (
    <Link href={href} className={className} aria-current={active ? "page" : undefined} onClick={onNavigate}>
      {children}
    </Link>
  );
}

export function Layout({ children, variant = "profile" }: { children: React.ReactNode; variant?: "home" | "profile" }) {
  return (
    <div className={`site-frame ${variant === "home" ? "site-frame-home" : ""}`}>
      <SiteNavigation
        accentColor="#ee66ef"
        currentSite="clash-royale"
        statsConnectOrigin={statsConnectOrigin}
        linkAdapter={ClashCrownLink}
        links={navItems}
        brand={
          <Link href="/" aria-label="Clash Crown home">
            <Image src="/images/logo/clash-crown-purple-wide.png" alt="Clash Crown" width={315} height={100} priority />
          </Link>
        }
        renderSearch={(onNavigate) => <ProfileSearch compact onNavigate={onNavigate} />}
      />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="social-row">
          <span>Facebook</span>
          <span>Twitter</span>
          <span>Discord</span>
        </div>
        <div className="footer-links">
          <Link href="/leaderboards">Leaderboards</Link>
          <Link href="/cards">Card Library</Link>
          <Link href="/decks">Deck Builder</Link>
          <Link href="/clans/search">Clan Search</Link>
          <Link href="/tournaments">Tournaments</Link>
          <Link href="/meta">Meta Report</Link>
          <Link href="/players">Player Lookup</Link>
        </div>
        <p>
          This material is unofficial and is not endorsed by Supercell. For more information see Supercell&rsquo;s Fan
          Content Policy:{" "}
          <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noreferrer noopener">
            supercell.com/fan-content-policy
          </a>
          .
        </p>
        <p>© {new Date().getFullYear()} Clash Crown.</p>
      </div>
    </footer>
  );
}

export { ProfileSearch };
