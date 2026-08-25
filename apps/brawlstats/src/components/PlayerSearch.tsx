import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { SiteSearch } from "@statsconnect/site-nav";
import { Button } from "@/components/ui/button";
import { profileIconUrl } from "@/lib/artwork";
import { brawlData } from "@/lib/game-data";
import { normalizeTag, trophies } from "@/lib/format";
import { rememberRecentProfile } from "@/lib/preferences";
import type { PlayerDirectoryResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type PlayerSearchProps = {
  initialValue?: string;
  placeholder?: string;
  buttonLabel?: string;
  compact?: boolean;
  className?: string;
  onNavigate?: () => void;
};

export function PlayerSearch({
  initialValue = "",
  placeholder,
  buttonLabel,
  compact = false,
  className,
  onNavigate,
}: PlayerSearchProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const suggestionsId = useId();
  const [value, setValue] = useState(initialValue);
  const [debounced, setDebounced] = useState(initialValue.trim());
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [value]);

  const searchQuery = useQuery({
    ...brawlData.playerSearch(debounced, 8),
    enabled: debounced.length >= 2,
  });

  const choices = useMemo(() => {
    const players = searchQuery.data?.players || [];
    const possibleTag = searchQuery.data?.possibleTag;
    const foundTag = possibleTag && players.some((player) => player.tag === possibleTag);
    return {
      players,
      tag: possibleTag && !foundTag ? possibleTag : undefined,
      count: players.length + (possibleTag && !foundTag ? 1 : 0),
    };
  }, [searchQuery.data]);

  function navigateToPlayer(tag: string) {
    const match = choices.players.find((player) => player.tag === tag.replace(/^#/, ""));
    rememberRecentProfile({
      tag,
      name: match?.name,
      iconId: match?.iconId,
      trophies: match?.trophies,
    });
    onNavigate?.();
    void navigate({ to: "/players", search: { tag: `#${tag.replace(/^#/, "")}` } });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const raw = value.trim();
    if (!raw) return;
    if (raw.startsWith("#")) {
      const tag = normalizeTag(raw);
      if (tag) return navigateToPlayer(tag);
    }
    onNavigate?.();
    void navigate({ to: "/players", search: { q: raw } });
  }

  function choose(index: number) {
    if (choices.tag && index === 0) return navigateToPlayer(choices.tag);
    const playerIndex = index - (choices.tag ? 1 : 0);
    const player = choices.players[playerIndex];
    if (player) navigateToPlayer(player.tag);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!choices.count) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % choices.count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? choices.count - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === "Escape") {
      setFocused(false);
    }
  }

  const showResults = focused && debounced.length >= 2;

  return (
    <div className={cn("relative", className)}>
      <SiteSearch
        compact={compact}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          setActiveIndex(-1);
        }}
        onSubmit={submit}
        label={t("search.aria")}
        placeholder={placeholder || t("search.placeholder")}
        submitLabel={buttonLabel || t("common.search")}
        submitIcon={<Search />}
        inputProps={{
          autoComplete: "off",
          role: "combobox",
          "aria-expanded": showResults,
          "aria-controls": showResults ? suggestionsId : undefined,
          onFocus: () => setFocused(true),
          onBlur: () => window.setTimeout(() => setFocused(false), 120),
          onKeyDown,
        }}
      />

      {showResults ? (
        <div
          id={suggestionsId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
        >
            {searchQuery.isLoading ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">{t("search.searching")}</p>
            ) : null}
            {choices.tag ? (
              <Button
                type="button"
                variant="ghost"
                onMouseDown={() => choose(0)}
                className={cn(
                  "h-auto w-full justify-start gap-3 rounded-none border-b border-border px-3 py-2.5 text-left hover:bg-secondary",
                  activeIndex === 0 && "bg-secondary",
                )}
              >
                <span className="grid size-9 place-items-center rounded-lg bg-primary/15 text-sm font-semibold text-primary">#</span>
                <span>
                  <span className="block text-sm font-medium">{t("search.openTag", { tag: choices.tag })}</span>
                  <span className="block text-xs text-muted-foreground">{t("search.exactTag")}</span>
                </span>
              </Button>
            ) : null}
            {choices.players.map((player, index) => (
              <PlayerChoice
                key={player.tag}
                player={player}
                active={activeIndex === index + (choices.tag ? 1 : 0)}
                onChoose={() => navigateToPlayer(player.tag)}
                noClubLabel={t("common.noTrackedClub")}
              />
            ))}
            {!searchQuery.isLoading && !choices.count ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">{t("search.empty")}</p>
            ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PlayerChoice({
  player,
  active,
  onChoose,
  noClubLabel,
}: {
  player: PlayerDirectoryResult;
  active: boolean;
  onChoose: () => void;
  noClubLabel: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onMouseDown={onChoose}
      className={cn("h-auto w-full justify-start gap-3 rounded-none px-3 py-2.5 text-left hover:bg-secondary", active && "bg-secondary")}
    >
      <img src={profileIconUrl(player.iconId)} alt="" className="size-9 rounded-lg" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-sm">{player.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          #{player.tag} · {player.clubName || noClubLabel}
        </span>
      </span>
      {typeof player.trophies === "number" ? (
        <span className="font-display text-xs text-primary">{trophies(player.trophies)}</span>
      ) : null}
    </Button>
  );
}
