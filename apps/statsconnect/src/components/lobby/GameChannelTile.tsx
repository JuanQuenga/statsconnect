import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useStageLight } from "@/components/lobby/ambient";
import type { GameId } from "@/lib/contracts";

/** A game that is not connected yet — an unclaimed slot on the lobby wall. */
export function GameChannelTile({
  id,
  name,
  description,
}: {
  id: GameId;
  name: string;
  description: string;
}) {
  const stageLight = useStageLight(id);
  return (
    <Link
      data-tile
      data-game={id}
      to="/connect/$game"
      params={{ game: id }}
      className="tile bevel bevel-lg relative flex items-center gap-5 overflow-hidden border border-border/60 bg-card/60 p-7 backdrop-blur-sm"
      {...stageLight}
    >
      <span className="tile-glow" aria-hidden />
      <img
        src={`/games/${id}.png`}
        alt=""
        aria-hidden
        loading="lazy"
        className="tile-art"
      />
      <span
        className="absolute inset-y-0 left-0 w-1 bg-[var(--game-accent)] opacity-70"
        aria-hidden
      />
      <div className="relative z-[1] min-w-0 flex-1">
        <h2 className="font-display text-2xl font-bold uppercase tracking-[0.04em]">
          {name}
        </h2>
        <p className="mt-2 max-w-[18rem] text-sm leading-relaxed text-muted-foreground sm:max-w-xs">
          {description}
        </p>
      </div>
      <ArrowRight
        className="relative z-[1] size-6 shrink-0 text-[var(--game-accent)]"
        aria-hidden
      />
    </Link>
  );
}
