import { Bookmark, BookmarkCheck, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { removeSavedProfile, saveProfile, usePreferences } from "@/lib/preferences";
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
  const preferences = usePreferences();
  const { t, number } = useI18n();
  const [shareLabel, setShareLabel] = useState<string | null>(null);
  const cleanTag = profile.tag.replace(/^#/, "");
  const saved = preferences.savedProfiles.some((item) => item.tag === cleanTag);

  async function share() {
    try {
      const result = await shareContent({
        title: `${profile.name} · BrawlStats`,
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

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size={size}
        variant={saved ? "secondary" : "outline"}
        onClick={() => saved ? removeSavedProfile(cleanTag) : saveProfile({ ...profile, tag: cleanTag })}
      >
        {saved ? <BookmarkCheck /> : <Bookmark />}
        {saved ? t("common.saved") : t("profile.save")}
      </Button>
      <Button type="button" size={size} variant="outline" onClick={share}>
        <Share2 />
        {shareLabel || t("common.share")}
      </Button>
    </div>
  );
}
