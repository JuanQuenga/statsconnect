import { useMutation } from "@tanstack/react-query";
import { useStatsConnectAuth } from "@statsconnect/auth";
import { gameDestinationHref } from "@statsconnect/site-nav";
import { captureSiteEvent } from "@statsconnect/site-monitoring";
import { recordCommunitySuccess } from "@statsconnect/monetization";
import { useState, type SubmitEvent } from "react";
import { PageStatus } from "@/components/ui-helpers";
import { handleGameDestinationClick, navigateToApplication } from "@/lib/application-navigation";
import type { AdapterResult, GameId, ProfileSummary } from "@/lib/contracts";
import { gameName } from "@/lib/contracts";
import { dataClient } from "@/lib/data-client";
import { tagError } from "@/lib/tags";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "StatsConnect could not complete the request.";
}

export function ConnectTagForm({ game }: { game: GameId }) {
  const auth = useStatsConnectAuth();
  const [tag, setTag] = useState("");
  const [preview, setPreview] = useState<AdapterResult<ProfileSummary> | null>(null);
  const validation = tag.length > 0 ? tagError(tag) : null;
  const previewMutation = useMutation({
    mutationFn: () => dataClient.preview(game, tag),
    onSuccess: (result) => {
      captureSiteEvent("player_lookup_succeeded", { game });
      setPreview(result);
      recordCommunitySuccess();
    },
    onError: () => captureSiteEvent("player_lookup_failed", { game }),
  });
  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Check the player tag before saving it.");
      await auth.saveProfile({
        game,
        tag: preview.data.playerTag,
        name: preview.data.display.name,
      });
      return preview.data.playerTag;
    },
    onSuccess: (playerTag) => {
      captureSiteEvent("profile_save_succeeded", { game });
      navigateToApplication(gameDestinationHref(game, playerTag, window.location.origin));
    },
    onError: () => captureSiteEvent("profile_save_failed", { game }),
  });

  function submitPreview(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tag || validation) return;
    captureSiteEvent("player_lookup_submitted", { game });
    previewMutation.mutate();
  }

  if (preview) {
    const viewHref = gameDestinationHref(game, preview.data.playerTag, window.location.origin);
    const { display } = preview.data;
    return (
      <div className="join-found">
        <div className="join-plate">
          {display.avatarUrl ? <img src={display.avatarUrl} alt="" className="join-plate__icon" /> : null}
          <div className="min-w-0">
            <p className="join-plate__status">Is this you?</p>
            <h2 className="join-plate__name">{display.name}</h2>
            <p className="join-plate__tag">{preview.data.playerTag}</p>
          </div>
        </div>
        {display.headline || display.affiliation ? (
          <dl className="join-plate__stats">
            {display.headline ? <div><dt>{display.headline.label}</dt><dd>{display.headline.value.toLocaleString()}</dd></div> : null}
            {display.affiliation ? <div><dt>{game === "clash-royale" ? "Clan" : "Club"}</dt><dd>{display.affiliation.name}</dd></div> : null}
          </dl>
        ) : null}
        {connectMutation.isError ? <PageStatus tone="error">{errorMessage(connectMutation.error)}</PageStatus> : null}
        <div className="join-actions">
          <button type="button" className="join-button join-button--gold" onClick={() => { captureSiteEvent("profile_save_submitted", { game }); connectMutation.mutate(); }} disabled={connectMutation.isPending}>{connectMutation.isPending ? "Saving…" : "Save and open stats"}</button>
          <a href={viewHref} onClick={(event) => handleGameDestinationClick(event, viewHref)} className="join-button join-button--plain">View without saving</a>
        </div>
        <button type="button" className="join-link" onClick={() => { setPreview(null); previewMutation.reset(); connectMutation.reset(); }}>Use a different tag</button>
      </div>
    );
  }

  return (
    <form className="join-form" onSubmit={submitPreview} noValidate>
      <label htmlFor="player-tag" className="sr-only">{gameName(game)} player tag</label>
      <div className="join-entry">
        <div className="join-field">
          <span aria-hidden>#</span>
          <input id="player-tag" value={tag} onChange={(event) => { setTag(event.target.value); previewMutation.reset(); }} placeholder="2PPGL9YL" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-describedby={validation ? "tag-help tag-error" : "tag-help"} aria-invalid={Boolean(validation)} />
        </div>
        <button type="submit" className="join-button join-button--gold" disabled={!tag || Boolean(validation) || previewMutation.isPending}>{previewMutation.isPending ? "Checking…" : "Check tag"}</button>
      </div>
      <p id="tag-help" className="join-help">Paste it with or without the #. Spaces are fine.</p>
      {validation ? <p id="tag-error" className="join-error">{validation}</p> : null}
      {previewMutation.isError ? <PageStatus tone="error">{errorMessage(previewMutation.error)}</PageStatus> : null}
    </form>
  );
}
