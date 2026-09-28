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
      <span className="game-channel__index" aria-hidden>{id === "clash-royale" ? "01" : "02"}</span>
      <div className="game-channel__copy">
        <h3>
          {name}
        </h3>
        <p>
          {description}
        </p>
        <span className="game-channel__action">Connect a profile <ArrowRight aria-hidden /></span>
      </div>
    </Link>
  );
}
