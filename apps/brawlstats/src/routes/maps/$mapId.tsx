import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { brawlerBorderUrl, mapImageUrl } from "@/lib/artwork";
import { brawlData } from "@/lib/game-data";
import { formatPercent, MIN_META_PICKS, trophies } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { MapDetailResponse } from "@/lib/types";

export const Route = createFileRoute("/maps/$mapId")({
  component: MapDetailPage,
});

type TrophyFilter = "all" | "0-499" | "500-999" | "1000+";

function MapDetailPage() {
  const { t } = useI18n();
  const { mapId } = Route.useParams();
  const [trophyFilter, setTrophyFilter] = useState<TrophyFilter>("all");

  const detailQuery = useQuery({
    ...brawlData.map(mapId, trophyFilter),
  });
  const catalogQuery = useQuery(brawlData.brawlers());
  const mapsQuery = useQuery(brawlData.maps());

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
      {detailQuery.isLoading ? <PageStatus tone="loading">{t("maps.loadingMeta")}</PageStatus> : null}
      {detailQuery.error ? (
        <PageStatus tone="error">
          {detailQuery.error instanceof Error ? detailQuery.error.message : t("maps.loadMapFailed")}
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
                    {map.gameMode?.name || t("common.mode")}
                  </Badge>
                  {map.disabled ? <Badge variant="secondary">{t("common.disabled")}</Badge> : null}
                  {map.new ? <Badge>{t("common.new")}</Badge> : null}
                </div>
                <h1 className="font-display text-3xl md:text-5xl">{map.name}</h1>
                <p className="mt-1 max-w-3xl text-xs text-foreground/75 md:mt-2 md:text-sm">
                  {t("maps.sampleSummary", { samples: trophies(sampleSize), minimum: minPicks })}
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
                {bucket === "all" ? t("common.allTrophies") : t("common.trophyRange", { range: bucket })}
              </Button>
            ))}
          </div>

          {!ranked.eligible.length ? (
            <EmptyState
              title={t("maps.notEnough")}
              detail={t("maps.minimumDetail", { minimum: minPicks })}
            />
          ) : (
            <Tabs defaultValue="best">
              <TabsList>
                <TabsTrigger value="best">{t("maps.bestPicks")}</TabsTrigger>
                <TabsTrigger value="winners">{t("maps.winners")}</TabsTrigger>
                <TabsTrigger value="used">{t("maps.mostUsed")}</TabsTrigger>
                <TabsTrigger value="avoid">{t("maps.avoid")}</TabsTrigger>
                <TabsTrigger value="teams">{t("maps.topTeams")}</TabsTrigger>
                <TabsTrigger value="overview">{t("maps.overview")}</TabsTrigger>
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
                    label={t("player.winRate")}
                    median={median(ranked.eligible.map((s) => s.winRate))}
                    avg={avg(ranked.eligible.map((s) => s.winRate))}
                  />
                  <StatSummary
                    label={t("maps.useRate")}
                    median={median(ranked.eligible.map((s) => s.useRate))}
                    avg={avg(ranked.eligible.map((s) => s.useRate))}
                  />
                  <StatSummary
                    label={t("maps.starRate")}
                    median={median(ranked.eligible.map((s) => (s.picks ? (s.starPlayer / s.picks) * 100 : 0)))}
                    avg={avg(ranked.eligible.map((s) => (s.picks ? (s.starPlayer / s.picks) * 100 : 0)))}
                  />
                  <MetaSummary label={t("maps.diversity")} value={formatPercent(ranked.diversity)} detail={t("maps.pickSpread")} />
                  <MetaSummary label={t("maps.topShare")} value={formatPercent(ranked.top5Share)} detail={t("maps.concentration")} />
                  <MetaSummary
                    label={t("maps.sleeper")}
                    value={ranked.sleeper ? catalog.get(ranked.sleeper.brawlerId)?.name || `#${ranked.sleeper.brawlerId}` : "—"}
                    detail={ranked.sleeper ? t("maps.sleeperDetail", { win: formatPercent(ranked.sleeper.winRate), use: formatPercent(ranked.sleeper.useRate) }) : t("maps.moreData")}
                  />
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  {t("maps.confidence", { level: t(sampleSize >= 2_000 ? "maps.confidenceHigh" : sampleSize >= 500 ? "maps.confidenceMedium" : "maps.confidenceEarly") })}
                </p>
              </TabsContent>
            </Tabs>
          )}

          {related.length ? (
            <section>
              <h2 className="mb-4 font-display text-2xl">{t("maps.moreMode", { mode: map.gameMode?.name || t("common.mode") })}</h2>
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
              {t("maps.allMode", { mode: map.gameMode.name })}
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
  const { t } = useI18n();
  if (!rows.length) return <EmptyState title={t("maps.noBrawlers")} />;
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
              <p className="font-display">{meta?.name || `${t("player.brawler")} ${row.brawlerId}`}</p>
              <p className="text-xs text-muted-foreground">{meta?.rarity || t("player.brawler")} · {t("maps.picks", { count: trophies(row.picks) })}</p>
              <div className="mt-1 flex gap-3 text-sm">
                <span className="font-display text-primary">{formatPercent(row.winRate)} WR</span>
                <span className="font-display text-accent">{formatPercent(row.useRate)} UR</span>
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
  const { t } = useI18n();
  if (!rows.length) return <EmptyState title={t("maps.noTeams")} />;
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
          <p className="mt-3 truncate font-display">
            {row.brawlerIds.map((id) => catalog.get(id)?.name || `#${id}`).join(" · ")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-display text-primary">{t("maps.winRateText", { rate: formatPercent(row.winRate) })}</span> · {t("maps.games", { count: trophies(row.picks) })}
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
  const { t } = useI18n();
  return (
    <Card className="gap-0 p-5 py-5">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl text-primary">{formatPercent(median)}</p>
      <p className="text-sm text-muted-foreground">{t("maps.medianAvg", { average: formatPercent(avg) })}</p>
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
