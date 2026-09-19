import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Database, ExternalLink, RefreshCw, Radar, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageStatus } from "@/components/ui-helpers";
import { fetchPipelineStatus, type PipelineStatus } from "@/lib/pipeline";

const hubOrigin = (import.meta.env.VITE_STATSCONNECT_ORIGIN || "https://statsconnect.app").replace(/\/$/, "");

export const Route = createFileRoute("/beta")({
  component: PipelineBetaPage,
  head: () => ({
    meta: [
      { title: "Data Pipeline Beta · StatsConnect Brawl Stars" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

function PipelineBetaPage() {
  const statusQuery = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: fetchPipelineStatus,
    refetchInterval: 30_000,
  });

  const status = statusQuery.data;
  const latestCrawl = status?.recentRuns.find((run) => run.job === "crawl");
  const latestDiscovery = status?.recentRuns.find((run) => run.job === "discover");
  const healthy = Boolean(status?.controls.crawlerEnabled && latestCrawl?.ok && latestDiscovery?.ok);
  const needsConfiguration = latestDiscovery?.note?.includes("not configured") ?? false;

  return (
    <div className="page-shell">
      <section className="data-surface border-l-4 border-l-accent p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge>Beta</Badge>
              <Badge variant={healthy ? "secondary" : "destructive"}>
                {needsConfiguration
                  ? "Configuration required"
                  : latestCrawl || latestDiscovery
                    ? healthy
                      ? "Crawler online"
                      : "Needs attention"
                    : "Awaiting first run"}
              </Badge>
            </div>
            <h1 className="mt-2 font-display text-4xl md:text-5xl">Crawler control room</h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Live coverage and run telemetry for the battle-log crawler behind StatsConnect Brawl Stars map and team insights.
              Rankings and club rosters expand the durable crawl queue; one-time player lookups stay cache-only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void statusQuery.refetch()}
              disabled={statusQuery.isFetching}
            >
              <RefreshCw className={statusQuery.isFetching ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button render={<a href={hubOrigin} />}>
              StatsConnect hub
              <ExternalLink />
            </Button>
          </div>
        </div>
      </section>

      {statusQuery.isLoading ? <PageStatus tone="loading">Loading crawler telemetry…</PageStatus> : null}
      {statusQuery.error ? (
        <PageStatus tone="error">
          {statusQuery.error instanceof Error ? statusQuery.error.message : "Crawler telemetry is unavailable."}
        </PageStatus>
      ) : null}

      {status && !status.controls.crawlerEnabled ? (
        <PageStatus tone="error">The Brawl crawler kill switch is active. Cached player data remains available.</PageStatus>
      ) : null}

      {status ? <PipelineDashboard status={status} /> : null}
    </div>
  );
}

function PipelineDashboard({ status }: { status: PipelineStatus }) {
  const counters = new Map(status.counters.map((counter) => [counter.name, counter.value]));
  const statCards = [
    {
      label: "Crawl targets",
      value: cappedNumber(status.targets.total, status.targets.capped),
      detail: `${cappedNumber(status.targets.due, status.targets.capped)} due · ${number(status.targets.expiring)} legacy expiring`,
      icon: Radar,
    },
    {
      label: "Battles · 24h",
      value: cappedNumber(status.battlesLast24Hours.count, status.battlesLast24Hours.capped),
      detail: `${number(counters.get("battles_ingested") || 0)} ingested by crawler`,
      icon: Database,
    },
    {
      label: "API calls · current hour",
      value: cappedNumber(status.apiCallsLastHour.total, status.apiCallsLastHour.capped),
      detail: `${number(status.apiCallsLastHour.failures)} failed · ${number(status.apiCallsLastHour.rateLimited)} rate limited`,
      icon: Activity,
    },
    {
      label: "Lifetime failures",
      value: number(counters.get("api_failures") || 0),
      detail: `${number(status.controls.crawlReserved)}/${number(status.controls.crawlHourlyLimit)} crawl budget reserved`,
      icon: TriangleAlert,
    },
  ] as const;

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="bg-card/45">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardDescription>{stat.label}</CardDescription>
                  <Icon className="size-4 text-accent" />
                </div>
                <CardTitle className="font-display text-3xl text-primary">{stat.value}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{stat.detail}</CardContent>
            </Card>
          );
        })}
      </section>

      <Card className="bg-card/45">
        <CardHeader>
          <CardTitle>Recent pipeline runs</CardTitle>
          <CardDescription>
            Discovery refreshes durable targets every six hours. Battle logs poll adaptively; profiles refresh separately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status.recentRuns.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Discovered</TableHead>
                  <TableHead className="text-right">Fetched</TableHead>
                  <TableHead className="text-right">Battles</TableHead>
                  <TableHead className="text-right">Failures</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.recentRuns.map((run) => {
                  const running = !run.finishedAt;
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium capitalize">{run.job}</TableCell>
                      <TableCell>
                        <Badge variant={running ? "outline" : run.ok ? "secondary" : "destructive"}>
                          {running ? "Running" : run.ok ? "Complete" : "Failed"}
                        </Badge>
                      </TableCell>
                      <TableCell title={new Date(run.startedAt).toLocaleString()}>{relativeTime(run.startedAt)}</TableCell>
                      <TableCell className="text-right">{number(run.discovered || 0)}</TableCell>
                      <TableCell className="text-right">{number(run.fetched || 0)}</TableCell>
                      <TableCell className="text-right">{number(run.battles || 0)}</TableCell>
                      <TableCell className="text-right">{number(run.failures || 0)}</TableCell>
                      <TableCell className="max-w-72 truncate text-muted-foreground" title={run.note}>
                        {run.note || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <PageStatus>The crawler is deployed and waiting for its first scheduled run.</PageStatus>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Updated {new Date(status.now).toLocaleString()} · This beta page is intentionally excluded from search indexes.
      </p>
    </>
  );
}

function number(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function cappedNumber(value: number, capped: boolean): string {
  return `${number(value)}${capped ? "+" : ""}`;
}

function relativeTime(timestamp: number): string {
  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}
