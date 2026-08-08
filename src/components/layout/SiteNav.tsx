import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Mark, Wordmark } from "@/components/brand/Mark";
import { GameSwitcher } from "@/components/game-switcher";
import { Button } from "@/components/ui/button";
import { hubQueryOptions } from "@/lib/data-client";

const navLink =
  "relative bevel bevel-sm inline-flex items-center justify-center px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground no-underline transition-colors hover:bg-white/[0.06] hover:text-foreground data-[status=active]:bg-white/[0.08] data-[status=active]:text-foreground";

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const hubQuery = useQuery(hubQueryOptions());
  const hub = hubQuery.data ?? { activeProfileId: null, profiles: [] };

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <nav
        className="content-column flex h-16 items-center gap-4 md:h-[72px]"
        aria-label="Primary navigation"
      >
        <Link
          to="/"
          className="flex shrink-0 items-center gap-3 text-muted-foreground no-underline"
        >
          <Mark className="size-8 md:size-9" />
          <Wordmark className="hidden sm:inline" />
        </Link>

        <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
          <span className="h-6 w-px bg-border" aria-hidden />
          <GameSwitcher hub={hub} />
          <div className="ml-auto flex items-center gap-1">
            <Link to="/" className={navLink} activeOptions={{ exact: true }}>
              Lobby
            </Link>
            <Link to="/connect" className={navLink}>
              Connect
            </Link>
            <Link to="/settings/connections" className={navLink}>
              Settings
            </Link>
            <SystemClock />
          </div>
        </div>

        <Button
          className="ml-auto md:hidden"
          variant="ghost"
          size="icon"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="Toggle navigation"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </nav>

      {open ? (
        <div className="content-column space-y-2 border-t border-border/50 py-4 md:hidden">
          <GameSwitcher hub={hub} onNavigate={() => setOpen(false)} />
          <div className="grid grid-cols-3 gap-2">
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className={navLink}
              activeOptions={{ exact: true }}
            >
              Lobby
            </Link>
            <Link
              to="/connect"
              onClick={() => setOpen(false)}
              className={navLink}
            >
              Connect
            </Link>
            <Link
              to="/settings/connections"
              onClick={() => setOpen(false)}
              className={navLink}
            >
              Settings
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/** Console header staple: the wall clock in the corner of the shell. */
function SystemClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span className="ml-3 hidden items-center gap-2 border-l border-border/70 pl-4 lg:flex">
      <span className="size-1.5 animate-pulse rounded-full bg-[var(--ambient)]" aria-hidden />
      <time
        className="numeric text-xl tracking-wide text-muted-foreground"
        dateTime={now.toISOString()}
      >
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </time>
    </span>
  );
}
