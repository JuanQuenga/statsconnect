import type { TrendPoint } from "@/lib/analytics";

type Metric = "usageRate" | "winRate";

function dayLabel(day: number) {
  const value = String(day);
  return `${value.slice(4, 6)}/${value.slice(6, 8)}`;
}

function metricValue(point: TrendPoint, metric: Metric) {
  return metric === "usageRate" ? point.usageRate : point.winRate;
}

export function TrendChart({ points, metric, label }: { points: TrendPoint[]; metric: Metric; label: string }) {
  const values = points.map((point) => metricValue(point, metric)).filter((value): value is number => value !== null);
  if (values.length < 2) return <p className="trend-empty">Not enough daily observations to draw a trend yet.</p>;

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(maximum - minimum, 0.01);
  const coords = points.flatMap((point, index) => {
    const value = metricValue(point, metric);
    if (value === null) return [];
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 44 - ((value - minimum) / span) * 38;
    return [{ x, y, value, day: point.day }];
  });
  const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");

  return (
    <figure className="trend-chart" aria-label={`${label} daily ${metric === "usageRate" ? "usage" : "win rate"} trend`}>
      <svg viewBox="0 0 100 50" role="img" aria-hidden="true" preserveAspectRatio="none">
        <path className="trend-grid" d="M0 6H100 M0 25H100 M0 44H100" />
        <path className="trend-line" d={path} />
        {coords.map((point) => <circle key={`${point.day}-${point.x}`} cx={point.x} cy={point.y} r="1.5" />)}
      </svg>
      <figcaption>
        <span>{dayLabel(points[0]?.day ?? 0)}</span>
        <strong>{(values.at(-1)! * 100).toFixed(1)}%</strong>
        <span>{dayLabel(points.at(-1)?.day ?? 0)}</span>
      </figcaption>
    </figure>
  );
}
