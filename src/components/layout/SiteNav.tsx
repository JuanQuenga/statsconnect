import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { GameSwitcher } from "@/components/game-switcher";
import { Button } from "@/components/ui/button";
import { hubQueryOptions } from "@/lib/data-client";

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const hubQuery = useQuery(hubQueryOptions());
  const hub = hubQuery.data ?? { activeProfileId: null, profiles: [] };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <nav className="content-column flex h-14 items-center gap-3 sm:h-16" aria-label="Primary navigation">
        <Link to="/" className="shrink-0 font-display text-lg font-semibold tracking-tight text-foreground no-underline sm:text-xl">StatsConnect</Link>
        <div className="hidden min-w-0 flex-1 items-center gap-3 sm:flex">
          <GameSwitcher hub={hub} />
          <div className="ml-auto flex items-center gap-1">
            <Link to="/connect" className="rounded-lg px-3 py-2 text-sm font-medium no-underline hover:bg-muted">Connect</Link>
            <Link to="/settings/connections" className="rounded-lg px-3 py-2 text-sm font-medium no-underline hover:bg-muted">Settings</Link>
          </div>
        </div>
        <Button className="ml-auto sm:hidden" variant="ghost" size="icon" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Toggle navigation">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </nav>
      {open ? (
        <div className="content-column space-y-2 border-t border-border/50 py-3 sm:hidden">
          <GameSwitcher hub={hub} onNavigate={() => setOpen(false)} />
          <div className="grid grid-cols-2 gap-2">
            <Link to="/connect" onClick={() => setOpen(false)} className="rounded-lg bg-muted px-3 py-2 text-center text-sm font-medium no-underline">Connect</Link>
            <Link to="/settings/connections" onClick={() => setOpen(false)} className="rounded-lg bg-muted px-3 py-2 text-center text-sm font-medium no-underline">Settings</Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
