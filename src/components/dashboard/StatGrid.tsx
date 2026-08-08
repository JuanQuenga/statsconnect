import type { Metric } from "@/lib/contracts";

function metricValue(metric: Metric): string {
  return metric.format === "percent" ? `${metric.value.toLocaleString()}%` : metric.value.toLocaleString();
}

export function StatCard({ metric }: { metric: Metric }) {
  return <div className="rounded-2xl border border-border/50 bg-card/50 p-5"><p className="text-sm text-muted-foreground">{metric.label}</p><p className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--game-accent)]">{metricValue(metric)}</p></div>;
}

export function StatGrid({ metrics }: { metrics: Metric[] }) {
  return <section><h2 className="font-display text-2xl font-semibold">Statistics</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map((metric) => <StatCard key={metric.key} metric={metric} />)}</div></section>;
}
