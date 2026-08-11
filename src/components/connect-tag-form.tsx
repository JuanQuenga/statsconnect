import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CheckCircle2, Search } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { PageStatus } from "@/components/ui-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AdapterResult, GameId, ProfileSummary } from "@/lib/contracts";
import { gameName } from "@/lib/contracts";
import { dataClient } from "@/lib/data-client";
import { tagError } from "@/lib/tags";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "StatsConnect could not complete the request.";
}

export function ConnectTagForm({ game }: { game: GameId }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tag, setTag] = useState("");
  const [preview, setPreview] = useState<AdapterResult<ProfileSummary> | null>(null);
  const validation = tag.length > 0 ? tagError(tag) : null;
  const previewMutation = useMutation({
    mutationFn: () => dataClient.preview(game, tag),
    onSuccess: setPreview,
  });
  const connectMutation = useMutation({
    mutationFn: () => dataClient.connect(game, tag),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hub-state"] });
      await queryClient.invalidateQueries({ queryKey: ["profile-stats"] });
      await navigate({ to: "/launch/$game", params: { game } });
    },
  });

  function submitPreview(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tag || validation) return;
    previewMutation.mutate();
  }

  if (preview) {
    return (
      <div className="space-y-5">
        <Card className="slide-up">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-start gap-4">
              <div className="bevel bevel-sm flex size-12 shrink-0 items-center justify-center bg-emerald-400/15 text-emerald-300"><CheckCircle2 className="size-5" /></div>
              <div className="min-w-0"><p className="eyebrow text-emerald-300">Profile found</p><h2 className="mt-2 truncate font-display text-2xl font-bold uppercase tracking-tight">{preview.data.display.name}</h2><p className="font-numeric text-lg tracking-[0.14em] text-muted-foreground">{preview.data.playerTag}</p></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {preview.data.display.headline ? <div className="bevel bevel-sm border border-border/60 bg-black/30 p-4"><p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{preview.data.display.headline.label}</p><p className="numeric mt-2 text-4xl text-[var(--game-accent)]">{preview.data.display.headline.value.toLocaleString()}</p></div> : null}
              {preview.data.display.affiliation ? <div className="bevel bevel-sm border border-border/60 bg-black/30 p-4"><p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Affiliation</p><p className="mt-2 truncate font-display text-xl font-semibold">{preview.data.display.affiliation.name}</p></div> : null}
            </div>
          </CardContent>
        </Card>
        {connectMutation.isError ? <PageStatus tone="error">{errorMessage(connectMutation.error)}</PageStatus> : null}
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => { setPreview(null); previewMutation.reset(); connectMutation.reset(); }}><ArrowLeft className="size-4" />Use another tag</Button>
          <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>{connectMutation.isPending ? "Saving…" : `Save & launch ${gameName(game)}`}<ArrowRight className="size-4" /></Button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={submitPreview} noValidate>
      <div>
        <label htmlFor="player-tag" className="eyebrow block">{gameName(game)} player tag</label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Input id="player-tag" value={tag} onChange={(event) => { setTag(event.target.value); previewMutation.reset(); }} placeholder="#2PPGL9YL" autoCapitalize="characters" autoComplete="off" aria-describedby="tag-help tag-error" aria-invalid={Boolean(validation)} />
          <Button type="submit" size="lg" className="shrink-0" disabled={!tag || Boolean(validation) || previewMutation.isPending}>{previewMutation.isPending ? "Checking…" : "Check tag"}<Search className="size-4" /></Button>
        </div>
        <p id="tag-help" className="mt-2 text-xs leading-relaxed text-muted-foreground">Enter the player tag from the in-game profile. Spaces and a leading # are accepted.</p>
        {validation ? <p id="tag-error" className="mt-2 text-sm text-destructive">{validation}</p> : null}
      </div>
      {previewMutation.isError ? <PageStatus tone="error">{errorMessage(previewMutation.error)}</PageStatus> : null}
    </form>
  );
}
