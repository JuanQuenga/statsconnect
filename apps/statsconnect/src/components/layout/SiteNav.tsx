import { Link, useRouterState } from "@tanstack/react-router";
import {
  SiteNavigation,
  type SiteNavigationLinkAdapterProps,
} from "@statsconnect/site-nav";
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
  return (
    <SiteNavigation
      accentColor="var(--ambient)"
      currentSite="statsconnect"
      linkAdapter={StatsConnectLink}
      links={links}
      brand={
        <Link to="/" aria-label="StatsConnect home" className="flex items-center gap-3">
          <Mark className="size-9" />
          <Wordmark className="hidden sm:inline" />
        </Link>
      }
      endContent={<SystemClock />}
    />
  );
}

function SystemClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <time className="numeric text-lg text-muted-foreground" dateTime={now.toISOString()}>
      {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}
