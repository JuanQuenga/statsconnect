import { useId } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type TrophyChartPoint = {
  label: string;
  trophies: number;
};

const chartConfig = {
  trophies: {
    label: "Trophies",
    color: "#1c8bff",
  },
} satisfies ChartConfig;

export function TrophyActivityChart({
  data,
  label,
  formatNumber,
}: {
  data: TrophyChartPoint[];
  label: string;
  formatNumber: (value: number) => string;
}) {
  const gradientId = `trophy-fill-${useId().replaceAll(":", "")}`;
  const values = data.map((point) => point.trophies);
  const first = values[0] ?? 0;
  const current = values.at(-1) ?? first;
  const high = Math.max(...values);
  const low = Math.min(...values);
  const change = current - first;
  const padding = Math.max(10, Math.round((high - low) * 0.18));

  return (
    <div className="trophy-chart-shell">
      <div className="trophy-chart-summary" aria-label="Trophy activity summary">
        <ChartMetric label="Current" value={formatNumber(current)} />
        <ChartMetric
          label="Change"
          value={`${change > 0 ? "+" : ""}${formatNumber(change)}`}
          trend={change > 0 ? "up" : change < 0 ? "down" : "flat"}
        />
        <ChartMetric label="High" value={formatNumber(high)} />
      </div>
      <ChartContainer config={chartConfig} className="trophy-chart" role="img" aria-label={label}>
        <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 2, left: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-trophies)" stopOpacity={0.42} />
              <stop offset="88%" stopColor="var(--color-trophies)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 8" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tickMargin={12}
            minTickGap={42}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickMargin={10}
            width={58}
            domain={[low - padding, high + padding]}
            tickFormatter={(value: number) => formatNumber(value)}
          />
          <ChartTooltip
            cursor={{ stroke: "rgba(122, 194, 255, .5)", strokeDasharray: "4 4" }}
            content={(
              <ChartTooltipContent
                indicator="line"
                formatter={(value) => (
                  <div className="trophy-chart-tooltip-value">
                    <span>Trophies</span>
                    <strong>{formatNumber(Number(value))}</strong>
                  </div>
                )}
              />
            )}
          />
          <Area
            dataKey="trophies"
            type="monotone"
            fill={`url(#${gradientId})`}
            stroke="var(--color-trophies)"
            strokeWidth={3}
            dot={{ r: 3.5, fill: "var(--background)", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "var(--color-trophies)", stroke: "var(--background)", strokeWidth: 3 }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

function ChartMetric({ label, value, trend }: { label: string; value: string; trend?: "up" | "down" | "flat" }) {
  return (
    <div className="trophy-chart-metric" data-trend={trend}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
