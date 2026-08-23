import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrawlerModelViewer } from "@/components/BrawlerModelViewer";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { brawlerBorderUrl, brawlerHeroArtwork, mapImageUrl, profileIconUrl } from "@/lib/artwork";
import { brawlData } from "@/lib/game-data";
import { formatPercent, trophies } from "@/lib/format";
import { useI18n, type Translator } from "@/lib/i18n";
import { appPath } from "@/lib/paths";
import type { BrawlerMetaResponse, CatalogAbility, MapListItem, MetaDailyPoint, MetaTrendWindow } from "@/lib/types";
import type { TrophyBucket } from "@/lib/meta";

export const Route = createFileRoute("/brawlers/$brawlerId")({ component: BrawlerDetailPage });

const trophyBuckets: TrophyBucket[] = ["all", "0-499", "500-999", "1000+"];

function BrawlerDetailPage() {
  const { t, date } = useI18n();
  const { brawlerId: rawId } = Route.useParams();
  const brawlerId = Number(rawId);
  const [bucket, setBucket] = useState<TrophyBucket>("all");
  const [trendWindow, setTrendWindow] = useState<MetaTrendWindow>("30");
  const [region, setRegion] = useState("global");
  const catalogQuery = useQuery(brawlData.brawlers());
  const mapsQuery = useQuery(brawlData.maps());
  const metaQuery = useQuery({
    ...brawlData.brawlerMeta(brawlerId, bucket),
    enabled: Number.isInteger(brawlerId) && brawlerId > 0,
  });
  const trendQuery = useQuery({
    ...brawlData.metaTrends(bucket, trendWindow, brawlerId),
    enabled: Number.isInteger(brawlerId) && brawlerId > 0,
  });
  const rankingQuery = useQuery({
    ...brawlData.rankingBrawlers(region, brawlerId, 50),
    enabled: Number.isInteger(brawlerId) && brawlerId > 0,
  });
  const brawler = catalogQuery.data?.find((item) => item.id === brawlerId);
  const heroArtwork = brawler ? brawlerHeroArtwork(brawler.id, brawler) : undefined;
  const maps = useMemo(() => new Map((mapsQuery.data || []).map((map) => [map.id, map])), [mapsQuery.data]);
  const eligibleMaps = useMemo(() => (trendQuery.data?.current.stats || []).filter((row) => row.picks >= (trendQuery.data?.minPicks || 25)), [trendQuery.data]);
  const bestMaps = useMemo(() => [...eligibleMaps].sort((a, b) => b.winRate - a.winRate || b.picks - a.picks).slice(0, 8), [eligibleMaps]);
  const worstMaps = useMemo(() => [...eligibleMaps].sort((a, b) => a.winRate - b.winRate || b.picks - a.picks).slice(0, 8), [eligibleMaps]);
  const modes = useMemo(() => {
    const result = new Map<string, { name: string; wins: number; losses: number; picks: number }>();
    for (const stat of trendQuery.data?.current.stats || []) {
      const map = maps.get(stat.mapId);
      const key = String(map?.gameMode?.id || "unknown");
      const row = result.get(key) || { name: map?.gameMode?.name || t("meta.unknownMode"), wins: 0, losses: 0, picks: 0 };
      row.wins += stat.wins;
      row.losses += stat.losses;
      row.picks += stat.picks;
      result.set(key, row);
    }
    return [...result.values()].map((row) => ({ ...row, winRate: row.wins + row.losses ? (row.wins / (row.wins + row.losses)) * 100 : 0 })).filter((row) => row.picks >= (trendQuery.data?.minPicks || 25)).sort((a, b) => b.winRate - a.winRate);
  }, [maps, t, trendQuery.data]);
  const synergies = useMemo(() => {
    const partners = new Map<number, { wins: number; losses: number; picks: number }>();
    for (const team of metaQuery.data?.teams || []) {
      for (const id of team.brawlerIds) {
        if (id === brawlerId) continue;
        const row = partners.get(id) || { wins: 0, losses: 0, picks: 0 };
        row.wins += team.wins;
        row.losses += team.losses;
        row.picks += team.picks;
        partners.set(id, row);
      }
    }
    return [...partners.entries()].map(([id, row]) => ({ id, ...row, winRate: row.wins + row.losses ? (row.wins / (row.wins + row.losses)) * 100 : 0 })).filter((row) => row.picks >= 5).sort((a, b) => b.winRate - a.winRate || b.picks - a.picks).slice(0, 12);
  }, [brawlerId, metaQuery.data]);
  const matchups = useMemo(() => {
    const opponents = new Map<number, { wins: number; losses: number; picks: number }>();
    for (const matchup of trendQuery.data?.currentMatchups || []) {
      const row = opponents.get(matchup.opponentBrawlerId) || { wins: 0, losses: 0, picks: 0 };
      row.wins += matchup.wins;
      row.losses += matchup.losses;
      row.picks += matchup.picks;
      opponents.set(matchup.opponentBrawlerId, row);
    }
    return [...opponents.entries()]
      .map(([id, row]) => ({ id, ...row, winRate: row.wins + row.losses ? (row.wins / (row.wins + row.losses)) * 100 : 0 }))
      .filter((row) => row.picks >= 10);
  }, [trendQuery.data?.currentMatchups]);
  const counters = useMemo(() => [...matchups].sort((a, b) => b.winRate - a.winRate || b.picks - a.picks).slice(0, 10), [matchups]);
  const weaknesses = useMemo(() => [...matchups].sort((a, b) => a.winRate - b.winRate || b.picks - a.picks).slice(0, 10), [matchups]);
  const catalog = useMemo(() => new Map((catalogQuery.data || []).map((item) => [item.id, item])), [catalogQuery.data]);
  const currentTotals = useMemo(() => periodTotals(trendQuery.data?.current.stats || []), [trendQuery.data?.current.stats]);
  const previousTotals = useMemo(() => periodTotals(trendQuery.data?.previous?.stats || []), [trendQuery.data?.previous?.stats]);
  const loading = catalogQuery.isLoading || metaQuery.isLoading || trendQuery.isLoading || mapsQuery.isLoading;

  const formatDate = (value?: number | null) => value ? date(value, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";

  if (!Number.isInteger(brawlerId) || brawlerId <= 0) return <div className="page-shell"><EmptyState title={t("brawler.invalidId")} /></div>;
  return (
    <div className="page-shell">
      {loading ? <PageStatus tone="loading">{t("brawler.loading")}</PageStatus> : null}
      {catalogQuery.error || metaQuery.error || trendQuery.error || mapsQuery.error ? <PageStatus tone="error">{t("brawler.loadFailed")}</PageStatus> : null}
      {!loading && !brawler ? <EmptyState title={t("brawler.notFound")} detail={t("brawler.notFoundDetail")} /> : null}
      {brawler ? (
        <>
          <section className="relative overflow-visible rounded-xl border border-border bg-card p-6 md:p-8" style={{ background: `radial-gradient(circle at 85% 30%, ${brawler.color}42, transparent 35%), #101926` }}>
            <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_480px]">
              <div className="relative z-20">
                <div className="flex flex-wrap gap-2"><Badge style={{ background: brawler.color, color: "#07101a" }}>{brawler.rarity}</Badge><Badge variant="secondary">{brawler.role}</Badge></div>
                <h1 className="mt-3 font-display text-5xl md:text-6xl">{brawler.name}</h1>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{brawler.description}</p>
                <p className="mt-4 text-xs text-muted-foreground">{t("brawler.catalogRevision", { version: brawler.version || t("brawler.unversioned") })}</p>
              </div>
              {heroArtwork && heroArtwork.kind !== "feature" ? (
                <BrawlerModelViewer
                  brawlerId={brawler.id}
                  alt={brawler.name}
                  artworkSrc={heroArtwork.src}
                  fallbackSrc={heroArtwork.fallbackSrc}
                  artworkKind={heroArtwork.kind}
                  className="relative z-10 mx-auto -my-8 h-[420px] w-[calc(100%+2rem)] max-w-none -translate-x-4 md:-mr-12 md:h-[520px] md:w-[calc(100%+6rem)] md:translate-x-0"
                />
              ) : null}
              {heroArtwork?.kind === "feature" ? (
                <ImageWithFallback
                  src={heroArtwork.src}
                  fallbackSrc={heroArtwork.fallbackSrc}
                  alt={brawler.name}
                  data-art-kind={heroArtwork.kind}
                  className="mx-auto max-h-72 w-full rounded-xl object-cover drop-shadow-2xl"
                />
              ) : null}
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            {trophyBuckets.map((value) => <Button key={value} size="sm" variant={bucket === value ? "default" : "outline"} onClick={() => setBucket(value)}>{value === "all" ? t("common.allTrophies") : t("common.trophyRange", { range: value })}</Button>)}
            <span className="mx-1 hidden w-px bg-border sm:block" />
            {(["7", "30", "90", "all"] as const).map((value) => <Button key={value} size="sm" variant={trendWindow === value ? "secondary" : "outline"} onClick={() => setTrendWindow(value)}>{value === "all" ? t("brawler.allTracked") : t("brawler.days", { count: value })}</Button>)}
          </div>

          {trendQuery.data && !trendQuery.data.coverageStartAt ? <CoverageCard title={t("brawler.coverageNotStarted")} detail={t("brawler.coverageNotStartedDetail")} /> : null}
          {trendQuery.data?.coverageStartAt ? <CoverageCard title={t("brawler.coverageStarts", { date: formatDate(trendQuery.data.coverageStartAt) })} detail={`${t(trendQuery.data.currentCoverageComplete ? "brawler.coverageComplete" : "brawler.coveragePartial")} ${t(trendQuery.data.comparisonReady ? "brawler.comparisonReady" : "brawler.comparisonPartial")}`} /> : null}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Summary label={t("brawler.windowWinRate")} value={formatPercent(currentTotals.winRate)} detail={t("brawler.vsPrevious", { delta: deltaPercent(currentTotals.winRate, previousTotals.winRate, Boolean(trendQuery.data?.previous?.sampleSize), t) })} />
            <Summary label={t("brawler.windowPicks")} value={trophies(currentTotals.picks)} detail={t("brawler.vsPrevious", { delta: deltaNumber(currentTotals.picks, previousTotals.picks, Boolean(trendQuery.data?.previous?.sampleSize), t) })} />
            <Summary label={t("meta.starRate")} value={formatPercent(currentTotals.starRate)} detail={t("brawler.vsPrevious", { delta: deltaPercent(currentTotals.starRate, previousTotals.starRate, Boolean(trendQuery.data?.previous?.sampleSize), t) })} />
            <Summary label={t("brawler.qualifiedMaps")} value={String(eligibleMaps.length)} detail={t("brawler.qualifiedDetail", { minimum: trendQuery.data?.minPicks || 25, window: windowLabel(trendWindow, t) })} />
          </section>

          <Tabs defaultValue="meta">
            <TabsList><TabsTrigger value="meta">{t("brawler.mapsModes")}</TabsTrigger><TabsTrigger value="loadout">{t("brawler.completeLoadout")}</TabsTrigger><TabsTrigger value="teams">{t("brawler.teamsSynergies")}</TabsTrigger><TabsTrigger value="rankings">{t("nav.leaderboards")}</TabsTrigger><TabsTrigger value="history">{t("brawler.historyEvidence")}</TabsTrigger></TabsList>
            <TabsContent value="meta" className="mt-4 space-y-8">
              <p className="text-sm text-muted-foreground">{t("brawler.windowDataDetail", { window: windowLabel(trendWindow, t).toLocaleLowerCase() })}</p>
              <div className="grid gap-6 lg:grid-cols-2">
                <MapList title={t("brawler.bestMaps")} rows={bestMaps} maps={maps} t={t} />
                <MapList title={t("brawler.hardestMaps")} rows={worstMaps} maps={maps} t={t} reverse />
              </div>
              <section><h2 className="section-title mb-4">{t("brawler.modePerformance")}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{modes.map((mode) => <Card key={mode.name} className="gap-0 p-4 py-4"><p className="font-medium">{mode.name}</p><p className="mt-2 font-display text-3xl text-primary">{formatPercent(mode.winRate)}</p><p className="text-xs text-muted-foreground">{t("brawlers.picks", { count: trophies(mode.picks) })}</p></Card>)}</div>{!modes.length ? <EmptyState title={t("brawler.noModes")} /> : null}</section>
            </TabsContent>
            <TabsContent value="loadout" className="mt-4 space-y-8">
              <div className="grid gap-6 lg:grid-cols-2"><AbilityGroup title={t("brawler.gadgets")} abilities={brawler.gadgets} /><AbilityGroup title={t("brawler.starPowers")} abilities={brawler.starPowers} /></div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <CoverageCard title={t("brawler.gears")} detail={t("brawler.gearsDetail")} />
                <CoverageCard title={t("brawler.hypercharge")} detail={t("brawler.hyperchargeDetail")} />
                <CoverageCard title={t("brawler.buffies")} detail={t("brawler.buffiesDetail")} />
                <CoverageCard title={t("brawler.skinsPins")} detail={t("brawler.skinsPinsDetail")} />
              </div>
              <CoverageCard title={t("brawler.buildPerformance")} detail={t("brawler.buildPerformanceDetail")} />
            </TabsContent>
            <TabsContent value="teams" className="mt-4 space-y-8">
              <section><h2 className="section-title mb-4">{t("brawler.bestPartners")}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{synergies.map((row) => <a key={row.id} href={appPath(`/brawlers/${row.id}`)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/60"><img src={brawlerBorderUrl(row.id)} alt="" className="size-14 rounded-xl" /><div><p className="font-medium">{catalog.get(row.id)?.name || t("brawler.named", { id: row.id })}</p><p className="text-sm text-primary">{t("brawler.winRateValue", { rate: formatPercent(row.winRate) })}</p><p className="text-xs text-muted-foreground">{t("brawler.teamSamples", { count: trophies(row.picks) })}</p></div></a>)}</div>{!synergies.length ? <EmptyState title={t("brawler.noPairings")} /> : null}</section>
              <section><h2 className="section-title mb-4">{t("brawler.topTeams")}</h2><div className="grid gap-3 lg:grid-cols-2">{(metaQuery.data?.teams || []).filter((team) => team.picks >= 5).slice(0, 12).map((team) => <Card key={`${team.mapId}-${team.brawlerIds.join("-")}`} className="gap-3 p-4 py-4"><div className="flex -space-x-2">{team.brawlerIds.map((id) => <img key={id} src={brawlerBorderUrl(id)} alt={catalog.get(id)?.name || t("meta.brawler")} className="size-12 rounded-xl border-2 border-card" />)}</div><p className="font-medium">{team.brawlerIds.map((id) => catalog.get(id)?.name || id).join(" · ")}</p><p className="text-sm">{t("brawler.teamSummary", { rate: formatPercent(team.winRate), games: trophies(team.picks), map: maps.get(team.mapId)?.name || t("brawler.mapNamed", { id: team.mapId }) })}</p></Card>)}</div></section>
              <section>
                <h2 className="section-title mb-1">{t("brawler.countersWeaknesses")}</h2>
                <p className="mb-4 text-sm text-muted-foreground">{t("brawler.headToHeadEvidence", { window: windowLabel(trendWindow, t).toLocaleLowerCase() })}{trendQuery.data?.matchupCapped ? ` ${t("brawler.matchupCap", { count: trophies(trendQuery.data.matchupRowLimit) })}` : ""}</p>
                {matchups.length ? (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <MatchupList title={t("brawler.performsWell", { name: brawler.name })} rows={counters} catalog={catalog} tone="positive" t={t} />
                    <MatchupList title={t("brawler.hardestOpponents", { name: brawler.name })} rows={weaknesses} catalog={catalog} tone="negative" t={t} />
                  </div>
                ) : <EmptyState title={t("brawler.counterPending")} detail={t("brawler.counterPendingDetail")} />}
              </section>
            </TabsContent>
            <TabsContent value="rankings" className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2">{[[t("brawler.global"), "global"], ["US", "us"], ["GB", "gb"], ["DE", "de"], ["BR", "br"], ["JP", "jp"], ["KR", "kr"]].map(([label, code]) => <Button key={code} size="sm" variant={region === code ? "default" : "outline"} onClick={() => setRegion(code)}>{label}</Button>)}</div>
              {rankingQuery.isLoading ? <PageStatus tone="loading">{t("brawler.loadingLeaderboard")}</PageStatus> : null}
              <div className="data-surface overflow-hidden"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>{t("common.player")}</TableHead><TableHead className="text-right">{t("common.trophies")}</TableHead></TableRow></TableHeader><TableBody>{(rankingQuery.data || []).map((player, index) => <TableRow key={player.tag}><TableCell className="game-rank">{index + 1}</TableCell><TableCell><a href={appPath(`/players?tag=${encodeURIComponent(player.tag)}`)} className="flex items-center gap-3 hover:text-primary"><img src={profileIconUrl(player.icon?.id)} alt="" className="size-9 rounded-full" /><span><strong className="game-label block">{player.name}</strong><span className="text-xs text-muted-foreground">{player.tag}</span></span></a></TableCell><TableCell className="game-stat text-right text-primary">{trophies(player.trophies)}</TableCell></TableRow>)}</TableBody></Table></div>
            </TabsContent>
            <TabsContent value="history" className="mt-4 space-y-6">
              <BrawlerTrendChart points={trendQuery.data?.current.days || []} />
              <div className="grid gap-4 md:grid-cols-2">
                <CoverageCard title={t("brawler.periodComparison")} detail={trendQuery.data?.previous ? t(trendQuery.data.comparisonReady ? "brawler.periodReady" : "brawler.periodPartial", { currentStart: formatDate(trendQuery.data.current.startAt), currentEnd: formatDate(trendQuery.data.current.endAt), previousStart: formatDate(trendQuery.data.previous.startAt), previousEnd: formatDate(trendQuery.data.previous.endAt) }) : t("brawler.noPreviousPeriod")} />
                <CoverageCard title={t("brawler.balanceHistory")} detail={t("brawler.balanceHistoryDetail", { version: brawler.version || t("common.unknown") })} />
                {(metaQuery.data?.limitations || []).map((_, index) => <CoverageCard key={index} title={t("brawler.evidenceLimitation")} detail={t(index === 0 ? "brawler.buildLimitation" : "brawler.counterLimitation")} />)}
              </div>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value, detail }: { label: string; value: string; detail: string }) { return <Card className="gap-0 p-5 py-5"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-2 font-display text-3xl text-primary">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></Card>; }

function BrawlerTrendChart({ points }: { points: MetaDailyPoint[] }) {
  const { t, date } = useI18n();
  if (!points.length) return <EmptyState title={t("brawler.noDailyTrend")} detail={t("brawler.noDailyTrendDetail")} />;
  const maxPicks = Math.max(1, ...points.map((point) => point.picks));
  return (
    <Card className="gap-0 p-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="section-title">{t("brawler.dailyWinRate")}</h2></div><p className="text-xs text-muted-foreground">{t("brawler.opacityDetail")}</p></div>
      <div className="mt-5 flex h-52 items-end gap-1 overflow-x-auto border-b border-border pb-7" aria-label={t("brawler.trendAria")}>
        {points.map((point, index) => <div key={point.day} className="group relative flex h-full min-w-5 flex-1 items-end" title={t("brawler.trendPoint", { date: date(point.day, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }), rate: formatPercent(point.winRate), picks: trophies(point.picks) })}><div className="w-full rounded-t bg-accent transition group-hover:bg-primary" style={{ height: `${Math.max(3, point.winRate)}%`, opacity: 0.45 + (point.picks / maxPicks) * 0.55 }} />{index === 0 || index === points.length - 1 || (points.length > 14 && index % Math.ceil(points.length / 7) === 0) ? <span className="absolute top-full mt-2 whitespace-nowrap text-[10px] text-muted-foreground">{date(point.day, { month: "short", day: "numeric", timeZone: "UTC" })}</span> : null}</div>)}
      </div>
    </Card>
  );
}

function MapList({ title, rows, maps, t, reverse = false }: { title: string; rows: BrawlerMetaResponse["stats"]; maps: Map<number, MapListItem>; t: Translator; reverse?: boolean }) {
  return <section><h2 className="section-title mb-4">{title}</h2><div className="space-y-3">{rows.map((row, index) => { const map = maps.get(row.mapId); return <a key={row.mapId} href={appPath(`/maps/${row.mapId}`)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/60"><span className="w-5 text-center text-muted-foreground">{index + 1}</span><img src={map?.imageUrl || mapImageUrl(row.mapId)} alt="" className="size-16 rounded-lg object-cover" /><span className="min-w-0 flex-1"><strong className="block truncate">{map?.name || t("brawler.mapNamed", { id: row.mapId })}</strong><span className="text-xs text-muted-foreground">{map?.gameMode?.name || t("meta.unknownMode")} · {t("brawlers.picks", { count: trophies(row.picks) })}</span></span><span className={reverse ? "text-destructive" : "text-primary"}>{formatPercent(row.winRate)}</span></a>; })}{!rows.length ? <EmptyState title={t("brawler.notEnoughMaps")} /> : null}</div></section>;
}

function AbilityGroup({ title, abilities }: { title: string; abilities: CatalogAbility[] }) { return <section><h2 className="section-title mb-4">{title}</h2><div className="space-y-3">{abilities.map((ability) => <Card key={ability.id} className="flex-row items-start gap-4 p-4 py-4">{ability.imageUrl ? <img src={ability.imageUrl} alt="" className="size-16 rounded-xl bg-secondary p-1" /> : null}<div><h3 className="font-medium">{ability.name}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{ability.description}</p></div></Card>)}</div></section>; }

function CoverageCard({ title, detail }: { title: string; detail: string }) { return <Card className="gap-0 border border-border p-5 py-5"><p className="font-medium">{title}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p></Card>; }

function periodTotals(rows: BrawlerMetaResponse["stats"]) {
  const totals = rows.reduce((result, row) => ({ wins: result.wins + row.wins, losses: result.losses + row.losses, picks: result.picks + row.picks, starPlayer: result.starPlayer + row.starPlayer }), { wins: 0, losses: 0, picks: 0, starPlayer: 0 });
  const decided = totals.wins + totals.losses;
  return { ...totals, winRate: decided ? (totals.wins / decided) * 100 : 0, starRate: totals.picks ? (totals.starPlayer / totals.picks) * 100 : 0 };
}

function deltaPercent(current: number, previous: number, available: boolean, t: Translator) { if (!available) return t("brawler.noPriorSamples"); const delta = current - previous; return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp`; }
function deltaNumber(current: number, previous: number, available: boolean, t: Translator) { if (!available) return t("brawler.noPriorSamples"); const delta = current - previous; return `${delta > 0 ? "+" : ""}${trophies(delta)}`; }
function windowLabel(value: MetaTrendWindow, t: Translator) { return value === "all" ? t("meta.allTrackedDays") : t("meta.lastDays", { count: value }); }

function MatchupList({
  title,
  rows,
  catalog,
  tone,
  t,
}: {
  title: string;
  rows: Array<{ id: number; wins: number; losses: number; picks: number; winRate: number }>;
  catalog: Map<number, { name: string }>;
  tone: "positive" | "negative";
  t: Translator;
}) {
  return (
    <div>
      <h3 className="mb-3 font-display text-xl">{title}</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <a key={row.id} href={appPath(`/brawlers/${row.id}`)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/60">
            <img src={brawlerBorderUrl(row.id)} alt="" className="size-12 rounded-lg" />
            <span className="min-w-0 flex-1">
              <strong className="block truncate">{catalog.get(row.id)?.name || t("brawler.named", { id: row.id })}</strong>
              <span className="text-xs text-muted-foreground">{t("brawler.headSamples", { count: trophies(row.picks) })}</span>
            </span>
            <span className={tone === "positive" ? "text-primary" : "text-destructive"}>{formatPercent(row.winRate)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
