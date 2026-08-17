import { Link, useRouterState } from "@tanstack/react-router";
import {
  SiteNavigation,
  type SiteNavigationLinkAdapterProps,
} from "@statsconnect/site-nav";
import { useStatsConnectAuth } from "@statsconnect/auth";
import { useEffect, useState } from "react";
import { Mark, Wordmark } from "@/components/brand/Mark";

const links = [
  { href: "/", label: "Lobby" },
  { href: "/connect", label: "Connect" },
  { href: "/settings/connections", label: "Settings" },
] as const;

function StatsConnectLink({ children, className, href, onNavigate }: SiteNavigationLinkAdapterProps) {
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
  return (
    <SiteNavigation
      accentColor="var(--ambient)"
      currentSite="statsconnect"
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
      hubOrigin={window.location.origin}
      profiles={auth.profiles}
      linkAdapter={StatsConnectLink}
      links={links}
      brand={
        <Link to="/" aria-label="StatsConnect home" className="flex items-center gap-3">
          <Mark className="size-9" />
          <Wordmark className="hidden sm:inline" />
        </Link>
      }
      endContent={<LiveDataStatus />}
    />
  );
}

function LiveDataStatus() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="hub-nav-status" title={`Updated ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}>
      <i aria-hidden /> Live data
    </span>
  );
}
