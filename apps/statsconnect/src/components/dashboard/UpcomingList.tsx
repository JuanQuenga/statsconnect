import { Panel, PanelEmpty } from "@/components/dashboard/Panel";
import type { UpcomingItem } from "@/lib/contracts";

export function UpcomingList({ items }: { items: UpcomingItem[] }) {
  return (
    <Panel title="Upcoming chests" count={items.length}>
      {items.length ? (
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li
              key={`${item.index}-${item.label}`}
              className="bevel bevel-sm flex items-center gap-4 border border-border/60 bg-card/45 px-4 py-3"
            >
              <span className="numeric w-10 shrink-0 text-2xl text-[var(--game-accent)]">
                +{item.index}
              </span>
              <span className="min-w-0 truncate font-display text-xs font-semibold uppercase tracking-[0.12em]">
                {item.label}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <PanelEmpty>No chest-cycle data is available.</PanelEmpty>
      )}
    </Panel>
  );
}
