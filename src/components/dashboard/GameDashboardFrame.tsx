import { useEffect, type ReactNode } from "react";
import { useAmbient } from "@/components/lobby/ambient";
import type { GameId } from "@/lib/contracts";

export function GameDashboardFrame({
  game,
  children,
}: {
  game: GameId;
  children: ReactNode;
}) {
  const { lightStage } = useAmbient();
  // Opening a dashboard hands the whole console over to that game's colour.
  useEffect(() => lightStage(game), [game, lightStage]);
  return (
    <div data-game={game} className="fade-in space-y-10">
      {children}
    </div>
  );
}
