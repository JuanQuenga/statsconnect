import Link from "@/components/Link";
import Image from "@/components/Image";
import { ProfileSearch } from "@/components/portfolio/ProfileSearch";
import { supportedLocales, useI18n, type Locale } from "@/lib/i18n";
import { useRouterState } from "@tanstack/react-router";
import {
  SiteNavigation,
  siteNavigationLanguages,
  type SiteNavigationLinkAdapterProps,
} from "@statsconnect/site-nav";
import { useStatsConnectAuth } from "@statsconnect/auth";
import { CommunityLinks, CommunityRequest } from "@statsconnect/monetization";

const statsConnectOrigin = (
  import.meta.env.VITE_STATSCONNECT_ORIGIN?.trim() ||
  import.meta.env.NEXT_PUBLIC_STATSCONNECT_ORIGIN?.trim()
);
const creatorCode = import.meta.env.VITE_SUPERCELL_CREATOR_CODE?.trim();
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

function ClashRoyaleLink({ children, className, href, onNavigate }: SiteNavigationLinkAdapterProps) {
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const arenaTransitionClass = arenaTransitionFor(pathname);

  const navItems = [
    { href: "/", label: t("nav.home"), icon: <Image src="/images/icons/blue-wide.png" alt="" width={27} height={27} /> },
    { href: "/meta", label: t("nav.meta") },
    { href: "/leaderboards", label: t("nav.leaderboards"), mobileLabel: locale === "es" ? "Clasif." : "Ranks", icon: <Image src="/images/ui-icons/trophies.png" alt="" width={27} height={27} /> },
    { href: "/cards", label: t("nav.cards"), icon: <Image src="/images/icons/book-cards.png" alt="" width={27} height={27} /> },
    { href: "/decks", label: t("nav.decks"), mobileLabel: locale === "es" ? "Mazos" : "Decks", icon: <Image src="/images/icons/cardsq.png" alt="" width={27} height={27} /> },
    { href: "/history", label: "History" },
    { href: "/news", label: t("nav.news") },
    { href: "/tools", label: t("nav.tools") },
  ];

  return (
    <div className={`site-frame site-frame-clash ${variant === "home" ? "site-frame-home" : ""} ${arenaTransitionClass}`}>
      <div className="site-arena-backdrop" aria-hidden="true" />
      <a
        href="#maincontent"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <SiteNavigation
        accentColor="#4fc8ff"
        currentSite="clash-royale"
        account={auth.account ? {
          avatarUrl: auth.account.image ?? undefined,
          displayName: auth.account.name,
          email: auth.account.email,
          onSignOut: () => void auth.signOut(),
        } : undefined}
        authAction={!auth.account && !auth.isLoading ? {
          label: "Sign in",
          onClick: () => void auth.signIn(),
        } : undefined}
        hubOrigin={statsConnectOrigin}
        profiles={auth.profiles}
        linkAdapter={ClashRoyaleLink}
        links={navItems}
        language={{
          label: t("locale.label"),
          value: locale,
          options: siteNavigationLanguages.filter((option) => supportedLocales.includes(option.value as Locale)),
          onChange: (value) => setLocale(value as Locale),
        }}
        renderSearch={(onNavigate) => (
          <div className="nav-search-tools">
            <ProfileSearch compact onNavigate={onNavigate} />
          </div>
        )}
      />
      <main id="maincontent" tabIndex={-1}>{children}</main>
      <CommunityRequest
        supportUrl={import.meta.env.VITE_STATSCONNECT_SUPPORT_URL}
        monthlySupportUrl={import.meta.env.VITE_STATSCONNECT_MONTHLY_SUPPORT_URL}
        supportPortalUrl={import.meta.env.VITE_STATSCONNECT_SUPPORT_PORTAL_URL}
        locale={locale}
      />
      <SiteFooter />
    </div>
  );
}

const FOOTER_COLUMNS = [
  {
    title: "Explore",
    links: [
      { href: "/leaderboards", label: "Leaderboards" },
      { href: "/meta", label: "Meta Report" },
      { href: "/history", label: "History" },
    ],
  },
  {
    title: "Build",
    links: [
      { href: "/cards", label: "Card Library" },
      { href: "/decks", label: "Decks" },
      { href: "/tools", label: "Tools" },
    ],
  },
  {
    title: "Discover",
    links: [
      { href: "/news", label: "News" },
      { href: "/tournaments", label: "Tournaments" },
    ],
  },
  {
    title: "StatsConnect",
    links: [
      { href: "https://statsconnect.app/about", label: "About" },
      { href: "https://statsconnect.app/faq", label: "FAQ" },
      { href: "https://statsconnect.app/privacy", label: "Privacy policy" },
      { href: "https://statsconnect.app/terms", label: "Terms" },
      { href: "https://statsconnect.app/contact", label: "Contact" },
    ],
  },
];

/** The classic r/ClashRoyale footer: link columns around the King on the
 *  arena wall, legal copy resting on the lances. */
function SiteFooter() {
  const { t, locale } = useI18n();
  const columns = FOOTER_COLUMNS.map((column) => (
    <div key={column.title} className="cr-footer-col">
      <strong>{column.title}</strong>
      <ul>
        {column.links.map((link) => (
          <li key={link.href}>
            {link.href.startsWith("http") ? <a href={link.href}>{link.label}</a> : <Link href={link.href}>{link.label}</Link>}
          </li>
        ))}
      </ul>
    </div>
  ));

  return (
    <footer className="cr-footer">
      <div className="cr-footer-columns">
        {columns.slice(0, 2)}
        <Image className="cr-footer-king" src="/images/theme/subreddit/footer-king-upscaled.webp" alt="" width={123} height={205} />
        {columns.slice(2)}
      </div>
      <div className="cr-footer-legal">
        <CommunityLinks
          supportUrl={import.meta.env.VITE_STATSCONNECT_SUPPORT_URL}
          monthlySupportUrl={import.meta.env.VITE_STATSCONNECT_MONTHLY_SUPPORT_URL}
          supportPortalUrl={import.meta.env.VITE_STATSCONNECT_SUPPORT_PORTAL_URL}
          locale={locale}
        />
        {creatorCode ? <p>Support this site in the Clash Royale Shop with creator code <strong>{creatorCode}</strong>.</p> : null}
        <p>
          {t("footer.disclaimer")} See Supercell&rsquo;s{" "}
          <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noreferrer noopener">
            Fan Content Policy
          </a>
          . © {new Date().getFullYear()} StatsConnect.
        </p>
      </div>
    </footer>
  );
}

export { ProfileSearch };
