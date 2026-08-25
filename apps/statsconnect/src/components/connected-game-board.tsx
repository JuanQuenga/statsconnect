import { Link } from "@tanstack/react-router";
import type { ConnectedProfile } from "@statsconnect/auth";
import { gameDestinationPath } from "@statsconnect/site-nav";
import { Play, Plus } from "lucide-react";
import { useStageLight } from "@/components/lobby/ambient";
import { TileNav } from "@/components/lobby/TileNav";
import { buttonVariants } from "@/components/ui/button";
import { handleGameDestinationClick } from "@/lib/application-navigation";
import { gameName, games } from "@/lib/contracts";

export function ConnectedGameBoard({
  profiles,
}: {
  profiles: readonly ConnectedProfile[];
}) {
  const unconnected = games.filter(
    (game) => !profiles.some((profile) => profile.game === game.id),
  );

  return (
    <section className="lobby-stage space-y-10">
      <header className="boot-in flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-4xl font-semibold sm:text-5xl">
            Your connected profiles
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Open a saved player or connect another game below.
          </p>
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          {profiles.length} connected {profiles.length === 1 ? "profile" : "profiles"}
        </p>
      </header>

      <TileNav className="stagger grid gap-6 md:grid-cols-2">
        {profiles.map((profile) => (
          <ProfileTile
            key={`${profile.game}:${profile.tag}`}
            profile={profile}
          />
        ))}
        {unconnected.map((game) => (
          <Link
            key={game.id}
            data-tile
            data-game={game.id}
            to="/connect/$game"
            params={{ game: game.id }}
            className="tile bevel bevel-lg relative flex min-h-[210px] flex-col justify-center gap-3 overflow-hidden border border-dashed border-border/70 bg-white/[0.015] p-8 text-center"
          >
            <img
              src={`/games/generated/${game.id}-channel.webp`}
              alt=""
              aria-hidden
              loading="lazy"
              className="channel-art channel-art--faded"
            />
            <span className="channel-art__scrim" aria-hidden />
            <Plus className="relative mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="relative font-display text-lg font-semibold">
              Connect {game.name}
            </p>
            <p className="relative mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
              {game.description}
            </p>
          </Link>
        ))}
      </TileNav>
    </section>
  );
}

function ProfileTile({ profile }: { profile: ConnectedProfile }) {
  const stageLight = useStageLight(profile.game);
  return (
    <a
      data-tile
      data-game={profile.game}
      href={gameDestinationPath(profile.game, profile.tag)}
      className="tile bevel bevel-lg relative flex min-h-[210px] flex-col justify-between overflow-hidden border border-border/60 bg-card/70 p-7 backdrop-blur-sm"
      onClick={(event) => handleGameDestinationClick(event, gameDestinationPath(profile.game, profile.tag))}
      {...stageLight}
    >
      <img
        src={`/games/generated/${profile.game}-channel.webp`}
        alt=""
        aria-hidden
        className="profile-game-art"
      />
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[var(--game-accent)] opacity-60"
        aria-hidden
      />

      <div className="relative min-w-0">
        <p className="eyebrow text-[var(--game-accent)]">{gameName(profile.game)}</p>
        <h2 className="mt-2 truncate font-display text-3xl font-bold tracking-tight">
          {profile.name}
        </h2>
        <p className="mt-1 truncate font-numeric text-lg tracking-wider text-muted-foreground">
          #{profile.tag}
        </p>
      </div>

      <span className={`${buttonVariants({ size: "lg" })} relative mt-8 self-start`}>
        Launch {gameName(profile.game)}
        <Play className="size-4 fill-current" aria-hidden />
      </span>
    </a>
  );
}
