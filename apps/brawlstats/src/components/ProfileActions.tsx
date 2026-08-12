import { Bookmark, BookmarkCheck, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { removeSavedProfile, saveProfile, usePreferences } from "@/lib/preferences";
import { shareContent } from "@/lib/share";

type ProfileActionsProps = {
  profile: {
    tag: string;
    name: string;
    iconId?: number;
    trophies?: number;
  };
};

export function ProfileActions({ profile }: ProfileActionsProps) {
  const preferences = usePreferences();
  const [shareLabel, setShareLabel] = useState("Share");
  const cleanTag = profile.tag.replace(/^#/, "");
  const saved = preferences.savedProfiles.some((item) => item.tag === cleanTag);

  async function share() {
    try {
      const result = await shareContent({
        title: `${profile.name} · BrawlStats`,
        text: `${profile.name} (#${cleanTag})${typeof profile.trophies === "number" ? ` · ${profile.trophies.toLocaleString()} trophies` : ""}`,
        url: window.location.href,
      });
      setShareLabel(result === "copied" ? "Link copied" : "Shared");
      window.setTimeout(() => setShareLabel("Share"), 1800);
    } catch {
      setShareLabel("Not shared");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant={saved ? "secondary" : "outline"}
        onClick={() => saved ? removeSavedProfile(cleanTag) : saveProfile({ ...profile, tag: cleanTag })}
      >
        {saved ? <BookmarkCheck /> : <Bookmark />}
        {saved ? "Saved" : "Save profile"}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={share}>
        <Share2 />
        {shareLabel}
      </Button>
    </div>
  );
}
