import type { ReactNode } from "react";
import { brawlerBorderUrl } from "@/lib/artwork";
import type { Tier } from "@/lib/meta-board";
import type { BrawlerCatalogItem, MapListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ModeInfo = { id: number; name: string; imageUrl?: string; color?: string };

/** Catalog lookups shared by every meta board section. */
export type MetaLookups = {
  brawlers: ReadonlyMap<number, BrawlerCatalogItem>;
  maps: ReadonlyMap<number, MapListItem>;
  modes: ReadonlyMap<number, ModeInfo>;
  mapModes: ReadonlyMap<number, number | undefined>;
};

export function brawlerName(lookups: MetaLookups, id: number) {
  return lookups.brawlers.get(id)?.name || `#${id}`;
}

export const TIER_COLORS: Record<Tier, string> = {
  S: "#f5c85b",
  A: "#ff9b5c",
  B: "#7aa2ff",
  C: "#4ac7b7",
  D: "#7d8aa1",
};

export function signed(value: number, digits = 2) {
  const fixed = value.toFixed(digits);
  if (Number(fixed) === 0) return (0).toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

export function BrawlerPortrait({ id, name, className }: { id: number; name: string; className?: string }) {
  return (
    <img
      src={brawlerBorderUrl(id)}
      alt={name}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn("aspect-square shrink-0 rounded-lg bg-secondary object-cover", className)}
    />
  );
}

export function SectionHeader({ id, title, detail, action }: { id: string; title: string; detail?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0 max-w-2xl">
        <h2 id={id} className="section-title">{title}</h2>
        {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Chunky game-UI panel used by every board section. */
export function Panel({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("meta-panel p-4 sm:p-5", className)} {...props}>
      {children}
    </section>
  );
}

export function TierBadge({ tier, className }: { tier: Tier | null; className?: string }) {
  if (!tier) return <span className={cn("text-muted-foreground", className)}>—</span>;
  return (
    <span
      className={cn("meta-tier-chip inline-grid size-6 place-items-center rounded-md font-display text-sm", className)}
      style={{ background: TIER_COLORS[tier] }}
    >
      {tier}
    </span>
  );
}
