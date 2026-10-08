import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { BoardRow } from "@/lib/meta-board";
import { cn } from "@/lib/utils";
import { BrawlerPortrait, brawlerName, TIER_COLORS, type MetaLookups } from "./shared";

const USE_TICKS = [0.25, 0.5, 1, 2, 3, 5, 8, 12, 20, 30, 50];

/**
 * Win rate (y) against use rate (x) for ranked brawlers. Use rate is plotted
 * on a square-root scale because a few staples dwarf the long tail; ticks are
 * labelled in real percentages so the scale stays honest.
 */
export function MetaScatter({ rows, medianUse, lookups, selected, onSelect }: {
  rows: BoardRow[];
  medianUse: number;
  lookups: MetaLookups;
  selected?: number;
  onSelect: (id: number) => void;
}) {
  const { t, number } = useI18n();
  const maxUse = Math.max(1, ...rows.map((row) => row.useRate)) * 1.08;
  const spread = Math.max(5, Math.ceil(Math.max(...rows.map((row) => Math.abs(row.winRate - 50)), 0)) + 1);
  const yMin = 50 - spread;
  const x = (use: number) => (Math.sqrt(Math.max(0, use)) / Math.sqrt(maxUse)) * 100;
  const y = (win: number) => (1 - (Math.min(Math.max(win, yMin), 50 + spread) - yMin) / (spread * 2)) * 100;
  const yStep = spread <= 6 ? 2 : spread <= 15 ? 5 : 10;
  const yTicks: number[] = [];
  for (let tick = Math.ceil(yMin / yStep) * yStep; tick <= 50 + spread; tick += yStep) yTicks.push(tick);
  const xTicks = USE_TICKS.filter((tick) => tick < maxUse);
  const medianX = x(medianUse);
  const midY = y(50);
  // Draw the selected point last so it sits on top of neighbours.
  const ordered = [...rows].sort((a, b) => Number(a.brawlerId === selected) - Number(b.brawlerId === selected));

  return (
    <figure className="m-0">
      <div className="relative aspect-square w-full pt-6 pb-11 pl-10 sm:aspect-[5/4]">
        <div className="relative h-full w-full rounded-lg border border-border/70 bg-background/50">
          <div aria-hidden className="absolute bg-primary/[0.06]" style={{ left: `${medianX}%`, right: 0, top: 0, height: `${midY}%` }} />
          <div aria-hidden className="absolute bg-destructive/[0.05]" style={{ left: 0, width: `${medianX}%`, bottom: 0, top: `${midY}%` }} />
          {yTicks.map((tick) => (
            <span key={tick} aria-hidden className="absolute right-full mr-2 -translate-y-1/2 text-[0.6875rem] text-muted-foreground tabular-nums" style={{ top: `${y(tick)}%` }}>{tick}%</span>
          ))}
          {xTicks.map((tick) => (
            <span key={tick} aria-hidden className="absolute top-full mt-1.5 -translate-x-1/2 text-[0.6875rem] text-muted-foreground tabular-nums" style={{ left: `${x(tick)}%` }}>{tick}%</span>
          ))}
          <span aria-hidden className="absolute inset-x-0 border-t border-dashed border-foreground/35" style={{ top: `${midY}%` }} />
          <span aria-hidden className="absolute inset-y-0 border-l border-dashed border-foreground/25" style={{ left: `${medianX}%` }} />
          <Quadrant className="top-2 right-2 text-primary">{t("meta.quadStaples")}</Quadrant>
          <Quadrant className="top-2 left-2 text-accent">{t("meta.quadGems")}</Quadrant>
          <Quadrant className="right-2 bottom-2 text-chart-4">{t("meta.quadOverplayed")}</Quadrant>
          <Quadrant className="bottom-2 left-2 text-destructive">{t("meta.quadAvoid")}</Quadrant>
          <ul className="absolute inset-0">
            {ordered.map((row) => {
              const name = brawlerName(lookups, row.brawlerId);
              const label = t("meta.brawlerStat", { name, win: formatPercent(row.winRate), use: formatPercent(row.useRate, 2), picks: number(row.picks) });
              const active = selected === row.brawlerId;
              return (
                <li key={row.brawlerId} className="absolute" style={{ left: `${x(row.useRate)}%`, top: `${y(row.winRate)}%` }}>
                  <button
                    type="button"
                    onClick={() => onSelect(row.brawlerId)}
                    title={label}
                    aria-label={label}
                    aria-pressed={active}
                    className={cn("meta-point relative block -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:z-20 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", active && "z-20")}
                    style={{ boxShadow: active ? "0 0 0 3px var(--primary), 0 0 0 6px rgba(0, 0, 0, 0.55)" : `0 0 0 2px ${row.tier ? TIER_COLORS[row.tier] : "var(--border)"}` }}
                  >
                    <BrawlerPortrait id={row.brawlerId} name="" className="size-6 rounded-full sm:size-8" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <span className="absolute top-0 left-0 text-xs font-semibold text-muted-foreground">{t("meta.winRate")}</span>
        <span className="absolute right-0 bottom-0 text-xs font-semibold text-muted-foreground">{t("meta.useRate")}</span>
      </div>
      <figcaption className="mt-2 text-xs text-muted-foreground">{t("meta.medianUse", { rate: formatPercent(medianUse, 2) })}</figcaption>
    </figure>
  );
}

function Quadrant({ className, children }: { className: string; children: React.ReactNode }) {
  return <span aria-hidden className={cn("pointer-events-none absolute font-display text-sm opacity-80 sm:text-base", className)}>{children}</span>;
}

export function MetaScatterSkeleton() {
  return <Skeleton className="aspect-square w-full rounded-lg sm:aspect-[5/4]" />;
}
