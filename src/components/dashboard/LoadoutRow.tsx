import type { ProfileItem } from "@/lib/contracts";

export function LoadoutRow({ items }: { items: ProfileItem[] }) {
  return <section><h2 className="font-display text-2xl font-semibold">Current deck</h2>{items.length ? <div className="mt-4 flex gap-3 overflow-x-auto pb-2">{items.map((item) => <div key={item.id} className="w-28 shrink-0 rounded-xl border border-border/50 bg-card/50 p-3 text-center">{item.imageUrl ? <img src={item.imageUrl} alt="" className="mx-auto size-20 object-contain" /> : <div className="mx-auto grid size-20 place-items-center rounded-lg bg-muted text-xl font-semibold">{item.name.slice(0, 1)}</div>}<p className="mt-2 truncate text-xs font-semibold">{item.name}</p></div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">No current deck is available.</p>}</section>;
}
