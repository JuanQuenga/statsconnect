import { Panel } from "@/components/dashboard/Panel";
import type { Metric } from "@/lib/contracts";

function metricValue(metric: Metric): string {
  return metric.format === "percent"
    ? `${metric.value.toLocaleString()}%`
    : metric.value.toLocaleString();
}

export function StatCard({ metric }: { metric: Metric }) {
  return (
    <div className="bevel bevel-sm relative overflow-hidden border border-border/60 bg-card/60 p-5 backdrop-blur-sm">
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-[var(--game-accent)] opacity-40"
        aria-hidden
      />
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {metric.label}
      </p>
      <p className="numeric mt-4 text-5xl text-foreground">{metricValue(metric)}</p>
    </div>
  );
}

export function StatGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <Panel title="Statistics" count={metrics.length}>
      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <StatCard key={metric.key} metric={metric} />
        ))}
      </div>
    </Panel>
  );
}
