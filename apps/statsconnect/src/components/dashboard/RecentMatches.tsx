import { Panel, PanelEmpty } from "@/components/dashboard/Panel";
import type { RecentMatch } from "@/lib/contracts";

const resultStyles: Record<RecentMatch["result"], string> = {
  win: "bg-emerald-400/90 text-[#04140c]",
  loss: "bg-destructive/90 text-[#1a0409]",
  draw: "bg-muted-foreground/70 text-background",
  ranked: "bg-[var(--game-accent)]/85 text-[#04121b]",
  unknown: "border border-border/70 bg-white/[0.05] text-muted-foreground",
};

const resultLabels: Record<RecentMatch["result"], string> = {
  win: "W",
  loss: "L",
  draw: "D",
  ranked: "R",
  unknown: "–",
};

export function RecentMatches({ matches }: { matches: RecentMatch[] }) {
  return (
    <Panel title="Recent battles" count={matches.length}>
      {matches.length ? (
        <ol className="bevel divide-y divide-border/50 border border-border/60 bg-card/50 backdrop-blur-sm">
          {matches.map((match) => (
            <li key={match.id} className="flex items-center gap-4 px-5 py-4">
              <span
                className={`bevel bevel-sm grid size-10 shrink-0 place-items-center font-display text-sm font-bold ${resultStyles[match.result]}`}
                aria-hidden
              >
                {resultLabels[match.result]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-semibold uppercase tracking-[0.12em]">
                  {match.mode}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="sr-only">{match.result}. </span>
                  {match.map ?? "Battle"}
                  {match.occurredAt
                    ? ` · ${new Date(match.occurredAt).toLocaleString()}`
                    : ""}
                </p>
              </div>
              {match.rank !== null ? (
                <span className="numeric text-2xl text-muted-foreground">
                  #{match.rank}
                </span>
              ) : null}
              {match.scoreDelta !== null ? (
                <span
                  className={`numeric w-16 text-right text-3xl ${match.scoreDelta > 0 ? "text-emerald-300" : match.scoreDelta < 0 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {match.scoreDelta > 0 ? "+" : ""}
                  {match.scoreDelta}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <PanelEmpty>No recent battles are available.</PanelEmpty>
      )}
    </Panel>
  );
}
