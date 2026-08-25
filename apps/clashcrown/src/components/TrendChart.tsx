import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { TrendPoint } from "@/lib/analytics";

type Metric = "usageRate" | "winRate";

function dayLabel(day: number) {
  const value = String(day);
  return `${value.slice(4, 6)}/${value.slice(6, 8)}`;
}

function metricValue(point: TrendPoint, metric: Metric) {
  return metric === "usageRate" ? point.usageRate : point.winRate;
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function metricLabel(metric: Metric) {
  return metric === "usageRate" ? "Usage" : "Win rate";
}

function metricColor(metric: Metric) {
  return metric === "usageRate" ? "#62c9ff" : "#1f93ff";
}

function chartDomain(values: number[], metric: Metric): [number, number] {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);

  if (metric === "usageRate") {
    return [0, Math.min(100, Math.max(5, Math.ceil((maximum * 1.15) / 5) * 5))];
  }

  const lower = Math.max(0, Math.floor((minimum - 5) / 5) * 5);
  const upper = Math.min(100, Math.ceil((maximum + 5) / 5) * 5);
  if (upper - lower >= 10) return [lower, upper];
  return [Math.max(0, lower - 5), Math.min(100, upper + 5)];
}

export function TrendChart({ points, metric, label }: { points: TrendPoint[]; metric: Metric; label: string }) {
  const gradientId = `trend-fill-${useId().replaceAll(":", "")}`;
  const chartLabel = `${label} daily ${metricLabel(metric).toLowerCase()} trend`;
  const chartConfig = {
    value: {
      label: metricLabel(metric),
      color: metricColor(metric),
    },
  } satisfies ChartConfig;
  const data = points.map((point) => {
    const value = metricValue(point, metric);
    return {
      day: point.day,
      label: dayLabel(point.day),
      value: value === null ? null : value * 100,
      games: point.uses,
    };
  });
  const values = data.flatMap((point) => point.value === null ? [] : [point.value]);
  if (values.length < 2) return <p className="trend-empty">Not enough daily observations to draw a trend yet.</p>;

  const current = values.at(-1) ?? 0;
  const first = values[0] ?? current;
  const change = current - first;
  const domain = chartDomain(values, metric);
  const trendDirection = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const windowLabel = `${dayLabel(points[0]?.day ?? 0)}–${dayLabel(points.at(-1)?.day ?? 0)} window`;

  return (
    <figure className="trend-chart" aria-label={chartLabel}>
      <div className="trend-chart-summary">
        <span>{windowLabel}</span>
        <strong>{percent(current)}</strong>
        <span data-trend={trendDirection}>
          {change > 0 ? "+" : ""}{change.toFixed(1)} pts
        </span>
      </div>
      <ChartContainer config={chartConfig} className="trend-chart-canvas" role="img" aria-label={chartLabel}>
        <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.34} />
              <stop offset="92%" stopColor="var(--color-value)" stopOpacity={0.015} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 7" />
          {metric === "winRate" && domain[0] <= 50 && domain[1] >= 50 ? (
            <ReferenceLine y={50} stroke="rgba(255,255,255,.22)" strokeDasharray="5 5" />
          ) : null}
          <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={9} minTickGap={34} />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            width={42}
            domain={domain}
            tickCount={3}
            tickFormatter={(value: number) => `${Math.round(value)}%`}
          />
          <ChartTooltip
            cursor={{ stroke: metricColor(metric), strokeOpacity: 0.48, strokeDasharray: "4 4" }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !point || point.value === null) return null;
              return (
                <div className="trend-chart-tooltip">
                  <span>{point.label} <i /> {point.games.toLocaleString()} games</span>
                  <strong>{percent(point.value)}</strong>
                </div>
              );
            }}
          />
          <Area
            dataKey="value"
            type="monotone"
            connectNulls={false}
            fill={`url(#${gradientId})`}
            stroke="var(--color-value)"
            strokeWidth={2.75}
            dot={{ r: 2.5, fill: "var(--background)", strokeWidth: 2 }}
            activeDot={{ r: 5, fill: "var(--color-value)", stroke: "var(--background)", strokeWidth: 3 }}
          />
        </AreaChart>
      </ChartContainer>
    </figure>
  );
}
