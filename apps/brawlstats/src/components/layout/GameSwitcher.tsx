import { ChevronDown, Crown, Gamepad2, Home, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statsConnectOrigin = (
  import.meta.env.VITE_STATSCONNECT_ORIGIN?.trim() || "https://statsconnect.com"
).replace(/\/$/, "");

const games = [
  { id: "statsconnect", label: "StatsConnect", detail: "Game hub", href: `${statsConnectOrigin}/`, icon: Home },
  { id: "brawl-stars", label: "Brawl Stars", detail: "Current game", href: `${statsConnectOrigin}/launch/brawl-stars`, icon: Star },
  { id: "clash-royale", label: "Clash Royale", detail: "Open ClashCrown", href: `${statsConnectOrigin}/launch/clash-royale`, icon: Crown },
] as const;

export function GameSwitcher() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2 bg-transparent font-medium" />
        }
      >
        <Gamepad2 className="size-4 text-primary" aria-hidden />
        Games
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-64 p-1.5" align="start" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>StatsConnect games</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {games.map((game) => {
            const Icon = game.icon;
            const current = game.id === "brawl-stars";
            return (
              <DropdownMenuItem
                key={game.id}
                render={<a href={game.href} />}
                aria-current={current ? "page" : undefined}
                className="gap-3 px-2.5 py-2.5 aria-[current=page]:bg-primary/10"
              >
                <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="block font-medium text-foreground">{game.label}</span>
                  <span className="block text-xs text-muted-foreground">{game.detail}</span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
