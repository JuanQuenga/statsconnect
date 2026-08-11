import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Clock3, Play, Plus } from "lucide-react";
import { useStageLight } from "@/components/lobby/ambient";
import { TileNav } from "@/components/lobby/TileNav";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { ConnectedProfile, HubState } from "@/lib/contracts";
import { gameName, games } from "@/lib/contracts";
import { dataClient } from "@/lib/data-client";
import { hubLaunchPath } from "@/lib/destinations";

export function ConnectedGameBoard({ hub }: { hub: HubState }) {
  const queryClient = useQueryClient();
  const activeMutation = useMutation({
    mutationFn: dataClient.setActive,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hub-state"] }),
  });
  const activeProfile =
    hub.profiles.find((profile) => profile.id === hub.activeProfileId) ??
    hub.profiles[0];
  const otherProfiles = hub.profiles.filter(
    (profile) => profile.id !== activeProfile?.id,
  );
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
          <span className="text-2xl text-muted-foreground/30">
            {" "}
            / {String(games.length).padStart(2, "0")}
          </span>
        </p>
      </header>

      {activeProfile ? (
        <ActiveProfileHero
          profile={activeProfile}
          onOpen={() => activeMutation.mutate(activeProfile.id)}
        />
      ) : null}

      <TileNav className="stagger grid gap-6 md:grid-cols-2">
        {otherProfiles.map((profile) => (
          <ProfileTile
            key={profile.id}
            profile={profile}
            active={false}
            onOpen={() => activeMutation.mutate(profile.id)}
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
              src={`/games/${game.id}.png`}
              alt=""
              aria-hidden
              loading="lazy"
              className="tile-art tile-art-faded"
            />
            <Plus
              className="relative mx-auto size-8 text-muted-foreground"
              aria-hidden
            />
            <p className="relative font-display text-lg font-semibold uppercase tracking-[0.16em]">
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

function ActiveProfileHero({
  profile,
  onOpen,
}: {
  profile: ConnectedProfile;
  onOpen: () => void;
}) {
  const stageLight = useStageLight(profile.game);
  return (
    <a
      data-game={profile.game}
      href={hubLaunchPath(profile.game)}
      onClick={onOpen}
      className="tile bevel bevel-lg relative flex flex-col gap-8 overflow-hidden border border-border/60 bg-card/70 p-7 no-underline backdrop-blur-sm sm:p-10 lg:flex-row lg:items-center lg:gap-12"
      {...stageLight}
    >
      <span className="tile-glow" aria-hidden />
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[var(--game-accent)]"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full opacity-25 blur-3xl"
        style={{ backgroundColor: "var(--game-accent)" }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -bottom-24 left-1/3 size-72 rounded-full opacity-15 blur-3xl"
        style={{ backgroundColor: "var(--game-accent-2)" }}
        aria-hidden
      />

      <div className="relative flex min-w-0 flex-1 items-center gap-5 sm:gap-7">
        {profile.display.avatarUrl ? (
          <img
            src={profile.display.avatarUrl}
            alt=""
            className="bevel bevel-sm size-28 shrink-0 border border-border/70 bg-black/40 object-contain p-2 sm:size-32 md:size-36"
          />
        ) : (
          <div className="bevel bevel-sm grid size-28 shrink-0 place-items-center border border-border/70 bg-black/40 font-display text-5xl font-bold text-[var(--game-accent)] sm:size-32 sm:text-6xl md:size-36">
            {profile.display.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="eyebrow text-[var(--game-accent)]">
            {gameName(profile.game)}
          </p>
          <h2 className="mt-2 truncate font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl md:text-6xl">
            {profile.display.name}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="font-numeric text-xl tracking-[0.14em] text-muted-foreground">
              {profile.playerTag}
            </span>
            {profile.display.affiliation ? (
              <Badge variant="outline">{profile.display.affiliation.name}</Badge>
            ) : null}
            <Badge>Active</Badge>
          </div>
        </div>
      </div>

      <div className="relative flex shrink-0 flex-col gap-6 sm:flex-row sm:items-end lg:flex-col lg:items-end">
        {profile.display.headline ? (
          <div className="lg:text-right">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {profile.display.headline.label}
            </p>
            <p className="numeric mt-2 text-6xl text-[var(--game-accent)] sm:text-7xl md:text-8xl">
              {profile.display.headline.value.toLocaleString()}
            </p>
          </div>
        ) : null}
        <span className={buttonVariants({ size: "lg" })}>
          Launch {gameName(profile.game)}
          <Play className="size-4 fill-current" aria-hidden />
        </span>
      </div>
    </a>
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
    <a
      data-tile
      data-game={profile.game}
      href={hubLaunchPath(profile.game)}
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
          <p className="eyebrow text-[var(--game-accent)]">
            {gameName(profile.game)}
          </p>
          <h2 className="mt-2 truncate font-display text-3xl font-bold tracking-tight">
            {profile.display.name}
          </h2>
          <p className="mt-1 truncate font-numeric text-lg tracking-wider text-muted-foreground">
            {profile.playerTag}
            {profile.display.affiliation
              ? ` · ${profile.display.affiliation.name}`
              : ""}
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
    </a>
  );
}
