import { ArrowDownRight, ArrowUpRight, Crown, Flame } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/format";
import { useI18n, type Translator } from "@/lib/i18n";
import type { TrophyBucket } from "@/lib/meta";
import type { BoardRow, MetaHighlights } from "@/lib/meta-board";
import type { MetaTrendWindow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BrawlerPortrait, brawlerName, signed, type MetaLookups } from "./shared";

type Tone = "gold" | "teal" | "rose" | "blue";
const TONES: Record<Tone, string> = {
  gold: "text-primary",
  teal: "text-accent",
  rose: "text-destructive",
  blue: "text-chart-3",
};

export function MetaPulse({ highlights, lookups, onSelect }: { highlights: MetaHighlights; lookups: MetaLookups; onSelect: (id: number) => void }) {
  const { t } = useI18n();
  const tiles: Array<{ key: string; label: string; icon: ReactNode; tone: Tone; row: BoardRow | null; stat: (row: BoardRow) => string; empty: string }> = [
    { key: "best", label: t("meta.bestPick"), icon: <Crown />, tone: "gold", row: highlights.best, stat: (row) => t("meta.statWin", { rate: formatPercent(row.winRate) }), empty: t("meta.notEnoughPicks") },
    { key: "picked", label: t("meta.mostPicked"), icon: <Flame />, tone: "blue", row: highlights.mostPicked, stat: (row) => t("meta.statUse", { rate: formatPercent(row.useRate) }), empty: t("meta.notEnoughPicks") },
    { key: "riser", label: t("meta.biggestRiser"), icon: <ArrowUpRight />, tone: "teal", row: highlights.riser, stat: (row) => t("meta.statDelta", { delta: signed(row.useDelta ?? 0) }), empty: t("meta.needsPrevious") },
    { key: "faller", label: t("meta.biggestFaller"), icon: <ArrowDownRight />, tone: "rose", row: highlights.faller, stat: (row) => t("meta.statDelta", { delta: signed(row.useDelta ?? 0) }), empty: t("meta.needsPrevious") },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => {
        const body = (
          <>
            <span className={cn("flex items-center gap-1.5 text-[0.8125rem] font-semibold [&_svg]:size-4", TONES[tile.tone])}>{tile.icon}{tile.label}</span>
            <span className="mt-3 flex items-center gap-3">
              {tile.row ? <BrawlerPortrait id={tile.row.brawlerId} name="" className="size-12 sm:size-14" /> : <span className="size-12 shrink-0 rounded-lg border border-dashed border-border sm:size-14" />}
              <span className="min-w-0">
                <span className="block truncate font-display text-lg leading-tight sm:text-xl">{tile.row ? brawlerName(lookups, tile.row.brawlerId) : "—"}</span>
                <span className={cn("mt-0.5 block text-xs sm:text-sm", tile.row ? "game-stat" : "text-muted-foreground", tile.row && TONES[tile.tone])}>{tile.row ? tile.stat(tile.row) : tile.empty}</span>
              </span>
            </span>
          </>
        );
        return tile.row ? (
          <button key={tile.key} type="button" onClick={() => onSelect(tile.row!.brawlerId)} className="meta-panel meta-press p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4">
            {body}
          </button>
        ) : (
          <div key={tile.key} className="meta-panel p-3 sm:p-4">{body}</div>
        );
      })}
    </div>
  );
}

export function MetaPulseSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="meta-panel p-3 sm:p-4">
          <Skeleton className="h-4 w-24" />
          <div className="mt-3 flex items-center gap-3"><Skeleton className="size-14 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-3 w-20" /></div></div>
        </div>
      ))}
    </div>
  );
}

/** Builds the 2–4 sentence plain-language read of the current meta. */
export function summarySentences({
  highlights,
  lookups,
  modeName,
  trophy,
  window: trendWindow,
  t,
}: {
  highlights: MetaHighlights;
  lookups: MetaLookups;
  modeName?: string;
  trophy: TrophyBucket;
  window: MetaTrendWindow;
  t: Translator;
}) {
  const name = (row: BoardRow) => brawlerName(lookups, row.brawlerId);
  const [first, second] = highlights.leaders;
  if (!first) return [t("meta.summaryEmpty")];
  const scope = modeName || t("meta.scopeAll");
  const range = trophy === "all" ? t("meta.rangeAll") : t("meta.rangeBucket", { range: trophy });
  const sentences = [
    second
      ? t("meta.summaryLeadTwo", { first: name(first), second: name(second), scope, range, firstRate: formatPercent(first.winRate), secondRate: formatPercent(second.winRate) })
      : t("meta.summaryLeadOne", { first: name(first), scope, range, firstRate: formatPercent(first.winRate) }),
  ];
  const popular = highlights.mostPicked;
  if (popular && !highlights.leaders.includes(popular)) {
    sentences.push(t(popular.winRate >= 50 ? "meta.summaryPopularStrong" : "meta.summaryPopularWeak", { name: name(popular), use: formatPercent(popular.useRate), win: formatPercent(popular.winRate) }));
  }
  if (highlights.gem) {
    sentences.push(t("meta.summaryGem", { name: name(highlights.gem), win: formatPercent(highlights.gem.winRate), use: formatPercent(highlights.gem.useRate) }));
  }
  const { riser, faller } = highlights;
  const days = trendWindow;
  if (trendWindow === "all" || (!riser && !faller)) sentences.push(t("meta.summaryNoMovement"));
  else if (riser && faller) sentences.push(t("meta.summaryMovement", { days, riser: name(riser), riserDelta: signed(riser.useDelta ?? 0), faller: name(faller), fallerDelta: signed(faller.useDelta ?? 0) }));
  else if (riser) sentences.push(t("meta.summaryRiserOnly", { days, riser: name(riser), riserDelta: signed(riser.useDelta ?? 0) }));
  else if (faller) sentences.push(t("meta.summaryFallerOnly", { days, faller: name(faller), fallerDelta: signed(faller.useDelta ?? 0) }));
  return sentences;
}
