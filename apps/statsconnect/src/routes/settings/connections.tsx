import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import { ErrorState, LoadingState, PageStatus } from "@/components/ui-helpers";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { ConnectedProfile } from "@/lib/contracts";
import { gameName, games } from "@/lib/contracts";
import { dataClient, hubQueryOptions } from "@/lib/data-client";
import { hubLaunchPath } from "@/lib/destinations";

export const Route = createFileRoute("/settings/connections")({
  component: ConnectionsPage,
  head: () => ({ meta: [{ title: "Connections · StatsConnect" }] }),
});

function ConnectionsPage() {
  const queryClient = useQueryClient();
  const hubQuery = useQuery(hubQueryOptions());
  const [pendingDisconnect, setPendingDisconnect] =
    useState<ConnectedProfile | null>(null);
  const setActive = useMutation({
    mutationFn: dataClient.setActive,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hub-state"] }),
  });
  const disconnect = useMutation({
    mutationFn: dataClient.disconnect,
    onSuccess: async () => {
      setPendingDisconnect(null);
      await queryClient.invalidateQueries({ queryKey: ["hub-state"] });
    },
  });

  if (hubQuery.isPending) return <LoadingState label="Loading connections" />;
  if (hubQuery.isError)
    return (
      <ErrorState title="Connections unavailable" detail={hubQuery.error.message} />
    );

  return (
    <section className="boot-in mx-auto max-w-4xl">
      <p className="eyebrow text-[var(--ambient)]">Settings</p>
      <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
        Connections
      </h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Open, replace, or remove the game profiles connected to this browser.
      </p>

      <div className="stagger mt-10 space-y-4">
        {games.map((game) => {
          const profile = hubQuery.data.profiles.find(
            (entry) => entry.game === game.id,
          );
          return (
            <article
              key={game.id}
              data-game={game.id}
              className="connection-row bevel bevel-lg relative overflow-hidden border border-border/60 bg-card/60 p-6 backdrop-blur-sm sm:p-7"
            >
              <img
                src={`/games/${game.id}.png`}
                alt=""
                aria-hidden
                className="connection-row__art"
              />
              <span
                className="absolute inset-y-0 left-0 w-1 bg-[var(--game-accent)]"
                style={{ opacity: profile ? 0.8 : 0.2 }}
                aria-hidden
              />
              <div className="relative z-[1] flex flex-col gap-6 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-display text-xl font-semibold tracking-tight">
                      {game.name}
                    </h2>
                    {profile?.id === hubQuery.data.activeProfileId ? (
                      <Badge>Active</Badge>
                    ) : null}
                  </div>
                  {profile ? (
                    <>
                      <p className="mt-3 truncate font-display text-lg font-semibold">
                        {profile.display.name}
                      </p>
                      <p className="mt-1 font-numeric text-base tracking-[0.12em] text-muted-foreground">
                        {profile.playerTag} · SYNCED{" "}
                        {new Date(profile.lastSyncedAt).toLocaleString()}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm uppercase tracking-[0.2em] text-muted-foreground">
                      Slot empty
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile ? (
                    <>
                      <a
                        href={hubLaunchPath(game.id)}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <ExternalLink className="size-3.5" />
                        Open
                      </a>
                      {profile.id !== hubQuery.data.activeProfileId ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setActive.mutate(profile.id)}
                        >
                          Set active
                        </Button>
                      ) : null}
                      <Link
                        to="/connect/$game"
                        params={{ game: game.id }}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        <Link2 className="size-3.5" />
                        Reconnect
                      </Link>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setPendingDisconnect(profile)}
                      >
                        <Trash2 className="size-3.5" />
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Link
                      to="/connect/$game"
                      params={{ game: game.id }}
                      className={buttonVariants({ size: "sm" })}
                    >
                      Connect
                    </Link>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {setActive.isError ? (
        <PageStatus tone="error" className="mt-5">
          {setActive.error.message}
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
        description="The saved connection will be removed from this browser. Shared cached public statistics are unaffected."
      >
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setPendingDisconnect(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!pendingDisconnect || disconnect.isPending}
            onClick={() => {
              if (pendingDisconnect) disconnect.mutate(pendingDisconnect.id);
            }}
          >
            {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
