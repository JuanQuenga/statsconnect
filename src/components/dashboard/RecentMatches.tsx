import { Badge } from "@/components/ui/badge";
import type { RecentMatch } from "@/lib/contracts";

function tone(result: RecentMatch["result"]): "success" | "destructive" | "secondary" {
  return result === "win" ? "success" : result === "loss" ? "destructive" : "secondary";
}

export function RecentMatches({ matches }: { matches: RecentMatch[] }) {
  return <section><h2 className="font-display text-2xl font-semibold">Recent battles</h2>{matches.length ? <div className="mt-4 overflow-hidden rounded-2xl border border-border/50">{matches.map((match) => <article key={match.id} className="flex items-center gap-3 border-b border-border/50 bg-card/40 p-4 last:border-b-0"><span className={`size-2.5 shrink-0 rounded-full ${match.result === "win" ? "bg-emerald-400" : match.result === "loss" ? "bg-destructive" : "bg-muted-foreground"}`} /><div className="min-w-0 flex-1"><p className="truncate font-medium">{match.mode}</p><p className="truncate text-xs text-muted-foreground">{match.map ?? "Battle"}{match.occurredAt ? ` · ${new Date(match.occurredAt).toLocaleString()}` : ""}</p></div><Badge variant={tone(match.result)}>{match.result}{match.rank !== null ? ` #${match.rank}` : ""}</Badge>{match.scoreDelta !== null ? <span className="w-12 text-right text-sm font-semibold">{match.scoreDelta > 0 ? "+" : ""}{match.scoreDelta}</span> : null}</article>)}</div> : <p className="mt-3 text-sm text-muted-foreground">No recent battles are available.</p>}</section>;
}
