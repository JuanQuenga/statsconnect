import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useStatsConnectAuth, type ConnectedProfile } from "@statsconnect/auth";
import { gameDestinationPath } from "@statsconnect/site-nav";
import { ArrowRight, Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageStatus } from "@/components/ui-helpers";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { gameName, games } from "@/lib/contracts";

export const Route = createFileRoute("/settings/connections")({
  component: ConnectionsPage,
  head: () => ({ meta: [{ title: "Connections · StatsConnect" }] }),
});

function ConnectionsPage() {
  const auth = useStatsConnectAuth();
  const [pendingDisconnect, setPendingDisconnect] = useState<ConnectedProfile | null>(null);
  const disconnect = useMutation({
    mutationFn: (profile: ConnectedProfile) => auth.removeProfile(profile.game, profile.tag),
    onSuccess: () => setPendingDisconnect(null),
  });

  return (
    <section className="boot-in mx-auto max-w-4xl">
      <p className="eyebrow text-[var(--ambient)]">Settings</p>
      <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
        Connections
      </h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Open, replace, or remove profiles saved in this browser and your signed-in account.
      </p>

      <div className="stagger mt-10 space-y-4">
        {games.map((game) => {
          const profiles = auth.profiles.filter((profile) => profile.game === game.id);
          return (
            <article
              key={game.id}
              data-game={game.id}
              className="connection-row bevel bevel-lg relative overflow-hidden border border-border/60 bg-card/60 p-6 backdrop-blur-sm sm:p-7"
            >
              <img src={`/games/${game.id}.png`} alt="" aria-hidden className="connection-row__art" />
              <span
                className="absolute inset-y-0 left-0 w-1 bg-[var(--game-accent)]"
                style={{ opacity: profiles.length ? 0.8 : 0.2 }}
                aria-hidden
              />
              <div className="relative z-[1] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-xl font-semibold tracking-tight">{game.name}</h2>
                  <Link
                    to="/connect/$game"
                    params={{ game: game.id }}
                    className={buttonVariants({ size: "sm", variant: profiles.length ? "secondary" : "default" })}
                  >
                    <Link2 className="size-3.5" />
                    {profiles.length ? "Connect another" : "Connect"}
                  </Link>
                </div>

                {profiles.length ? profiles.map((profile) => (
                  <div key={profile.tag} className="flex flex-col gap-4 border-t border-border/50 pt-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-lg font-semibold">{profile.name}</p>
                      <p className="mt-1 font-numeric text-base tracking-[0.12em] text-muted-foreground">#{profile.tag}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={gameDestinationPath(game.id, profile.tag)}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <ArrowRight className="size-3.5" />
                        Open
                      </a>
                      <Button size="sm" variant="destructive" onClick={() => setPendingDisconnect(profile)}>
                        <Trash2 className="size-3.5" />
                        Disconnect
                      </Button>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">No connected profiles</p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {auth.profilesStatus === "error" ? (
        <PageStatus tone="error" className="mt-5">
          {auth.profilesError ?? "Connected profiles could not be synchronized."}
        </PageStatus>
      ) : null}
      {disconnect.isError ? (
        <PageStatus tone="error" className="mt-5">
          {disconnect.error.message}
        </PageStatus>
      ) : null}

      <Dialog
        open={pendingDisconnect !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDisconnect(null);
        }}
        title={`Disconnect ${pendingDisconnect ? gameName(pendingDisconnect.game) : "game"}?`}
        description="This profile will be removed from this browser and your signed-in account."
      >
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setPendingDisconnect(null)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!pendingDisconnect || disconnect.isPending}
            onClick={() => {
              if (pendingDisconnect) disconnect.mutate(pendingDisconnect);
            }}
          >
            {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
