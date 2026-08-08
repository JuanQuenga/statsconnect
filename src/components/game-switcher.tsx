import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Gamepad2, Plus, Settings } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import type { HubState } from "@/lib/contracts";
import { gameName, games } from "@/lib/contracts";
import { dataClient } from "@/lib/data-client";
import { normalizeTag } from "@/lib/tags";

export function GameSwitcher({ hub }: { hub: HubState }) {
  const queryClient = useQueryClient();
  const setActive = useMutation({
    mutationFn: dataClient.setActive,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hub-state"] }),
  });
  const active = hub.profiles.find((profile) => profile.id === hub.activeProfileId) ?? hub.profiles[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="max-w-56">
        <Gamepad2 className="size-4 text-muted-foreground" />
        <span className="truncate">{active ? `${gameName(active.game)} · ${active.display.name}` : "Choose a game"}</span>
        <ChevronDown className="ml-auto size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Games</div>
        {games.map((game) => {
          const profile = hub.profiles.find((entry) => entry.game === game.id);
          return profile ? (
            <Link
              key={game.id}
              to="/games/$game/$tag"
              params={{ game: game.id, tag: normalizeTag(profile.playerTag) }}
              onClick={() => setActive.mutate(profile.id)}
              className="flex rounded-lg px-3 py-2 text-sm no-underline hover:bg-muted"
            >
              <span className="min-w-0"><span className="font-medium">{game.name}</span><span className="block truncate text-xs text-muted-foreground">{profile.display.name} · {profile.playerTag}</span></span>
            </Link>
          ) : (
            <Link key={game.id} to="/connect/$game" params={{ game: game.id }} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground no-underline hover:bg-muted hover:text-foreground">
              <span>{game.name}</span><span className="text-xs">Connect</span>
            </Link>
          );
        })}
        <Separator className="my-1.5" />
        <Link to="/settings/connections" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm no-underline hover:bg-muted"><Settings className="size-4" />Manage connections</Link>
        <Link to="/connect" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm no-underline hover:bg-muted"><Plus className="size-4" />Connect a game</Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
