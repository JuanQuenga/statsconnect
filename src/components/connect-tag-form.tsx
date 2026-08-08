import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CheckCircle2, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PageStatus } from "@/components/ui-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AdapterResult, GameId, ProfileSummary } from "@/lib/contracts";
import { gameName } from "@/lib/contracts";
import { dataClient } from "@/lib/data-client";
import { normalizeTag, tagError } from "@/lib/tags";

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
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["hub-state"] });
      await queryClient.invalidateQueries({ queryKey: ["profile-stats"] });
      await navigate({
        to: "/games/$game/$tag",
        params: { game, tag: normalizeTag(result.profile.playerTag) },
      });
    },
  });

  function submitPreview(event: FormEvent<HTMLFormElement>) {
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
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300"><CheckCircle2 className="size-5" /></div>
              <div className="min-w-0"><p className="eyebrow">Profile found</p><h2 className="mt-1 truncate font-display text-2xl font-semibold">{preview.data.display.name}</h2><p className="text-sm text-muted-foreground">{preview.data.playerTag}</p></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {preview.data.display.headline ? <div className="rounded-xl bg-muted/55 p-4"><p className="text-xs text-muted-foreground">{preview.data.display.headline.label}</p><p className="mt-1 text-xl font-semibold">{preview.data.display.headline.value.toLocaleString()}</p></div> : null}
              {preview.data.display.affiliation ? <div className="rounded-xl bg-muted/55 p-4"><p className="text-xs text-muted-foreground">Affiliation</p><p className="mt-1 truncate font-semibold">{preview.data.display.affiliation.name}</p></div> : null}
            </div>
          </CardContent>
        </Card>
        {connectMutation.isError ? <PageStatus tone="error">{errorMessage(connectMutation.error)}</PageStatus> : null}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => { setPreview(null); previewMutation.reset(); connectMutation.reset(); }}><ArrowLeft className="size-4" />Use another tag</Button>
          <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>{connectMutation.isPending ? "Saving…" : "Save & open dashboard"}<ArrowRight className="size-4" /></Button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={submitPreview} noValidate>
      <div>
        <label htmlFor="player-tag" className="text-sm font-semibold">{gameName(game)} player tag</label>
        <div className="mt-2 flex gap-2">
          <Input id="player-tag" value={tag} onChange={(event) => { setTag(event.target.value); previewMutation.reset(); }} placeholder="#2PPGL9YL" autoCapitalize="characters" autoComplete="off" aria-describedby="tag-help tag-error" aria-invalid={Boolean(validation)} />
          <Button type="submit" disabled={!tag || Boolean(validation) || previewMutation.isPending}>{previewMutation.isPending ? "Checking…" : "Check tag"}<Search className="size-4" /></Button>
        </div>
        <p id="tag-help" className="mt-2 text-xs leading-relaxed text-muted-foreground">Enter the player tag from the in-game profile. Spaces and a leading # are accepted.</p>
        {validation ? <p id="tag-error" className="mt-2 text-sm text-destructive">{validation}</p> : null}
      </div>
      {previewMutation.isError ? <PageStatus tone="error">{errorMessage(previewMutation.error)}</PageStatus> : null}
    </form>
  );
}
