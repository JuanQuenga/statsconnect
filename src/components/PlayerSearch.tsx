import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, profileIconUrl } from "@/lib/api";
import { normalizeTag, trophies } from "@/lib/format";
import type { PlayerDirectoryResult, PlayerSearchResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  placeholder = "Search player name or #tag",
  buttonLabel = "Search",
  compact = false,
  className,
  onNavigate,
}: PlayerSearchProps) {
  const [value, setValue] = useState(initialValue);
  const [debounced, setDebounced] = useState(initialValue.trim());
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [value]);

  const searchQuery = useQuery({
    queryKey: ["player-search", debounced],
    enabled: debounced.length >= 2,
    queryFn: () =>
      apiFetch<PlayerSearchResponse>(`/api/player-search?q=${encodeURIComponent(debounced)}&limit=8`),
    staleTime: 60_000,
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
    onNavigate?.();
    window.location.assign(`/players?tag=${encodeURIComponent(`#${tag.replace(/^#/, "")}`)}`);
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
    window.location.assign(`/players?q=${encodeURIComponent(raw)}`);
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
    <form
      onSubmit={submit}
      className={cn("relative", compact ? "flex gap-2" : "flex flex-col gap-2 sm:flex-row", className)}
    >
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setActiveIndex(-1);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={cn("border-border/70 bg-card/70 pl-9", compact ? "h-9" : "h-11 text-base")}
          aria-label="Search players by name or tag"
          aria-expanded={showResults}
        />

        {showResults ? (
          <div className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
            {searchQuery.isLoading ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Searching tracked players…</p>
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
                  <span className="block text-sm font-medium">Open #{choices.tag}</span>
                  <span className="block text-xs text-muted-foreground">Exact player tag</span>
                </span>
              </Button>
            ) : null}
            {choices.players.map((player, index) => (
              <PlayerChoice
                key={player.tag}
                player={player}
                active={activeIndex === index + (choices.tag ? 1 : 0)}
                onChoose={() => navigateToPlayer(player.tag)}
              />
            ))}
            {!searchQuery.isLoading && !choices.count ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No tracked players yet. Try an exact #tag.</p>
            ) : null}
          </div>
        ) : null}
      </div>
      <Button
        type="submit"
        size={compact ? "sm" : "lg"}
        className={compact ? "h-9" : "h-11 w-full px-5 sm:w-auto"}
      >
        {buttonLabel}
      </Button>
    </form>
  );
}

function PlayerChoice({
  player,
  active,
  onChoose,
}: {
  player: PlayerDirectoryResult;
  active: boolean;
  onChoose: () => void;
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
        <span className="block truncate text-sm font-medium">{player.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          #{player.tag} · {player.clubName || "No tracked club"}
        </span>
      </span>
      {typeof player.trophies === "number" ? (
        <span className="text-xs font-medium text-primary">{trophies(player.trophies)}</span>
      ) : null}
    </Button>
  );
}
