import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GameSwitcher } from "@/components/layout/GameSwitcher";
import { PlayerSearch } from "@/components/PlayerSearch";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Home" },
  { to: "/players", label: "Players" },
  { to: "/clubs", label: "Clubs" },
  { to: "/maps", label: "Maps" },
  { to: "/leaderboards", label: "Leaderboards" },
] as const;

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-15 max-w-7xl items-center gap-3 px-4 md:px-6">
        <Link to="/" className="group shrink-0" aria-label="BrawlStats home">
          <img
            src="/assets/generated/brawlstats-logo.png"
            alt="BrawlStats"
            className="h-10 w-auto transition-transform group-hover:scale-[1.02] md:h-11"
          />
        </Link>

        <div className="hidden md:block">
          <GameSwitcher />
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground [&.active]:bg-secondary [&.active]:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <PlayerSearch compact className="ml-auto hidden max-w-sm flex-1 lg:flex" />

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="ml-auto md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X /> : <Menu />}
        </Button>
      </div>

      <div className={cn("border-t border-border bg-background px-4 py-4 md:hidden", open ? "block" : "hidden")}>
        <div className="mb-3">
          <GameSwitcher />
        </div>
        <PlayerSearch compact className="mb-3" buttonLabel="Go" onNavigate={() => setOpen(false)} />
        <div className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
