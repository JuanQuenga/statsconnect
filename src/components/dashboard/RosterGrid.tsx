import { Panel, PanelEmpty } from "@/components/dashboard/Panel";
import type { ProfileItem } from "@/lib/contracts";

export function RosterGrid({ items }: { items: ProfileItem[] }) {
  return (
    <Panel title="Roster" count={items.length}>
      {items.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {items.map((item) => (
            <article
              key={item.id}
              className="bevel bevel-sm group relative overflow-hidden border border-border/60 bg-card/50 p-3 transition-colors hover:border-[var(--game-accent)]/60"
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  loading="lazy"
                  className="mx-auto aspect-square w-full object-contain transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="grid aspect-square place-items-center bg-black/30 font-display text-3xl font-bold text-muted-foreground">
                  {item.name.slice(0, 1)}
                </div>
              )}
              <p className="mt-3 truncate font-display text-xs font-semibold uppercase tracking-[0.1em]">
                {item.name}
              </p>
              <p className="mt-1 font-numeric text-sm tracking-wider text-muted-foreground">
                {item.level !== null ? `LV ${item.level}` : "LV —"}
                {item.score !== null ? ` · ${item.score.toLocaleString()}` : ""}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <PanelEmpty>No roster data is available.</PanelEmpty>
      )}
    </Panel>
  );
}
