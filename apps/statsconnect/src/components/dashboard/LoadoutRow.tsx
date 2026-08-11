import { Panel, PanelEmpty } from "@/components/dashboard/Panel";
import type { ProfileItem } from "@/lib/contracts";

export function LoadoutRow({ items }: { items: ProfileItem[] }) {
  return (
    <Panel title="Current deck" count={items.length}>
      {items.length ? (
        <div className="rail">
          {items.map((item, index) => (
            <article
              key={item.id}
              className="bevel bevel-sm relative w-32 shrink-0 border border-border/60 bg-card/55 p-3 text-center"
            >
              <span className="absolute left-2 top-2 font-numeric text-xs text-muted-foreground/60">
                {String(index + 1).padStart(2, "0")}
              </span>
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="mx-auto size-24 object-contain"
                />
              ) : (
                <div className="mx-auto grid size-24 place-items-center bg-black/30 font-display text-2xl font-bold text-muted-foreground">
                  {item.name.slice(0, 1)}
                </div>
              )}
              <p className="mt-3 truncate font-display text-[11px] font-semibold uppercase tracking-[0.1em]">
                {item.name}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <PanelEmpty>No current deck is available.</PanelEmpty>
      )}
    </Panel>
  );
}
