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
      className="tile game-channel"
      {...stageLight}
    >
      <img
        src={`/games/generated/${id}-channel.webp`}
        alt=""
        aria-hidden
        loading="lazy"
        className="game-channel__art"
      />
      <span className="game-channel__scrim" aria-hidden />
      <span className="game-channel__label">{id === "clash-royale" ? "Build your next win" : "Know your roster"}</span>
      <div className="game-channel__copy">
        <h2 className="font-display text-3xl font-semibold sm:text-4xl">
          {name}
        </h2>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        <span className="game-channel__action">Connect a profile <ArrowRight className="size-4" aria-hidden /></span>
      </div>
    </Link>
  );
}
