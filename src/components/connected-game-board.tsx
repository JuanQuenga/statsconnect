import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { HubState } from "@/lib/contracts";
import { gameName } from "@/lib/contracts";
import { dataClient } from "@/lib/data-client";
import { normalizeTag } from "@/lib/tags";

export function ConnectedGameBoard({ hub }: { hub: HubState }) {
  const queryClient = useQueryClient();
  const activeMutation = useMutation({
    mutationFn: dataClient.setActive,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hub-state"] }),
  });
  return (
    <section className="slide-up space-y-5">
      <div><p className="eyebrow">Connected games</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back</h1><p className="mt-2 text-muted-foreground">Open a dashboard or switch to another connected game.</p></div>
      <div className="grid gap-3">
        {hub.profiles.map((profile) => (
          <article key={profile.id} className="surface-card grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="eyebrow">{gameName(profile.game)}</p>{profile.id === hub.activeProfileId ? <Badge variant="secondary">Active</Badge> : null}</div>
              <h2 className="mt-2 truncate font-display text-2xl font-semibold">{profile.display.name}</h2>
              <p className="text-sm text-muted-foreground">{profile.playerTag}{profile.display.affiliation ? ` · ${profile.display.affiliation.name}` : ""}</p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                {profile.display.headline ? <span><span className="font-semibold text-foreground">{profile.display.headline.value.toLocaleString()}</span> <span className="text-muted-foreground">{profile.display.headline.label}</span></span> : null}
                <span className="flex items-center gap-1.5 text-muted-foreground"><Clock3 className="size-3.5" />Opened {new Date(profile.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
            <Link to="/games/$game/$tag" params={{ game: profile.game, tag: normalizeTag(profile.playerTag) }} onClick={() => activeMutation.mutate(profile.id)} className={buttonVariants({ variant: "default" })}>Open dashboard <ArrowRight className="size-4" /></Link>
          </article>
        ))}
      </div>
    </section>
  );
}
