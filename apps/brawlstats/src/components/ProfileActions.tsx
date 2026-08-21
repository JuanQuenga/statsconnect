import { Bookmark, BookmarkCheck, LoaderCircle, Share2 } from "lucide-react";
import { useState } from "react";
import { useStatsConnectAuth, useStatsConnectProfileTracking } from "@statsconnect/auth";
import { Button } from "@/components/ui/button";
import { shareContent } from "@/lib/share";
import { useI18n } from "@/lib/i18n";

type ProfileActionsProps = {
  profile: {
    tag: string;
    name: string;
    iconId?: number;
    trophies?: number;
  };
  size?: "sm" | "lg";
};

export function ProfileActions({ profile, size = "sm" }: ProfileActionsProps) {
  const auth = useStatsConnectAuth();
  const tracking = useStatsConnectProfileTracking();
  const { t, number } = useI18n();
  const [shareLabel, setShareLabel] = useState<string | null>(null);
  const [trackPending, setTrackPending] = useState(false);
  const [trackError, setTrackError] = useState(false);
  const cleanTag = profile.tag.replace(/^#/, "").toUpperCase();
  const tracked = tracking.isTracked("brawl-stars", cleanTag);

  async function share() {
    try {
      const result = await shareContent({
        title: `${profile.name} · StatsConnect Brawl Stars statistics`,
        text: typeof profile.trophies === "number"
          ? t("profile.shareText", { name: profile.name, tag: cleanTag, trophies: number(profile.trophies) })
          : `${profile.name} (#${cleanTag})`,
        url: window.location.href,
      });
      setShareLabel(result === "copied" ? t("profile.linkCopied") : t("profile.shared"));
      window.setTimeout(() => setShareLabel(null), 1800);
    } catch {
      setShareLabel(t("profile.notShared"));
    }
  }

  async function toggleTracking() {
    if (trackPending || tracking.status === "loading") return;
    setTrackPending(true);
    setTrackError(false);
    try {
      if (!tracking.authenticated) {
        await auth.signInWithGoogle();
      } else if (tracked) {
        await tracking.untrackProfile("brawl-stars", cleanTag);
      } else {
        await tracking.trackProfile({ game: "brawl-stars", tag: cleanTag, name: profile.name });
      }
    } catch {
      setTrackError(true);
    } finally {
      setTrackPending(false);
    }
  }

  const trackLabel = trackPending
    ? t("profile.tracking")
    : tracking.status === "loading"
      ? t("common.loading")
      : !tracking.authenticated
        ? t("profile.signInToTrack")
        : tracked
          ? t("profile.tracked")
          : t("profile.track");

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size={size}
        variant={tracked ? "secondary" : "outline"}
        onClick={toggleTracking}
        disabled={trackPending || tracking.status === "loading"}
        aria-pressed={tracked}
        aria-busy={trackPending}
        aria-describedby={trackError ? "profile-tracking-error" : undefined}
      >
        {trackPending ? <LoaderCircle className="animate-spin" /> : tracked ? <BookmarkCheck /> : <Bookmark />}
        {trackLabel}
      </Button>
      <Button type="button" size={size} variant="outline" onClick={share}>
        <Share2 />
        {shareLabel || t("common.share")}
      </Button>
      {trackError ? (
        <span id="profile-tracking-error" role="alert" className="basis-full text-sm text-destructive">
          {t("profile.trackError")}
        </span>
      ) : null}
    </div>
  );
}
