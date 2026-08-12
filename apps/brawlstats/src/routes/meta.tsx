import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageStatus } from "@/components/ui-helpers";
import { apiFetch, brawlerBorderUrl, collection } from "@/lib/api";
import { normalizeCatalog } from "@/lib/brawlers";
import { formatPercent, trophies } from "@/lib/format";
import { aggregateMeta, type AggregatedMetaRow, type TrophyBucket } from "@/lib/meta";
import { appPath } from "@/lib/paths";
import type { MapListItem, MetaDailyPoint, MetaTrendsResponse, MetaTrendWindow } from "@/lib/types";

type Metric = "win" | "use" | "picks" | "star";
type Grouping = "brawler" | "map" | "mode";
type MetaSearch = { metric?: Metric; group?: Grouping; trophy?: TrophyBucket; compare?: TrophyBucket | "previous" | "off"; window?: MetaTrendWindow; min?: number; q?: string };

export const Route = createFileRoute("/meta")({
  validateSearch: (search: Record<string, unknown>): MetaSearch => ({
    metric: isMetric(search.metric) ? search.metric : undefined,
    group: isGrouping(search.group) ? search.group : undefined,
    trophy: isBucket(search.trophy) ? search.trophy : undefined,
    compare: search.compare === "off" || search.compare === "previous" || isBucket(search.compare) ? search.compare : undefined,
    window: isTrendWindow(search.window) ? search.window : undefined,
    min: typeof search.min === "number" && Number.isFinite(search.min) ? Math.max(1, Math.floor(search.min)) : typeof search.min === "string" && /^\d+$/.test(search.min) ? Math.max(1, Number(search.min)) : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: MetaResearchPage,
});

function MetaResearchPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [copied, setCopied] = useState(false);
  const metric = search.metric || "win";
  const grouping = search.group || "brawler";
  const trophyBucket = search.trophy || "all";
  const compareBucket = search.compare || "previous";
  const trendWindow = search.window || "30";
  const minSamples = search.min || 25;
  const catalogQuery = useQuery({ queryKey: ["brawlers"], queryFn: () => apiFetch("/api/brawlers").then(normalizeCatalog) });
  const mapsQuery = useQuery({ queryKey: ["maps"], queryFn: () => apiFetch("/api/maps").then((payload) => collection<MapListItem>(payload)) });
  const primaryQuery = useQuery({ queryKey: ["meta-trends", trophyBucket, trendWindow], queryFn: () => apiFetch<MetaTrendsResponse>(`/api/meta-trends?trophyBucket=${encodeURIComponent(trophyBucket)}&window=${trendWindow}`) });
  const comparisonQuery = useQuery({ queryKey: ["meta-trends", compareBucket, trendWindow], enabled: compareBucket !== "off" && compareBucket !== "previous" && compareBucket !== trophyBucket, queryFn: () => apiFetch<MetaTrendsResponse>(`/api/meta-trends?trophyBucket=${encodeURIComponent(compareBucket)}&window=${trendWindow}`) });
  const catalog = useMemo(() => new Map((catalogQuery.data || []).map((item) => [item.id, item])), [catalogQuery.data]);
  const maps = useMemo(() => new Map((mapsQuery.data || []).map((item) => [item.id, item])), [mapsQuery.data]);
  const rows = useMemo(() => {
    const q = (search.q || "").trim().toLowerCase();
    return aggregateMeta(primaryQuery.data?.current.stats || [], grouping, catalog, maps)
      .filter((row) => row.picks >= minSamples && (!q || row.label.toLowerCase().includes(q)))
      .sort((a, b) => metricValue(b, metric) - metricValue(a, metric) || b.picks - a.picks);
  }, [catalog, grouping, maps, metric, minSamples, primaryQuery.data, search.q]);
  const comparison = useMemo(() => {
    const source = compareBucket === "previous"
      ? primaryQuery.data?.previous?.stats
      : compareBucket === trophyBucket
        ? primaryQuery.data?.current.stats
        : comparisonQuery.data?.current.stats;
    return new Map(aggregateMeta(source || [], grouping, catalog, maps).map((row) => [row.key, row]));
  }, [catalog, compareBucket, comparisonQuery.data, grouping, maps, primaryQuery.data, trophyBucket]);
  const maxMetric = Math.max(1, ...rows.map((row) => metricValue(row, metric)));
  const update = (patch: Partial<MetaSearch>) => void navigate({ search: { ...search, ...patch }, replace: true });

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  const exportCsv = () => {
    const header = ["group", "label", "trophy_bucket", "window", "period_start_utc", "period_end_utc", "wins", "losses", "picks", "win_rate", "use_rate", "star_player_rate", compareBucket !== "off" ? `delta_${metric}` : ""].filter(Boolean);
    const lines = rows.map((row) => {
      const compare = comparison.get(row.key);
      const delta = compare ? metricValue(row, metric) - metricValue(compare, metric) : "";
      return [grouping, row.label, trophyBucket, trendWindow, dateIso(primaryQuery.data?.current.startAt), dateIso(primaryQuery.data?.current.endAt), row.wins, row.losses, row.picks, row.winRate.toFixed(4), row.useRate.toFixed(4), row.starRate.toFixed(4), delta].filter((_, index) => index < header.length).map(csvCell).join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `brawlstats-meta-${grouping}-${trophyBucket}-${trendWindow}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const error = primaryQuery.error || catalogQuery.error || mapsQuery.error || comparisonQuery.error;
  return (
    <div className="page-shell">
      <header><p className="eyebrow">Meta research lab</p><h1 className="font-display text-4xl md:text-5xl">Interrogate the live BrawlStats dataset</h1><p className="mt-3 max-w-3xl text-muted-foreground">Change the date window, metric, grouping, trophy range, and confidence floor. Compare with the immediately preceding period or another trophy bracket, share the exact query, or export the result as CSV.</p></header>

      <div className="data-surface grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Filter label="Win rate" value={metric} options={[["win", "Win rate"], ["use", "Use rate"], ["picks", "Sample size"], ["star", "Star player rate"]]} onChange={(value) => update({ metric: value as Metric })} />
        <Filter label="Brawler" value={grouping} options={[["brawler", "Group by brawler"], ["map", "Group by map"], ["mode", "Group by mode"]]} onChange={(value) => update({ group: value as Grouping })} />
        <Filter label="All trophies" value={trophyBucket} options={bucketOptions("Primary")} onChange={(value) => update({ trophy: value as TrophyBucket })} />
        <Filter label="Last 30 days" value={trendWindow} options={[["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["all", "All tracked days"]]} onChange={(value) => update({ window: value as MetaTrendWindow })} />
        <Filter label="Previous period" value={compareBucket} options={[["previous", "Previous period"], ["off", "No comparison"], ...bucketOptions("Compare bracket")]} onChange={(value) => update({ compare: value as TrophyBucket | "previous" | "off" })} />
        <Input value={search.q || ""} onChange={(event) => update({ q: event.target.value || undefined })} placeholder={`Search ${grouping}s`} className="lg:col-span-2" />
        <label className="flex items-center gap-3 rounded-lg border border-input px-3 text-sm"><span className="shrink-0 text-muted-foreground">Min samples</span><Input type="number" min={1} max={10000} value={minSamples} onChange={(event) => update({ min: Math.max(1, Number(event.target.value) || 1) })} className="h-8 border-0 text-right" /></label>
        <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => void copyLink()}>{copied ? "Copied" : "Copy link"}</Button><Button className="flex-1" onClick={exportCsv} disabled={!rows.length}>Export CSV</Button></div>
      </div>

      {primaryQuery.isLoading || catalogQuery.isLoading || mapsQuery.isLoading || comparisonQuery.isLoading ? <PageStatus tone="loading">Aggregating meta rows…</PageStatus> : null}
      {error ? <PageStatus tone="error">{error instanceof Error ? error.message : "Meta research data failed to load."}</PageStatus> : null}
      {primaryQuery.data?.current.capped ? <PageStatus tone="error">This query reached its {trophies(primaryQuery.data.rowLimit)}-row safety cap. Exported and displayed results cover the returned bounded sample.</PageStatus> : null}
      {primaryQuery.data && !primaryQuery.data.coverageStartAt ? <CoverageNotice title="Trend coverage has not started" detail="Daily aggregates begin with the next newly ingested battle. Cumulative historical totals are intentionally not copied into dated buckets." /> : null}
      {primaryQuery.data?.coverageStartAt ? <CoverageNotice title={`Daily coverage begins ${formatDate(primaryQuery.data.coverageStartAt)} UTC`} detail={`${windowLabel(trendWindow)} · ${primaryQuery.data.currentCoverageComplete ? "The window starts after prospective tracking began; individual UTC days may still have no observed samples" : "The window predates coverage or reached a row limit, so it is partial"}.`} /> : null}
      {compareBucket === "previous" && primaryQuery.data?.previous && !primaryQuery.data.comparisonReady ? <CoverageNotice title="Previous-period comparison is partial" detail="Deltas are shown only from observed daily rows, but tracking did not begin before both periods, one period lacks samples, or a row limit was reached. Do not interpret them as a complete-period trend." /> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Returned groups" value={trophies(rows.length)} detail={`At least ${trophies(minSamples)} samples`} />
        <Summary label="Observed picks" value={trophies(primaryQuery.data?.current.sampleSize || 0)} detail={`${formatDate(primaryQuery.data?.current.startAt)}–${formatDate(primaryQuery.data?.current.endAt)} UTC`} />
        <Summary label={`Top ${metricLabel(metric)}`} value={rows[0] ? displayMetric(rows[0], metric) : "—"} detail={rows[0]?.label || "No qualifying group"} />
        <Summary label="Comparison" value={compareBucket === "off" ? "Off" : compareBucket === "previous" ? "Previous period" : compareBucket} detail={compareBucket === "previous" ? (trendWindow === "all" ? "All-tracked has no equal preceding period" : primaryQuery.data?.comparisonReady ? "Both periods start after coverage began and contain samples" : "Partial until enough history accrues") : compareBucket === trophyBucket ? "Same bracket: deltas are zero" : "Same dates, different bracket"} />
      </section>

      <TrendChart points={primaryQuery.data?.current.days || []} />

      <div className="data-surface overflow-hidden">
        <Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>{grouping[0].toUpperCase() + grouping.slice(1)}</TableHead><TableHead className="text-right">Win rate</TableHead><TableHead className="text-right">Use rate</TableHead><TableHead className="text-right">Star rate</TableHead><TableHead className="text-right">Samples</TableHead>{compareBucket !== "off" ? <TableHead className="text-right">Δ {metricLabel(metric)}</TableHead> : null}</TableRow></TableHeader><TableBody>{rows.slice(0, 250).map((row, index) => { const compare = comparison.get(row.key); const delta = compare ? metricValue(row, metric) - metricValue(compare, metric) : null; return <TableRow key={row.key}><TableCell className="text-muted-foreground">{index + 1}</TableCell><TableCell><GroupLabel row={row} grouping={grouping} /></TableCell><TableCell className="text-right">{formatPercent(row.winRate)}</TableCell><TableCell className="text-right">{formatPercent(row.useRate)}</TableCell><TableCell className="text-right">{formatPercent(row.starRate)}</TableCell><TableCell className="text-right"><div className="ml-auto w-28"><span>{trophies(row.picks)}</span><div className="mt-1 h-1 rounded bg-secondary"><div className="h-full rounded bg-primary" style={{ width: `${Math.max(2, (metricValue(row, metric) / maxMetric) * 100)}%` }} /></div></div></TableCell>{compareBucket !== "off" ? <TableCell className={`text-right ${delta === null ? "text-muted-foreground" : delta >= 0 ? "text-accent" : "text-destructive"}`}>{delta === null ? "—" : `${delta > 0 ? "+" : ""}${metric === "picks" ? Math.round(delta) : `${delta.toFixed(2)}pp`}`}</TableCell> : null}</TableRow>; })}</TableBody></Table>
      </div>
      <p className="text-xs text-muted-foreground">Rates come from first-party aggregates of collected official battle logs. Use rate is calculated within the selected grouping result. These are observational, not causal. Rows below the chosen sample floor are excluded.</p>
    </div>
  );
}

function GroupLabel({ row, grouping }: { row: AggregatedMetaRow; grouping: Grouping }) {
  const href = grouping === "brawler" && row.brawlerId ? `/brawlers/${row.brawlerId}` : grouping === "map" && row.mapId ? `/maps/${row.mapId}` : null;
  const body = <span className="flex items-center gap-3">{grouping === "brawler" && row.brawlerId ? <img src={brawlerBorderUrl(row.brawlerId)} alt="" className="size-9 rounded-lg" /> : null}<strong>{row.label}</strong></span>;
  return href ? <a href={appPath(href)} className="hover:text-primary">{body}</a> : body;
}
function TrendChart({ points }: { points: MetaDailyPoint[] }) {
  if (!points.length) return <CoverageNotice title="No daily samples in this window" detail="The dated series will appear as newly ingested battles populate prospective daily aggregates." />;
  const maxPicks = Math.max(1, ...points.map((point) => point.picks));
  return (
    <Card className="gap-0 p-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><p className="eyebrow">Daily observed trend</p><h2 className="section-title">Win rate and sample volume</h2></div>
        <p className="text-xs text-muted-foreground">Each column is one UTC day with recorded samples</p>
      </div>
      <div className="mt-5 flex h-52 items-end gap-1 overflow-x-auto border-b border-border pb-7" aria-label="Daily win rate trend">
        {points.map((point, index) => (
          <div key={point.day} className="group relative flex h-full min-w-4 flex-1 items-end" title={`${formatDate(point.day)}: ${formatPercent(point.winRate)} win rate, ${trophies(point.picks)} picks`}>
            <div className="w-full rounded-t bg-primary/80 transition group-hover:bg-primary" style={{ height: `${Math.max(3, point.winRate)}%`, opacity: 0.45 + (point.picks / maxPicks) * 0.55 }} />
            {(index === 0 || index === points.length - 1 || (points.length > 14 && index % Math.ceil(points.length / 7) === 0)) ? <span className="absolute top-full mt-2 whitespace-nowrap text-[10px] text-muted-foreground">{formatShortDate(point.day)}</span> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
function CoverageNotice({ title, detail }: { title: string; detail: string }) { return <Card className="gap-0 border border-accent/40 p-4 py-4"><p className="font-medium text-accent">{title}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></Card>; }
function Summary({ label, value, detail }: { label: string; value: string; detail: string }) { return <Card className="gap-0 p-5 py-5"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-2 truncate font-display text-3xl text-primary">{value}</p><p className="truncate text-xs text-muted-foreground">{detail}</p></Card>; }
function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) { const selected = options.find(([key]) => key === value)?.[1] || label; return <Select value={value} onValueChange={(next) => onChange(next || value)}><SelectTrigger className="h-9 w-full"><SelectValue>{selected}</SelectValue></SelectTrigger><SelectContent alignItemWithTrigger={false}>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select>; }
function bucketOptions(prefix: string) { return [["all", `${prefix}: all trophies`], ["0-499", `${prefix}: 0–499`], ["500-999", `${prefix}: 500–999`], ["1000+", `${prefix}: 1,000+`]]; }
function metricValue(row: AggregatedMetaRow, metric: Metric) { if (metric === "win") return row.winRate; if (metric === "use") return row.useRate; if (metric === "star") return row.starRate; return row.picks; }
function displayMetric(row: AggregatedMetaRow, metric: Metric) { return metric === "picks" ? trophies(row.picks) : formatPercent(metricValue(row, metric)); }
function metricLabel(metric: Metric) { return metric === "win" ? "win rate" : metric === "use" ? "use rate" : metric === "star" ? "star rate" : "samples"; }
function csvCell(value: string | number) { const text = String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function dateIso(value?: number | null) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }
function formatDate(value?: number | null) { return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"; }
function formatShortDate(value: number) { return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); }
function windowLabel(value: MetaTrendWindow) { return value === "all" ? "All tracked days" : `Last ${value} days`; }
function isMetric(value: unknown): value is Metric { return value === "win" || value === "use" || value === "picks" || value === "star"; }
function isGrouping(value: unknown): value is Grouping { return value === "brawler" || value === "map" || value === "mode"; }
function isBucket(value: unknown): value is TrophyBucket { return value === "all" || value === "0-499" || value === "500-999" || value === "1000+"; }
function isTrendWindow(value: unknown): value is MetaTrendWindow { return value === "7" || value === "30" || value === "90" || value === "all"; }
