import Image from "@/components/Image";
import Link from "@/components/Link";
import { ProfileSearch } from "@/components/portfolio/ProfileSearch";
import { supportedLocales, useI18n, type Locale } from "@/lib/i18n";
import { useRouterState } from "@tanstack/react-router";
import {
  saveSharedProfile,
  SiteNavigation,
  siteNavigationLanguages,
  type SiteNavigationLinkAdapterProps,
} from "@statsconnect/site-nav";
import { useStatsConnectAuth } from "@statsconnect/auth";
import { useEffect } from "react";
import { usePersonalization } from "@/components/personalization/PersonalizationProvider";

const statsConnectOrigin = (
  import.meta.env.VITE_STATSCONNECT_ORIGIN?.trim() ||
  import.meta.env.NEXT_PUBLIC_STATSCONNECT_ORIGIN?.trim()
);
const networkOrigins = {
  "brawl-stars": import.meta.env.VITE_BRAWLSTATS_ORIGIN?.trim() || "https://brawlstats.juanquenga.com",
  "clash-royale": import.meta.env.VITE_CLASHCROWN_ORIGIN?.trim() || "https://clashcrown.juanquenga.com",
} as const;

let arenaRouteState: { pathname: string | null; transitionClass: string } = {
  pathname: null,
  transitionClass: "",
};

function arenaTransitionFor(pathname: string): string {
  if (pathname === arenaRouteState.pathname) return arenaRouteState.transitionClass;

  const previousPathname = arenaRouteState.pathname;
  const isHome = pathname === "/";
  const crossedHomeBoundary = previousPathname !== null && (previousPathname === "/") !== isHome;
  arenaRouteState = {
    pathname,
    transitionClass: crossedHomeBoundary
      ? isHome
        ? "arena-is-pulling-out"
        : "arena-is-pushing-in"
      : "",
  };

  return arenaRouteState.transitionClass;
}

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
  const auth = useStatsConnectAuth();
  const { locale, setLocale, t } = useI18n();
  const personalization = usePersonalization();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const arenaTransitionClass = arenaTransitionFor(pathname);

  useEffect(() => {
    for (const profile of personalization.profiles) {
      if (profile.kind === "players") saveSharedProfile({ game: "clash-royale", tag: profile.tag, name: profile.name });
    }
  }, [personalization.profiles]);

  const navItems = [
    { href: "/", label: t("nav.home") },
    { href: "/meta", label: t("nav.meta") },
    { href: "/leaderboards", label: t("nav.leaderboards") },
    { href: "/history", label: "History" },
    { href: "/cards", label: t("nav.cards") },
    { href: "/decks", label: t("nav.decks") },
    { href: "/clans/search", label: t("nav.clans") },
    { href: "/news", label: t("nav.news") },
    { href: "/guides", label: t("nav.guides") },
    { href: "/tools", label: t("nav.tools") },
  ];

  return (
    <div className={`site-frame ${variant === "home" ? "site-frame-home" : ""} ${arenaTransitionClass}`}>
      <div className="site-arena-backdrop" aria-hidden="true" />
      <a
        href="#maincontent"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <SiteNavigation
        accentColor="#d96bf3"
        currentSite="clash-royale"
        account={auth.account ? {
          avatarUrl: auth.account.image ?? undefined,
          displayName: auth.account.name,
          email: auth.account.email,
          onSignOut: () => void auth.signOut(),
        } : undefined}
        authAction={!auth.account && !auth.isLoading ? {
          label: "Sign in with Google",
          onClick: () => void auth.signInWithGoogle(),
        } : undefined}
        statsConnectOrigin={statsConnectOrigin}
        networkOrigins={networkOrigins}
        linkAdapter={ClashCrownLink}
        links={navItems}
        language={{
          label: t("locale.label"),
          value: locale,
          options: siteNavigationLanguages.filter((option) => supportedLocales.includes(option.value as Locale)),
          onChange: (value) => setLocale(value as Locale),
        }}
        brand={
          <Link href="/" aria-label="Royale Stats home">
            <Image src="/images/logo/royale-stats-wide.png" alt="Royale Stats" width={2143} height={667} priority />
          </Link>
        }
        renderSearch={(onNavigate) => (
          <div className="nav-search-tools">
            <ProfileSearch compact onNavigate={onNavigate} />
          </div>
        )}
      />
      <main id="maincontent" tabIndex={-1}>{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand-row">
          <Link href="/" aria-label="Royale Stats home">
            <Image src="/images/logo/royale-stats-wide.png" alt="Royale Stats" width={2143} height={667} />
          </Link>
          <p>Player profiles, live meta insights, deck tools, and clan intelligence for Clash Royale.</p>
        </div>
        <div className="footer-link-groups">
          <div>
            <strong>Explore</strong>
            <Link href="/leaderboards">Leaderboards</Link>
            <Link href="/meta">Meta Report</Link>
            <Link href="/players">Player Lookup</Link>
          </div>
          <div>
            <strong>Build</strong>
            <Link href="/cards">Card Library</Link>
            <Link href="/decks">Deck Discovery</Link>
            <Link href="/tools">{t("nav.tools")}</Link>
          </div>
          <div>
            <strong>Discover</strong>
            <Link href="/clans/search">Clan Search</Link>
            <Link href="/news">{t("nav.news")}</Link>
            <Link href="/guides">{t("nav.guides")}</Link>
          </div>
        </div>
        <div className="footer-legal">
          <p>
            {t("footer.disclaimer")} See Supercell&rsquo;s{" "}
            <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noreferrer noopener">
              Fan Content Policy
            </a>.
          </p>
          <p>© {new Date().getFullYear()} Royale Stats.</p>
        </div>
      </div>
    </footer>
  );
}

export { ProfileSearch };
