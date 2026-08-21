import { Link, useRouterState } from "@tanstack/react-router";
import {
  SiteNavigation,
  siteNavigationLanguages,
  type SiteNavigationLinkAdapterProps,
} from "@statsconnect/site-nav";
import { useStatsConnectAuth } from "@statsconnect/auth";
import { PlayerSearch } from "@/components/PlayerSearch";
import { useI18n } from "@/lib/i18n";
import { setLocale, supportedLocales, type Locale } from "@/lib/preferences";

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
  const auth = useStatsConnectAuth();
  const { locale, t } = useI18n();
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
      hubOrigin={statsConnectOrigin}
      profiles={auth.profiles}
      linkAdapter={BrawlStatsLink}
      links={links}
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
