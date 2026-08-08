import type { ReactNode } from "react";
import type { GameId } from "@/lib/contracts";

export function GameDashboardFrame({ game, children }: { game: GameId; children: ReactNode }) {
  return <div data-game={game} className="fade-in space-y-8">{children}</div>;
}
