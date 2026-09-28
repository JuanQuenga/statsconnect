import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useStageLight } from "@/components/lobby/ambient";
import type { GameId } from "@/lib/contracts";

/** Opens the connection flow for one game. */
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
      className="game-channel"
      {...stageLight}
    >
      <div className="game-channel__scene">
        <span className="game-channel__wordmark" aria-hidden>{id === "clash-royale" ? "ROYALE" : "BRAWL"}</span>
        <img
          src={`/games/generated/${id}-2026-feature.webp`}
          alt=""
          aria-hidden
          loading="lazy"
          className="game-channel__art"
        />
        <span className="game-channel__scrim" aria-hidden />
        <span className="game-channel__entry" aria-hidden><ArrowRight /></span>
      </div>
      <div className="game-channel__copy">
        <h3>
          {name}
        </h3>
        <p>
          {description}
        </p>
        <span className="game-channel__action">Connect your player <ArrowRight aria-hidden /></span>
      </div>
    </Link>
  );
}
