import type { UpcomingItem } from "@/lib/contracts";

export function UpcomingList({ items }: { items: UpcomingItem[] }) {
  return <section><h2 className="font-display text-2xl font-semibold">Upcoming chests</h2>{items.length ? <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <li key={`${item.index}-${item.label}`} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-3"><span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold">+{item.index}</span><span className="text-sm font-medium">{item.label}</span></li>)}</ol> : <p className="mt-3 text-sm text-muted-foreground">No chest-cycle data is available.</p>}</section>;
}
