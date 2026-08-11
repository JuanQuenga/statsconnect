import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { apiFetch, collection, mapImageUrl } from "@/lib/api";
import type { MapListItem } from "@/lib/types";

export const Route = createFileRoute("/gamemodes/$modeId")({
  component: GameModePage,
});

function GameModePage() {
  const { modeId } = Route.useParams();
  const mapsQuery = useQuery({
    queryKey: ["maps"],
    queryFn: () => apiFetch("/api/maps").then((p) => collection<MapListItem>(p)),
  });

  const maps = useMemo(
    () => (mapsQuery.data || []).filter((item) => String(item.gameMode?.id) === modeId),
    [mapsQuery.data, modeId],
  );
  const modeName = maps[0]?.gameMode?.name || "Game mode";

  return (
    <div className="page-shell">
      <div>
        <p className="eyebrow">Game mode</p>
        <h1 className="font-display text-4xl">{modeName}</h1>
        <p className="mt-2 text-muted-foreground">{maps.length} maps in catalog</p>
      </div>
      {mapsQuery.isLoading ? <PageStatus tone="loading">Loading maps…</PageStatus> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {maps.map((map) => (
          <Link
            key={map.id}
            to="/maps/$mapId"
            params={{ mapId: String(map.id) }}
            className="overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/50"
          >
            <ImageWithFallback
              src={map.imageUrl || mapImageUrl(map.id)}
              fallbackSrc={mapImageUrl(map.id)}
              alt={map.name}
              className="aspect-video w-full object-cover"
            />
            <div className="p-3">
              <p className="font-display text-lg">{map.name}</p>
              {map.disabled ? <p className="text-xs text-muted-foreground">Disabled</p> : null}
            </div>
          </Link>
        ))}
      </div>
      {!maps.length && !mapsQuery.isLoading ? <EmptyState title="No maps for this mode" /> : null}
    </div>
  );
}
