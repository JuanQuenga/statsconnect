import { ChevronDown, Crown, Gamepad2, House, Star } from "lucide-react";

const statsConnectOrigin = (
  import.meta.env.VITE_STATSCONNECT_ORIGIN?.trim() ||
  import.meta.env.NEXT_PUBLIC_STATSCONNECT_ORIGIN?.trim() ||
  "https://statsconnect.com"
).replace(/\/$/, "");

const games = [
  { id: "statsconnect", label: "StatsConnect", detail: "Game hub", href: `${statsConnectOrigin}/`, icon: House },
  { id: "brawl-stars", label: "Brawl Stars", detail: "Open BrawlStats", href: `${statsConnectOrigin}/launch/brawl-stars`, icon: Star },
  { id: "clash-royale", label: "Clash Royale", detail: "Current game", href: `${statsConnectOrigin}/launch/clash-royale`, icon: Crown },
] as const;

export function GameSwitcher() {
  return (
    <details className="game-switcher">
      <summary>
        <Gamepad2 aria-hidden />
        <span>Games</span>
        <ChevronDown className="game-switcher-chevron" aria-hidden />
      </summary>
      <nav className="game-switcher-menu" aria-label="StatsConnect games">
        {games.map((game) => {
          const Icon = game.icon;
          const current = game.id === "clash-royale";
          return (
            <a key={game.id} href={game.href} aria-current={current ? "page" : undefined}>
              <Icon aria-hidden />
              <span>
                <strong>{game.label}</strong>
                <small>{game.detail}</small>
              </span>
            </a>
          );
        })}
      </nav>
    </details>
  );
}
