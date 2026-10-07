import { Link, useRouterState } from "@tanstack/react-router";
import {
  SiteNavigation,
  siteNavigationLanguages,
  type SiteNavigationLinkAdapterProps,
} from "@statsconnect/site-nav";
import { useStatsConnectAuth } from "@statsconnect/auth";
import { PlayerSearch } from "@/components/PlayerSearch";
import { useI18n } from "@/lib/i18n";
import { setLocale, supportedLocales, usePreferences, type Locale } from "@/lib/preferences";

const statsConnectOrigin = import.meta.env.VITE_STATSCONNECT_ORIGIN?.trim();
function BrawlStatsLink({ children, className, href, onNavigate }: SiteNavigationLinkAdapterProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = href === "/" ? pathname === href : pathname.startsWith(href);
  const savedProfileTag = href.startsWith("/players?tag=")
    ? new URLSearchParams(href.slice(href.indexOf("?") + 1)).get("tag")
    : null;

  if (savedProfileTag) {
    return (
      <Link to="/players" search={{ tag: savedProfileTag }} className={className} onClick={onNavigate}>
        {children}
      </Link>
    );
  }

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
  const auth = useStatsConnectAuth();
  const { locale, t } = useI18n();
  const preferences = usePreferences();
  const links = [
    { href: "/", label: t("nav.home") },
    { href: "/meta", label: t("nav.meta") },
    { href: "/leaderboards", label: t("nav.leaderboards") },
    { href: "/brawlers", label: t("nav.brawlers") },
    { href: "/maps", label: t("nav.maps") },
    { href: "/progression", label: t("nav.progression") },
    { href: "/assistant", label: t("nav.assistant") },
  ];
  const mobileLinks = [
    ...links,
    { href: "/settings", label: t("nav.settings") },
    ...preferences.savedProfiles.slice(0, 5).map((profile) => ({
      href: `/players?tag=${encodeURIComponent(`#${profile.tag}`)}`,
      label: `${t("nav.savedProfiles")}: ${profile.name || `#${profile.tag}`}`,
    })),
  ];
  return (
    <SiteNavigation
      accentColor="#ffd21f"
      currentSite="brawl-stars"
      account={auth.account ? {
        avatarUrl: auth.account.image ?? undefined,
        displayName: auth.account.name,
        email: auth.account.email,
        onSignOut: () => void auth.signOut(),
      } : undefined}
      authAction={auth.isConfigured && !auth.account && !auth.isLoading ? {
        label: "Sign in",
        onClick: () => void auth.signIn(),
      } : undefined}
      hubOrigin={statsConnectOrigin}
      profiles={auth.profiles}
      linkAdapter={BrawlStatsLink}
      links={links}
      mobileLinks={mobileLinks}
      language={{
        label: t("common.language"),
        value: locale,
        options: siteNavigationLanguages.filter((option) => supportedLocales.includes(option.value as Locale)),
        onChange: (value) => setLocale(value as Locale),
      }}
      renderSearch={(onNavigate) => (
        <PlayerSearch compact buttonLabel={t("common.search")} onNavigate={onNavigate} />
      )}
    />
  );
}
