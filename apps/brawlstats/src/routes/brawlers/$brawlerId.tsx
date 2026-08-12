import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { apiFetch, brawlerBorderUrl, collection, mapImageUrl, profileIconUrl } from "@/lib/api";
import { normalizeCatalog } from "@/lib/brawlers";
import { formatPercent, trophies } from "@/lib/format";
import { appPath } from "@/lib/paths";
import type { BrawlerMetaResponse, CatalogAbility, MapListItem, MetaDailyPoint, MetaTrendsResponse, MetaTrendWindow, RankingPlayer } from "@/lib/types";
import type { TrophyBucket } from "@/lib/meta";

export const Route = createFileRoute("/brawlers/$brawlerId")({ component: BrawlerDetailPage });

const trophyBuckets: TrophyBucket[] = ["all", "0-499", "500-999", "1000+"];

function BrawlerDetailPage() {
  const { brawlerId: rawId } = Route.useParams();
  const brawlerId = Number(rawId);
  const [bucket, setBucket] = useState<TrophyBucket>("all");
  const [trendWindow, setTrendWindow] = useState<MetaTrendWindow>("30");
  const [region, setRegion] = useState("global");
  const catalogQuery = useQuery({ queryKey: ["brawlers"], queryFn: () => apiFetch("/api/brawlers").then(normalizeCatalog) });
  const mapsQuery = useQuery({ queryKey: ["maps"], queryFn: () => apiFetch("/api/maps").then((payload) => collection<MapListItem>(payload)) });
  const metaQuery = useQuery({
    queryKey: ["brawler-meta", brawlerId, bucket],
    enabled: Number.isInteger(brawlerId) && brawlerId > 0,
    queryFn: () => apiFetch<BrawlerMetaResponse>(`/api/brawler-meta?id=${brawlerId}&trophyBucket=${encodeURIComponent(bucket)}`),
  });
  const trendQuery = useQuery({
    queryKey: ["brawler-trends", brawlerId, bucket, trendWindow],
    enabled: Number.isInteger(brawlerId) && brawlerId > 0,
    queryFn: () => apiFetch<MetaTrendsResponse>(`/api/meta-trends?brawlerId=${brawlerId}&trophyBucket=${encodeURIComponent(bucket)}&window=${trendWindow}`),
  });
  const rankingQuery = useQuery({
    queryKey: ["rankings", "brawler", brawlerId, region],
    enabled: Number.isInteger(brawlerId) && brawlerId > 0,
    queryFn: () => apiFetch(`/api/rankings?kind=brawlers&country=${region}&brawlerId=${brawlerId}&limit=50`).then((payload) => collection<RankingPlayer>(payload)),
  });
  const brawler = catalogQuery.data?.find((item) => item.id === brawlerId);
  const maps = useMemo(() => new Map((mapsQuery.data || []).map((map) => [map.id, map])), [mapsQuery.data]);
  const eligibleMaps = useMemo(() => (trendQuery.data?.current.stats || []).filter((row) => row.picks >= (trendQuery.data?.minPicks || 25)), [trendQuery.data]);
  const bestMaps = useMemo(() => [...eligibleMaps].sort((a, b) => b.winRate - a.winRate || b.picks - a.picks).slice(0, 8), [eligibleMaps]);
  const worstMaps = useMemo(() => [...eligibleMaps].sort((a, b) => a.winRate - b.winRate || b.picks - a.picks).slice(0, 8), [eligibleMaps]);
  const modes = useMemo(() => {
    const result = new Map<string, { name: string; wins: number; losses: number; picks: number }>();
    for (const stat of trendQuery.data?.current.stats || []) {
      const map = maps.get(stat.mapId);
      const key = String(map?.gameMode?.id || "unknown");
      const row = result.get(key) || { name: map?.gameMode?.name || "Unknown mode", wins: 0, losses: 0, picks: 0 };
      row.wins += stat.wins;
      row.losses += stat.losses;
      row.picks += stat.picks;
      result.set(key, row);
    }
    return [...result.values()].map((row) => ({ ...row, winRate: row.wins + row.losses ? (row.wins / (row.wins + row.losses)) * 100 : 0 })).filter((row) => row.picks >= (trendQuery.data?.minPicks || 25)).sort((a, b) => b.winRate - a.winRate);
  }, [maps, trendQuery.data]);
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

  if (!Number.isInteger(brawlerId) || brawlerId <= 0) return <div className="page-shell"><EmptyState title="Invalid brawler id" /></div>;
  return (
    <div className="page-shell">
      {loading ? <PageStatus tone="loading">Loading brawler profile and observed meta…</PageStatus> : null}
      {catalogQuery.error || metaQuery.error || trendQuery.error || mapsQuery.error ? <PageStatus tone="error">Unable to load this brawler.</PageStatus> : null}
      {!loading && !brawler ? <EmptyState title="Brawler not found" detail="The live catalog does not contain this brawler." /> : null}
      {brawler ? (
        <>
          <section className="relative overflow-hidden rounded-xl border border-border bg-card p-6 md:p-8" style={{ background: `radial-gradient(circle at 85% 30%, ${brawler.color}42, transparent 35%), #101926` }}>
            <div className="grid items-center gap-6 md:grid-cols-[1fr_340px]">
              <div>
                <div className="flex flex-wrap gap-2"><Badge style={{ background: brawler.color, color: "#07101a" }}>{brawler.rarity}</Badge><Badge variant="secondary">{brawler.role}</Badge></div>
                <h1 className="mt-3 font-display text-5xl md:text-6xl">{brawler.name}</h1>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{brawler.description}</p>
                <p className="mt-4 text-xs text-muted-foreground">Catalog revision {brawler.version || "unversioned"} · Released brawler</p>
              </div>
              <img src={brawler.imageUrl2 || brawler.imageUrl || brawlerBorderUrl(brawler.id)} alt={brawler.name} className="mx-auto max-h-72 w-full object-contain drop-shadow-2xl" />
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            {trophyBuckets.map((value) => <Button key={value} size="sm" variant={bucket === value ? "default" : "outline"} onClick={() => setBucket(value)}>{value === "all" ? "All trophies" : `${value} trophies`}</Button>)}
            <span className="mx-1 hidden w-px bg-border sm:block" />
            {(["7", "30", "90", "all"] as const).map((value) => <Button key={value} size="sm" variant={trendWindow === value ? "secondary" : "outline"} onClick={() => setTrendWindow(value)}>{value === "all" ? "All tracked" : `${value} days`}</Button>)}
          </div>

          {trendQuery.data && !trendQuery.data.coverageStartAt ? <CoverageCard title="Trend coverage has not started" detail="This brawler's dated history begins with the next newly ingested battle. Cumulative samples are not assigned invented dates." /> : null}
          {trendQuery.data?.coverageStartAt ? <CoverageCard title={`Daily coverage begins ${formatDate(trendQuery.data.coverageStartAt)} UTC`} detail={`${trendQuery.data.currentCoverageComplete ? "The selected window starts after tracking began; days without observed samples remain gaps." : "The selected window starts before tracking coverage or reached the bounded row limit, so results are partial."} ${trendQuery.data.comparisonReady ? "Both periods start after coverage began and contain samples." : "Previous-period deltas remain partial until both periods have eligible coverage and samples."}`} /> : null}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Summary label="Window win rate" value={formatPercent(currentTotals.winRate)} detail={`${deltaPercent(currentTotals.winRate, previousTotals.winRate, Boolean(trendQuery.data?.previous?.sampleSize))} vs previous period`} />
            <Summary label="Window picks" value={trophies(currentTotals.picks)} detail={`${deltaNumber(currentTotals.picks, previousTotals.picks, Boolean(trendQuery.data?.previous?.sampleSize))} vs previous period`} />
            <Summary label="Star player rate" value={formatPercent(currentTotals.starRate)} detail={`${deltaPercent(currentTotals.starRate, previousTotals.starRate, Boolean(trendQuery.data?.previous?.sampleSize))} vs previous period`} />
            <Summary label="Qualified maps" value={String(eligibleMaps.length)} detail={`At least ${trendQuery.data?.minPicks || 25} picks · ${windowLabel(trendWindow)}`} />
          </section>

          <Tabs defaultValue="meta">
            <TabsList><TabsTrigger value="meta">Maps & modes</TabsTrigger><TabsTrigger value="loadout">Complete loadout</TabsTrigger><TabsTrigger value="teams">Teams & synergies</TabsTrigger><TabsTrigger value="rankings">Leaderboard</TabsTrigger><TabsTrigger value="history">History & evidence</TabsTrigger></TabsList>
            <TabsContent value="meta" className="mt-4 space-y-8">
              <p className="text-sm text-muted-foreground">Map and mode results use {windowLabel(trendWindow).toLowerCase()} of prospective daily coverage. Team and matchup panels remain cumulative and are labeled by their samples.</p>
              <div className="grid gap-6 lg:grid-cols-2">
                <MapList title="Best maps" rows={bestMaps} maps={maps} />
                <MapList title="Hardest maps" rows={worstMaps} maps={maps} reverse />
              </div>
              <section><h2 className="section-title mb-4">Mode performance</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{modes.map((mode) => <Card key={mode.name} className="gap-0 p-4 py-4"><p className="font-medium">{mode.name}</p><p className="mt-2 font-display text-3xl text-primary">{formatPercent(mode.winRate)}</p><p className="text-xs text-muted-foreground">{trophies(mode.picks)} picks</p></Card>)}</div>{!modes.length ? <EmptyState title="No modes meet the sample threshold" /> : null}</section>
            </TabsContent>
            <TabsContent value="loadout" className="mt-4 space-y-8">
              <div className="grid gap-6 lg:grid-cols-2"><AbilityGroup title="Gadgets" abilities={brawler.gadgets} /><AbilityGroup title="Star Powers" abilities={brawler.starPowers} /></div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <CoverageCard title="Gears" detail="The live catalog does not map gear availability per brawler. Player profiles expose only the gears an individual owns." />
                <CoverageCard title="Hypercharge" detail="Hypercharge ownership and catalog metadata are not exposed by the upstream APIs, so no claim is made here." />
                <CoverageCard title="Buffies" detail="Buffie catalog metadata is not available from the current upstream catalog. This panel will populate only when a source exposes it." />
                <CoverageCard title="Skins and pins" detail="The current catalog provides border, borderless, and emoji artwork for the base brawler, but does not expose a complete skin or pin collection." />
              </div>
              <CoverageCard title="Build performance" detail="Official battle logs identify the brawler but omit equipped gadgets, Star Powers, and gears. Publishing build win/use rates would fabricate a connection the data cannot support." />
            </TabsContent>
            <TabsContent value="teams" className="mt-4 space-y-8">
              <section><h2 className="section-title mb-4">Best observed partners</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{synergies.map((row) => <a key={row.id} href={appPath(`/brawlers/${row.id}`)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/60"><img src={brawlerBorderUrl(row.id)} alt="" className="size-14 rounded-xl" /><div><p className="font-medium">{catalog.get(row.id)?.name || `Brawler ${row.id}`}</p><p className="text-sm text-primary">{formatPercent(row.winRate)} win rate</p><p className="text-xs text-muted-foreground">{trophies(row.picks)} team samples</p></div></a>)}</div>{!synergies.length ? <EmptyState title="No team pairing has enough samples" /> : null}</section>
              <section><h2 className="section-title mb-4">Top full teams</h2><div className="grid gap-3 lg:grid-cols-2">{(metaQuery.data?.teams || []).filter((team) => team.picks >= 5).slice(0, 12).map((team) => <Card key={`${team.mapId}-${team.brawlerIds.join("-")}`} className="gap-3 p-4 py-4"><div className="flex -space-x-2">{team.brawlerIds.map((id) => <img key={id} src={brawlerBorderUrl(id)} alt={catalog.get(id)?.name || "Brawler"} className="size-12 rounded-xl border-2 border-card" />)}</div><p className="font-medium">{team.brawlerIds.map((id) => catalog.get(id)?.name || id).join(" · ")}</p><p className="text-sm"><span className="text-primary">{formatPercent(team.winRate)} WR</span> · {trophies(team.picks)} games · {maps.get(team.mapId)?.name || `Map ${team.mapId}`}</p></Card>)}</div></section>
              <section>
                <h2 className="section-title mb-1">Counters and weaknesses</h2>
                <p className="mb-4 text-sm text-muted-foreground">Head-to-head evidence from {windowLabel(trendWindow).toLowerCase()} only.{trendQuery.data?.matchupCapped ? ` The result reached its ${trophies(trendQuery.data.matchupRowLimit)}-row matchup limit and is partial.` : ""}</p>
                {matchups.length ? (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <MatchupList title={`${brawler.name} performs well into`} rows={counters} catalog={catalog} tone="positive" />
                    <MatchupList title={`Hardest opponents for ${brawler.name}`} rows={weaknesses} catalog={catalog} tone="negative" />
                  </div>
                ) : <EmptyState title="Counter samples are still accumulating" detail="Head-to-head evidence begins prospectively and appears after at least 10 tracked games against an opponent." />}
              </section>
            </TabsContent>
            <TabsContent value="rankings" className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2">{[["Global", "global"], ["US", "us"], ["GB", "gb"], ["DE", "de"], ["BR", "br"], ["JP", "jp"], ["KR", "kr"]].map(([label, code]) => <Button key={code} size="sm" variant={region === code ? "default" : "outline"} onClick={() => setRegion(code)}>{label}</Button>)}</div>
              {rankingQuery.isLoading ? <PageStatus tone="loading">Loading official leaderboard…</PageStatus> : null}
              <div className="data-surface overflow-hidden"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Player</TableHead><TableHead className="text-right">Trophies</TableHead></TableRow></TableHeader><TableBody>{(rankingQuery.data || []).map((player, index) => <TableRow key={player.tag}><TableCell>{index + 1}</TableCell><TableCell><a href={appPath(`/players?tag=${encodeURIComponent(player.tag)}`)} className="flex items-center gap-3 hover:text-primary"><img src={profileIconUrl(player.icon?.id)} alt="" className="size-9 rounded-full" /><span><strong className="block">{player.name}</strong><span className="text-xs text-muted-foreground">{player.tag}</span></span></a></TableCell><TableCell className="text-right text-primary">{trophies(player.trophies)}</TableCell></TableRow>)}</TableBody></Table></div>
            </TabsContent>
            <TabsContent value="history" className="mt-4 space-y-6">
              <BrawlerTrendChart points={trendQuery.data?.current.days || []} />
              <div className="grid gap-4 md:grid-cols-2">
                <CoverageCard title="Period comparison" detail={trendQuery.data?.previous ? `${formatDate(trendQuery.data.current.startAt)}–${formatDate(trendQuery.data.current.endAt)} compared with ${formatDate(trendQuery.data.previous.startAt)}–${formatDate(trendQuery.data.previous.endAt)} UTC. ${trendQuery.data.comparisonReady ? "Both periods start after prospective coverage began and contain samples; individual days may still have gaps." : "At least one period is partial; deltas include only observed samples."}` : "All-tracked mode has no equally sized preceding period."} />
                <CoverageCard title="Balance history" detail={`The catalog identifies revision ${brawler.version || "unknown"}, but it does not include dated balance changes. BrawlStats does not invent a patch timeline.`} />
                {(metaQuery.data?.limitations || []).map((detail) => <CoverageCard key={detail} title="Evidence limitation" detail={detail} />)}
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
  if (!points.length) return <EmptyState title="No daily trend samples yet" detail="Dated performance begins prospectively with newly ingested battles." />;
  const maxPicks = Math.max(1, ...points.map((point) => point.picks));
  return (
    <Card className="gap-0 p-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="eyebrow">Prospective daily record</p><h2 className="section-title">Win rate by UTC day</h2></div><p className="text-xs text-muted-foreground">Opacity reflects daily sample volume</p></div>
      <div className="mt-5 flex h-52 items-end gap-1 overflow-x-auto border-b border-border pb-7" aria-label="Brawler daily win rate trend">
        {points.map((point, index) => <div key={point.day} className="group relative flex h-full min-w-5 flex-1 items-end" title={`${formatDate(point.day)}: ${formatPercent(point.winRate)}, ${trophies(point.picks)} picks`}><div className="w-full rounded-t bg-accent transition group-hover:bg-primary" style={{ height: `${Math.max(3, point.winRate)}%`, opacity: 0.45 + (point.picks / maxPicks) * 0.55 }} />{index === 0 || index === points.length - 1 || (points.length > 14 && index % Math.ceil(points.length / 7) === 0) ? <span className="absolute top-full mt-2 whitespace-nowrap text-[10px] text-muted-foreground">{formatShortDate(point.day)}</span> : null}</div>)}
      </div>
    </Card>
  );
}

function MapList({ title, rows, maps, reverse = false }: { title: string; rows: BrawlerMetaResponse["stats"]; maps: Map<number, MapListItem>; reverse?: boolean }) {
  return <section><h2 className="section-title mb-4">{title}</h2><div className="space-y-3">{rows.map((row, index) => { const map = maps.get(row.mapId); return <a key={row.mapId} href={appPath(`/maps/${row.mapId}`)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/60"><span className="w-5 text-center text-muted-foreground">{index + 1}</span><img src={map?.imageUrl || mapImageUrl(row.mapId)} alt="" className="size-16 rounded-lg object-cover" /><span className="min-w-0 flex-1"><strong className="block truncate">{map?.name || `Map ${row.mapId}`}</strong><span className="text-xs text-muted-foreground">{map?.gameMode?.name || "Unknown mode"} · {trophies(row.picks)} picks</span></span><span className={reverse ? "text-destructive" : "text-primary"}>{formatPercent(row.winRate)}</span></a>; })}{!rows.length ? <EmptyState title="Not enough map samples yet" /> : null}</div></section>;
}

function AbilityGroup({ title, abilities }: { title: string; abilities: CatalogAbility[] }) { return <section><h2 className="section-title mb-4">{title}</h2><div className="space-y-3">{abilities.map((ability) => <Card key={ability.id} className="flex-row items-start gap-4 p-4 py-4">{ability.imageUrl ? <img src={ability.imageUrl} alt="" className="size-16 rounded-xl bg-secondary p-1" /> : null}<div><h3 className="font-medium">{ability.name}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{ability.description}</p></div></Card>)}</div></section>; }

function CoverageCard({ title, detail }: { title: string; detail: string }) { return <Card className="gap-0 border border-border p-5 py-5"><p className="font-medium">{title}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p></Card>; }

function periodTotals(rows: BrawlerMetaResponse["stats"]) {
  const totals = rows.reduce((result, row) => ({ wins: result.wins + row.wins, losses: result.losses + row.losses, picks: result.picks + row.picks, starPlayer: result.starPlayer + row.starPlayer }), { wins: 0, losses: 0, picks: 0, starPlayer: 0 });
  const decided = totals.wins + totals.losses;
  return { ...totals, winRate: decided ? (totals.wins / decided) * 100 : 0, starRate: totals.picks ? (totals.starPlayer / totals.picks) * 100 : 0 };
}

function deltaPercent(current: number, previous: number, available: boolean) { if (!available) return "No prior samples"; const delta = current - previous; return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp`; }
function deltaNumber(current: number, previous: number, available: boolean) { if (!available) return "No prior samples"; const delta = current - previous; return `${delta > 0 ? "+" : ""}${trophies(delta)}`; }
function formatDate(value?: number | null) { return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"; }
function formatShortDate(value: number) { return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); }
function windowLabel(value: MetaTrendWindow) { return value === "all" ? "All tracked days" : `Last ${value} days`; }

function MatchupList({
  title,
  rows,
  catalog,
  tone,
}: {
  title: string;
  rows: Array<{ id: number; wins: number; losses: number; picks: number; winRate: number }>;
  catalog: Map<number, { name: string }>;
  tone: "positive" | "negative";
}) {
  return (
    <div>
      <h3 className="mb-3 font-display text-xl">{title}</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <a key={row.id} href={appPath(`/brawlers/${row.id}`)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/60">
            <img src={brawlerBorderUrl(row.id)} alt="" className="size-12 rounded-lg" />
            <span className="min-w-0 flex-1">
              <strong className="block truncate">{catalog.get(row.id)?.name || `Brawler ${row.id}`}</strong>
              <span className="text-xs text-muted-foreground">{trophies(row.picks)} head-to-head samples</span>
            </span>
            <span className={tone === "positive" ? "text-primary" : "text-destructive"}>{formatPercent(row.winRate)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
