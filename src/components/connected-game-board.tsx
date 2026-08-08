import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Clock3, Play, Plus } from "lucide-react";
import { useStageLight } from "@/components/lobby/ambient";
import { TileNav } from "@/components/lobby/TileNav";
import { Badge } from "@/components/ui/badge";
import type { ConnectedProfile, HubState } from "@/lib/contracts";
import { gameName, games } from "@/lib/contracts";
import { dataClient } from "@/lib/data-client";
import { normalizeTag } from "@/lib/tags";

export function ConnectedGameBoard({ hub }: { hub: HubState }) {
  const queryClient = useQueryClient();
  const activeMutation = useMutation({
    mutationFn: dataClient.setActive,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hub-state"] }),
  });
  const unconnected = games.filter(
    (game) => !hub.profiles.some((profile) => profile.game === game.id),
  );

  return (
    <section className="space-y-10">
      <header className="boot-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-[var(--ambient)]">Lobby</p>
          <h1 className="mt-3 font-display text-4xl font-bold uppercase tracking-[0.02em] sm:text-5xl">
            Select a profile
          </h1>
        </div>
        <p className="numeric text-5xl text-muted-foreground/50 sm:text-6xl">
          {String(hub.profiles.length).padStart(2, "0")}
          <span className="text-2xl text-muted-foreground/30"> / {String(games.length).padStart(2, "0")}</span>
        </p>
      </header>

      <TileNav className="stagger grid gap-6 md:grid-cols-2">
        {hub.profiles.map((profile) => (
          <ProfileTile
            key={profile.id}
            profile={profile}
            active={profile.id === hub.activeProfileId}
            onOpen={() => activeMutation.mutate(profile.id)}
          />
        ))}
        {unconnected.map((game) => (
          <Link
            key={game.id}
            data-tile
            to="/connect/$game"
            params={{ game: game.id }}
            className="tile bevel bevel-lg flex min-h-[210px] flex-col justify-center gap-3 border border-dashed border-border/70 bg-white/[0.015] p-8 text-center"
          >
            <Plus className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="font-display text-lg font-semibold uppercase tracking-[0.16em]">
              Connect {game.name}
            </p>
            <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
              {game.description}
            </p>
          </Link>
        ))}
      </TileNav>
    </section>
  );
}

function ProfileTile({
  profile,
  active,
  onOpen,
}: {
  profile: ConnectedProfile;
  active: boolean;
  onOpen: () => void;
}) {
  const stageLight = useStageLight(profile.game);
  return (
    <Link
      data-tile
      data-game={profile.game}
      to="/games/$game/$tag"
      params={{ game: profile.game, tag: normalizeTag(profile.playerTag) }}
      onClick={onOpen}
      className="tile bevel bevel-lg relative flex min-h-[210px] flex-col justify-between overflow-hidden border border-border/60 bg-card/70 p-7 backdrop-blur-sm"
      {...stageLight}
    >
      <span className="tile-glow" aria-hidden />
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[var(--game-accent)] opacity-60"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -right-16 -top-16 size-52 rounded-full opacity-25 blur-3xl"
        style={{ backgroundColor: "var(--game-accent)" }}
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-[var(--game-accent)]">{gameName(profile.game)}</p>
          <h2 className="mt-2 truncate font-display text-3xl font-bold tracking-tight">
            {profile.display.name}
          </h2>
          <p className="mt-1 truncate font-numeric text-lg tracking-wider text-muted-foreground">
            {profile.playerTag}
            {profile.display.affiliation ? ` · ${profile.display.affiliation.name}` : ""}
          </p>
        </div>
        {active ? <Badge>Active</Badge> : null}
      </div>

      <div className="relative mt-6 flex flex-wrap items-end justify-between gap-4">
        {profile.display.headline ? (
          <p className="leading-none">
            <span className="numeric block text-6xl text-[var(--game-accent)] sm:text-7xl">
              {profile.display.headline.value.toLocaleString()}
            </span>
            <span className="mt-2 block text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {profile.display.headline.label}
            </span>
          </p>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-foreground/80">
          <Play className="size-4 fill-current" aria-hidden />
          Open
        </span>
      </div>

      <p className="relative mt-4 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
        <Clock3 className="size-3" aria-hidden />
        Opened {new Date(profile.updatedAt).toLocaleDateString()}
      </p>
    </Link>
  );
}
