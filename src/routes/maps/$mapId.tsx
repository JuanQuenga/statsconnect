import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { apiFetch, brawlerBorderUrl, collection, mapImageUrl } from "@/lib/api";
import { normalizeCatalog } from "@/lib/brawlers";
import { formatPercent, MIN_META_PICKS, trophies } from "@/lib/format";
import type { MapDetailResponse, MapListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/maps/$mapId")({
  component: MapDetailPage,
});

type TrophyFilter = "all" | "0-499" | "500-999" | "1000+";

function MapDetailPage() {
  const { mapId } = Route.useParams();
  const [trophyFilter, setTrophyFilter] = useState<TrophyFilter>("all");

  const detailQuery = useQuery({
    queryKey: ["map", mapId, trophyFilter],
    queryFn: () =>
      apiFetch<MapDetailResponse>(
        `/api/maps/${mapId}${trophyFilter === "all" ? "" : `?trophyBucket=${encodeURIComponent(trophyFilter)}`}`,
      ),
  });
  const catalogQuery = useQuery({
    queryKey: ["brawlers"],
    queryFn: () => apiFetch("/api/brawlers").then(normalizeCatalog),
  });
  const mapsQuery = useQuery({
    queryKey: ["maps"],
    queryFn: () => apiFetch("/api/maps").then((p) => collection<MapListItem>(p)),
  });

  const map = detailQuery.data?.map;
  const stats = detailQuery.data?.stats || [];
  const teams = detailQuery.data?.teams || [];
  const sampleSize = detailQuery.data?.sampleSize || 0;
  const minPicks = detailQuery.data?.minPicks || MIN_META_PICKS;
  const catalog = useMemo(() => new Map((catalogQuery.data || []).map((b) => [b.id, b])), [catalogQuery.data]);

  const ranked = useMemo(() => {
    const eligible = stats.filter((s) => s.picks >= minPicks);
    const byWin = [...eligible].sort((a, b) => b.winRate - a.winRate || b.picks - a.picks);
    const byUse = [...eligible].sort((a, b) => b.useRate - a.useRate || b.winRate - a.winRate);
    const medianWin = byWin[Math.floor(byWin.length / 2)]?.winRate ?? 50;
    const medianUse = byUse[Math.floor(byUse.length / 2)]?.useRate ?? 1;
    const bestPicks = byWin.filter((s) => s.winRate >= medianWin && s.useRate >= medianUse).slice(0, 30);
    const winners = byWin.slice(0, 30);
    const mostUsed = byUse.slice(0, 30);
    const notRecommended = [...eligible]
      .filter((s) => s.winRate < medianWin && s.useRate < medianUse)
      .sort((a, b) => a.winRate - b.winRate)
      .slice(0, 30);
    const probabilities = eligible.map((item) => item.useRate / 100).filter((value) => value > 0);
    const entropy = -probabilities.reduce((sum, value) => sum + value * Math.log(value), 0);
    const diversity = probabilities.length > 1 ? (entropy / Math.log(probabilities.length)) * 100 : 0;
    const top5Share = byUse.slice(0, 5).reduce((sum, item) => sum + item.useRate, 0);
    const sleeper = byWin.find((item) => item.useRate < medianUse);
    return { bestPicks, winners, mostUsed, notRecommended, eligible, diversity, top5Share, sleeper };
  }, [stats, minPicks]);

  const eligibleTeams = useMemo(
    () => [...teams].filter((team) => team.picks >= 5).sort((a, b) => b.winRate - a.winRate || b.picks - a.picks).slice(0, 24),
    [teams],
  );

  const related = useMemo(() => {
    if (!map?.gameMode?.id) return [];
    return (mapsQuery.data || [])
      .filter((item) => item.gameMode?.id === map.gameMode?.id && item.id !== map.id && !item.disabled)
      .slice(0, 6);
  }, [mapsQuery.data, map]);

  return (
    <div className="page-shell">
      {detailQuery.isLoading ? <PageStatus tone="loading">Loading map meta…</PageStatus> : null}
      {detailQuery.error ? (
        <PageStatus tone="error">
          {detailQuery.error instanceof Error ? detailQuery.error.message : "Failed to load map."}
        </PageStatus>
      ) : null}

      {map ? (
        <>
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div
              className="relative aspect-video max-h-[360px] w-full overflow-hidden md:aspect-[21/9]"
              style={{ background: map.gameMode?.bgColor || "#1c2a44" }}
            >
              <ImageWithFallback
                src={map.imageUrl || mapImageUrl(map.id)}
                fallbackSrc={mapImageUrl(map.id)}
                alt={map.name}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/35 to-transparent" />
              <div className="absolute right-0 bottom-0 left-0 p-4 md:p-8">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge style={{ background: map.gameMode?.color || "#ffd166", color: "#141414" }}>
                    {map.gameMode?.name || "Mode"}
                  </Badge>
                  {map.disabled ? <Badge variant="secondary">Disabled</Badge> : null}
                  {map.new ? <Badge>New</Badge> : null}
                </div>
                <h1 className="font-display text-3xl md:text-5xl">{map.name}</h1>
                <p className="mt-1 max-w-3xl text-xs text-foreground/75 md:mt-2 md:text-sm">
                  {trophies(sampleSize)} sampled brawler picks · Min {minPicks} picks for tier lists · BrawlStats first-party
                  meta
                </p>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            {(["all", "0-499", "500-999", "1000+"] as const).map((bucket) => (
              <Button
                key={bucket}
                size="sm"
                variant={trophyFilter === bucket ? "default" : "outline"}
                onClick={() => setTrophyFilter(bucket)}
              >
                {bucket === "all" ? "All trophies" : `${bucket} trophies`}
              </Button>
            ))}
          </div>

          {!ranked.eligible.length ? (
            <EmptyState
              title="Not enough meta samples yet"
              detail={`We need at least ${minPicks} picks per brawler before publishing tier lists. Keep looking up players — battle logs feed this map automatically.`}
            />
          ) : (
            <Tabs defaultValue="best">
              <TabsList>
                <TabsTrigger value="best">Best picks</TabsTrigger>
                <TabsTrigger value="winners">Winners</TabsTrigger>
                <TabsTrigger value="used">Most used</TabsTrigger>
                <TabsTrigger value="avoid">Not recommended</TabsTrigger>
                <TabsTrigger value="teams">Top teams</TabsTrigger>
                <TabsTrigger value="overview">Overview</TabsTrigger>
              </TabsList>
              <TabsContent value="best" className="mt-4">
                <StatGrid rows={ranked.bestPicks} catalog={catalog} />
              </TabsContent>
              <TabsContent value="winners" className="mt-4">
                <StatGrid rows={ranked.winners} catalog={catalog} />
              </TabsContent>
              <TabsContent value="used" className="mt-4">
                <StatGrid rows={ranked.mostUsed} catalog={catalog} />
              </TabsContent>
              <TabsContent value="avoid" className="mt-4">
                <StatGrid rows={ranked.notRecommended} catalog={catalog} />
              </TabsContent>
              <TabsContent value="teams" className="mt-4">
                <TeamGrid rows={eligibleTeams} catalog={catalog} />
              </TabsContent>
              <TabsContent value="overview" className="mt-4">
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
                  <StatSummary
                    label="Win rate"
                    median={median(ranked.eligible.map((s) => s.winRate))}
                    avg={avg(ranked.eligible.map((s) => s.winRate))}
                  />
                  <StatSummary
                    label="Use rate"
                    median={median(ranked.eligible.map((s) => s.useRate))}
                    avg={avg(ranked.eligible.map((s) => s.useRate))}
                  />
                  <StatSummary
                    label="Star player rate"
                    median={median(ranked.eligible.map((s) => (s.picks ? (s.starPlayer / s.picks) * 100 : 0)))}
                    avg={avg(ranked.eligible.map((s) => (s.picks ? (s.starPlayer / s.picks) * 100 : 0)))}
                  />
                  <MetaSummary label="Diversity" value={formatPercent(ranked.diversity)} detail="Normalized pick spread" />
                  <MetaSummary label="Top 5 share" value={formatPercent(ranked.top5Share)} detail="Meta concentration" />
                  <MetaSummary
                    label="Sleeper pick"
                    value={ranked.sleeper ? catalog.get(ranked.sleeper.brawlerId)?.name || `#${ranked.sleeper.brawlerId}` : "—"}
                    detail={ranked.sleeper ? `${formatPercent(ranked.sleeper.winRate)} WR at ${formatPercent(ranked.sleeper.useRate)} use` : "More data needed"}
                  />
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Confidence: {sampleSize >= 2_000 ? "high" : sampleSize >= 500 ? "medium" : "early"} · Calculated from crawled official battle logs.
                </p>
              </TabsContent>
            </Tabs>
          )}

          {related.length ? (
            <section>
              <h2 className="mb-4 font-display text-2xl">More {map.gameMode?.name} maps</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((item) => (
                  <Link
                    key={item.id}
                    to="/maps/$mapId"
                    params={{ mapId: String(item.id) }}
                    className="overflow-hidden rounded-xl border border-border bg-card transition hover:border-accent/60"
                  >
                    <ImageWithFallback
                      src={item.imageUrl || mapImageUrl(item.id)}
                      fallbackSrc={mapImageUrl(item.id)}
                      alt={item.name}
                      className="aspect-video w-full object-cover"
                    />
                    <div className="p-3">
                      <p className="font-display text-lg">{item.name}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {map.gameMode?.id ? (
            <Link
              to="/gamemodes/$modeId"
              params={{ modeId: String(map.gameMode.id) }}
              className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-2.5 text-sm hover:bg-muted"
            >
              All {map.gameMode.name} maps
            </Link>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function StatGrid({
  rows,
  catalog,
}: {
  rows: MapDetailResponse["stats"];
  catalog: Map<number, { name: string; color: string; rarity: string }>;
}) {
  if (!rows.length) return <EmptyState title="No brawlers in this list" />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => {
        const meta = catalog.get(row.brawlerId);
        return (
          <Card
            key={`${row.brawlerId}-${row.trophyBucket}`}
            className={cn("flex-row items-center gap-3 p-3 py-3")}
          >
            <img src={brawlerBorderUrl(row.brawlerId)} alt="" className="size-14 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{meta?.name || `Brawler ${row.brawlerId}`}</p>
              <p className="text-xs text-muted-foreground">{meta?.rarity || "Brawler"} · {trophies(row.picks)} picks</p>
              <div className="mt-1 flex gap-3 text-sm">
                <span className="text-primary">{formatPercent(row.winRate)} WR</span>
                <span className="text-accent">{formatPercent(row.useRate)} UR</span>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function TeamGrid({
  rows,
  catalog,
}: {
  rows: MapDetailResponse["teams"];
  catalog: Map<number, { name: string; color: string; rarity: string }>;
}) {
  if (!rows.length) return <EmptyState title="No team combinations have enough samples yet" />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <Card
          key={`${row.brawlerIds.join("-")}-${row.trophyBucket}`}
          className="gap-0 p-4 py-4"
        >
          <div className="flex -space-x-2">
            {row.brawlerIds.map((id) => (
              <img
                key={id}
                src={brawlerBorderUrl(id)}
                alt={catalog.get(id)?.name || `Brawler ${id}`}
                className="size-14 rounded-xl border-2 border-card"
              />
            ))}
          </div>
          <p className="mt-3 truncate font-medium">
            {row.brawlerIds.map((id) => catalog.get(id)?.name || `#${id}`).join(" · ")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="text-primary">{formatPercent(row.winRate)} win rate</span> · {trophies(row.picks)} games
          </p>
        </Card>
      ))}
    </div>
  );
}

function MetaSummary({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="gap-0 p-5 py-5 md:col-span-1">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 truncate font-display text-2xl text-primary">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </Card>
  );
}

function StatSummary({ label, median, avg }: { label: string; median: number; avg: number }) {
  return (
    <Card className="gap-0 p-5 py-5">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl text-primary">{formatPercent(median)}</p>
      <p className="text-sm text-muted-foreground">Median · avg {formatPercent(avg)}</p>
    </Card>
  );
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
