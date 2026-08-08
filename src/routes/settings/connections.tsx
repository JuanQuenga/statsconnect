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
import { normalizeTag } from "@/lib/tags";

export const Route = createFileRoute("/settings/connections")({ component: ConnectionsPage, head: () => ({ meta: [{ title: "Connections · StatsConnect" }] }) });

function ConnectionsPage() {
  const queryClient = useQueryClient();
  const hubQuery = useQuery(hubQueryOptions());
  const [pendingDisconnect, setPendingDisconnect] = useState<ConnectedProfile | null>(null);
  const setActive = useMutation({ mutationFn: dataClient.setActive, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hub-state"] }) });
  const disconnect = useMutation({
    mutationFn: dataClient.disconnect,
    onSuccess: async () => { setPendingDisconnect(null); await queryClient.invalidateQueries({ queryKey: ["hub-state"] }); },
  });
  if (hubQuery.isPending) return <LoadingState label="Loading connections" />;
  if (hubQuery.isError) return <ErrorState title="Connections unavailable" detail={hubQuery.error.message} />;
  return (
    <section className="slide-up mx-auto max-w-4xl"><p className="eyebrow">Settings</p><h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Connections</h1><p className="mt-3 text-muted-foreground">Open, replace, or remove the game profiles connected to this browser.</p>
      <div className="mt-8 space-y-3">{games.map((game) => { const profile = hubQuery.data.profiles.find((entry) => entry.game === game.id); return <article key={game.id} className="surface-card p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-display text-xl font-semibold">{game.name}</h2>{profile?.id === hubQuery.data.activeProfileId ? <Badge variant="secondary">Active</Badge> : null}</div>{profile ? <><p className="mt-2 truncate font-medium">{profile.display.name}</p><p className="text-sm text-muted-foreground">{profile.playerTag} · Synced {new Date(profile.lastSyncedAt).toLocaleString()}</p></> : <p className="mt-2 text-sm text-muted-foreground">Not connected</p>}</div><div className="flex flex-wrap gap-2">{profile ? <><Link to="/games/$game/$tag" params={{ game: game.id, tag: normalizeTag(profile.playerTag) }} className={buttonVariants({ variant: "outline", size: "sm" })}><ExternalLink className="size-3.5" />Open</Link>{profile.id !== hubQuery.data.activeProfileId ? <Button size="sm" variant="outline" onClick={() => setActive.mutate(profile.id)}>Set active</Button> : null}<Link to="/connect/$game" params={{ game: game.id }} className={buttonVariants({ variant: "outline", size: "sm" })}><Link2 className="size-3.5" />Reconnect</Link><Button size="sm" variant="destructive" onClick={() => setPendingDisconnect(profile)}><Trash2 className="size-3.5" />Disconnect</Button></> : <Link to="/connect/$game" params={{ game: game.id }} className={buttonVariants({ size: "sm" })}>Connect</Link>}</div></div></article>; })}</div>
      {setActive.isError ? <PageStatus tone="error" className="mt-4">{setActive.error.message}</PageStatus> : null}
      {disconnect.isError ? <PageStatus tone="error" className="mt-4">{disconnect.error.message}</PageStatus> : null}
      <Dialog open={pendingDisconnect !== null} onOpenChange={(open) => { if (!open) setPendingDisconnect(null); }} title={`Disconnect ${pendingDisconnect ? gameName(pendingDisconnect.game) : "game"}?`} description="The saved connection will be removed from this browser. Shared cached public statistics are unaffected."><div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setPendingDisconnect(null)}>Cancel</Button><Button variant="destructive" disabled={!pendingDisconnect || disconnect.isPending} onClick={() => { if (pendingDisconnect) disconnect.mutate(pendingDisconnect.id); }}>{disconnect.isPending ? "Disconnecting…" : "Disconnect"}</Button></div></Dialog>
    </section>
  );
}
