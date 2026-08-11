import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Gamepad2, Plus, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import type { HubState } from "@/lib/contracts";
import { gameName, games } from "@/lib/contracts";
import { dataClient } from "@/lib/data-client";
import { hubLaunchPath } from "@/lib/destinations";

const itemClass =
  "bevel bevel-sm flex px-3 py-2.5 text-sm no-underline transition-colors hover:bg-white/[0.07] focus:bg-white/[0.07] focus:outline-none";

export function GameSwitcher({ hub, onNavigate }: { hub: HubState; onNavigate?: () => void }) {
  const queryClient = useQueryClient();
  const setActive = useMutation({
    mutationFn: dataClient.setActive,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hub-state"] }),
  });
  const active = hub.profiles.find((profile) => profile.id === hub.activeProfileId) ?? hub.profiles[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="max-w-56" aria-label="Switch game">
        <Gamepad2 className="size-4 text-muted-foreground" aria-hidden />
        <span className="truncate">{active ? `${gameName(active.game)} · ${active.display.name}` : "Choose a game"}</span>
        <ChevronDown className="ml-auto size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="font-display text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Games
        </DropdownMenuLabel>
        {games.map((game) => {
          const profile = hub.profiles.find((entry) => entry.game === game.id);
          return profile ? (
            <a
              key={game.id}
              role="menuitem"
              tabIndex={-1}
              href={hubLaunchPath(game.id)}
              onClick={() => { setActive.mutate(profile.id); onNavigate?.(); }}
              className={itemClass}
            >
              <span className="min-w-0"><span className="font-medium">{game.name}</span><span className="block truncate text-xs text-muted-foreground">{profile.display.name} · {profile.playerTag}</span></span>
            </a>
          ) : (
            <Link
              key={game.id}
              role="menuitem"
              tabIndex={-1}
              to="/connect/$game"
              params={{ game: game.id }}
              onClick={() => onNavigate?.()}
              className={`${itemClass} items-center justify-between text-muted-foreground hover:text-foreground`}
            >
              <span>{game.name}</span><span className="text-xs">Connect</span>
            </Link>
          );
        })}
        <Separator className="my-1.5" />
        <Link role="menuitem" tabIndex={-1} to="/settings/connections" onClick={() => onNavigate?.()} className={`${itemClass} items-center gap-2`}><Settings className="size-4" aria-hidden />Manage connections</Link>
        <Link role="menuitem" tabIndex={-1} to="/connect" onClick={() => onNavigate?.()} className={`${itemClass} items-center gap-2`}><Plus className="size-4" aria-hidden />Connect a game</Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
