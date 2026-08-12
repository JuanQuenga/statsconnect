import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { apiFetch, collection, eventModeId, gameModeImageUrl, mapImageUrl } from "@/lib/api";
import { readableMode, relativeEnd } from "@/lib/format";
import type { EventItem, MapListItem } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

type MapsSearch = { q?: string; mode?: string; archive?: string };
const mapPageSize = 48;

export const Route = createFileRoute("/maps/")({
  validateSearch: (search: Record<string, unknown>): MapsSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    mode: typeof search.mode === "string" ? search.mode : undefined,
    archive: typeof search.archive === "string" ? search.archive : undefined,
  }),
  component: MapsPage,
});

function MapsPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const [query, setQuery] = useState(search.q || "");
  const [modeFilter, setModeFilter] = useState(search.mode || "all");
  const [showArchive, setShowArchive] = useState(search.archive === "1");
  const [sort, setSort] = useState<"active" | "name">("active");
  const [visibleCount, setVisibleCount] = useState(mapPageSize);

  const mapsQuery = useQuery({
    queryKey: ["maps"],
    queryFn: () => apiFetch("/api/maps").then((p) => collection<MapListItem>(p)),
  });
  const eventsQuery = useQuery({
    queryKey: ["events"],
    queryFn: () => apiFetch("/api/events").then((p) => collection<EventItem>(p)),
  });

  const modes = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of mapsQuery.data || []) {
      if (item.gameMode?.id) map.set(item.gameMode.id, item.gameMode.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [mapsQuery.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = [...(mapsQuery.data || [])];
    if (!showArchive) rows = rows.filter((item) => !item.disabled);
    if (modeFilter !== "all") rows = rows.filter((item) => String(item.gameMode?.id) === modeFilter);
    if (q) {
      rows = rows.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.gameMode?.name?.toLowerCase().includes(q) ||
          item.hash?.toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return (b.lastActive || 0) - (a.lastActive || 0) || a.name.localeCompare(b.name);
    });
    return rows;
  }, [mapsQuery.data, query, modeFilter, showArchive, sort]);

  useEffect(() => setVisibleCount(mapPageSize), [modeFilter, query, showArchive, sort]);
  const visibleMaps = filtered.slice(0, visibleCount);

  return (
    <div className="page-shell space-y-10">
      <div className="page-intro">
        <p className="eyebrow">{t("maps.eyebrow")}</p>
        <h1 className="font-display text-4xl md:text-5xl">{t("maps.title")}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Browse the map archive, jump into today&apos;s rotation, and open any map for win/use rates aggregated from
          official battle logs collected by BrawlStats.
        </p>
      </div>

      <section>
        <div className="page-intro mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("maps.liveRotation")}</p>
            <h2 className="section-title">{t("maps.activeNow")}</h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(eventsQuery.data || []).slice(0, 6).map((item, index) => {
            const mode = item.event?.mode || "unknown";
            const mapId = item.event?.id;
            return (
              <Link
                key={`${mapId}-${index}`}
                to={mapId ? "/maps/$mapId" : "/maps"}
                params={mapId ? { mapId: String(mapId) } : undefined}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition hover:border-accent/60"
              >
                <img src={gameModeImageUrl(eventModeId(mode))} alt="" className="size-14 rounded-xl" />
                <div className="min-w-0">
                  <p className="font-medium">{readableMode(mode)}</p>
                  <p className="truncate text-sm text-muted-foreground">{item.event?.map || t("common.unknownMap")}</p>
                  <p className="text-xs text-primary">{relativeEnd(item.endTime)}</p>
                </div>
              </Link>
            );
          })}
          {!eventsQuery.data?.length && !eventsQuery.isLoading ? (
            <EmptyState title={t("maps.noEvents")} detail={t("maps.noEventsDetail")} />
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="data-surface flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("maps.search")}
            aria-label={t("maps.search")}
            className="h-10 max-w-md"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={showArchive ? "default" : "outline"} onClick={() => setShowArchive((v) => !v)}>
              {showArchive ? t("maps.archiveOn") : t("maps.archiveOff")}
            </Button>
            <Button size="sm" variant={sort === "active" ? "default" : "outline"} onClick={() => setSort("active")}>
              Last active
            </Button>
            <Button size="sm" variant={sort === "name" ? "default" : "outline"} onClick={() => setSort("name")}>
              Name
            </Button>
          </div>
          <Select value={modeFilter} onValueChange={(value) => setModeFilter(value || "all")}>
            <SelectTrigger className="h-9 w-full lg:ml-auto lg:w-56" aria-label={t("maps.filterMode")}>
              <SelectValue>
                {modeFilter === "all"
                  ? t("maps.allModes")
                  : modes.find(([id]) => String(id) === modeFilter)?.[1] || t("maps.gameMode")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="all">{t("maps.allModes")}</SelectItem>
              {modes.map(([id, name]) => (
                <SelectItem key={id} value={String(id)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {mapsQuery.isLoading ? <PageStatus tone="loading">{t("maps.loadingCatalog")}</PageStatus> : null}
        {mapsQuery.error ? (
          <PageStatus tone="error">
            {mapsQuery.error instanceof Error ? mapsQuery.error.message : t("maps.loadFailed")}
          </PageStatus>
        ) : null}

        <p className="text-sm text-muted-foreground">
          {visibleMaps.length} / {filtered.length} {t("common.maps").toLocaleLowerCase()}
        </p>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {visibleMaps.map((map) => (
            <Link
              key={map.id}
              to="/maps/$mapId"
              params={{ mapId: String(map.id) }}
              className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/50"
            >
              <div
                className="relative aspect-[16/10] overflow-hidden"
                style={{ background: map.gameMode?.bgColor || map.gameMode?.color || "#1c2a44" }}
              >
                <ImageWithFallback
                  src={map.imageUrl || mapImageUrl(map.id)}
                  fallbackSrc={mapImageUrl(map.id)}
                  alt={map.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {map.disabled ? (
                  <Badge className="absolute top-2 left-2" variant="secondary">
                    Disabled
                  </Badge>
                ) : null}
                {map.new ? (
                  <Badge className="absolute top-2 right-2" variant="default">
                    New
                  </Badge>
                ) : null}
              </div>
              <div className="space-y-1 p-2.5 sm:p-3">
                <div className="flex items-center gap-2">
                  {map.gameMode?.imageUrl ? (
                    <img src={map.gameMode.imageUrl} alt="" className="size-5 rounded" />
                  ) : null}
                  <span className="text-xs text-muted-foreground">{map.gameMode?.name || t("common.mode")}</span>
                </div>
                <h3 className="font-display text-base leading-tight sm:text-lg">{map.name}</h3>
              </div>
            </Link>
          ))}
        </div>
        {visibleMaps.length < filtered.length ? (
          <div className="flex justify-center">
            <Button type="button" variant="outline" onClick={() => setVisibleCount((count) => count + mapPageSize)}>
              {t("common.load")} {Math.min(mapPageSize, filtered.length - visibleMaps.length)} {t("common.maps").toLocaleLowerCase()}
            </Button>
          </div>
        ) : null}
        {!filtered.length && !mapsQuery.isLoading ? <EmptyState title={t("maps.noMatches")} /> : null}
      </section>
    </div>
  );
}
