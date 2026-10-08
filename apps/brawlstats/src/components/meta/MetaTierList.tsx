import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { TIERS, type BoardRow, type Tier } from "@/lib/meta-board";
import { cn } from "@/lib/utils";
import { BrawlerPortrait, brawlerName, TIER_COLORS, type MetaLookups } from "./shared";

export function MetaTierList({ rows, lookups, selected, onSelect }: { rows: BoardRow[]; lookups: MetaLookups; selected?: number; onSelect: (id: number) => void }) {
  const { t, number } = useI18n();
  const byTier = new Map<Tier, BoardRow[]>(TIERS.map((tier) => [tier, []]));
  for (const row of [...rows].sort((a, b) => b.score - a.score)) if (row.tier) byTier.get(row.tier)!.push(row);
  return (
    <ol className="space-y-2">
      {TIERS.map((tier) => {
        const members = byTier.get(tier)!;
        return (
          <li key={tier} className="flex items-stretch gap-2 rounded-xl bg-background/60 p-1.5 sm:gap-3">
            <span
              className="meta-tier-letter grid w-11 shrink-0 place-items-center rounded-lg font-display text-3xl sm:w-14 sm:text-4xl"
              style={{ background: TIER_COLORS[tier] }}
            >
              <span className="sr-only">{t("meta.tier")} </span>{tier}
            </span>
            {members.length ? (
              <ul className="flex flex-1 flex-wrap content-center gap-1.5 py-0.5">
                {members.map((row) => {
                  const name = brawlerName(lookups, row.brawlerId);
                  const label = t("meta.brawlerStat", { name, win: formatPercent(row.winRate), use: formatPercent(row.useRate), picks: number(row.picks) });
                  return (
                    <li key={row.brawlerId}>
                      <button
                        type="button"
                        onClick={() => onSelect(row.brawlerId)}
                        title={label}
                        aria-label={label}
                        aria-pressed={selected === row.brawlerId}
                        className={cn(
                          "meta-portrait-button block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected === row.brawlerId && "ring-2 ring-primary",
                        )}
                      >
                        <BrawlerPortrait id={row.brawlerId} name="" className="size-11 sm:size-12" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <span className="flex flex-1 items-center text-sm text-muted-foreground">—</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function MetaTierListSkeleton() {
  return (
    <div className="space-y-2">
      {TIERS.map((tier, index) => (
        <div key={tier} className="flex gap-3 rounded-xl bg-background/60 p-1.5">
          <Skeleton className="h-12 w-14 rounded-lg" />
          <div className="flex flex-1 flex-wrap gap-1.5">{Array.from({ length: 3 + index * 2 }, (_, item) => <Skeleton key={item} className="size-12 rounded-lg" />)}</div>
        </div>
      ))}
    </div>
  );
}
