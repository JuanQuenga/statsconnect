import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { EmptyState } from "@/components/ui-helpers";
import { Skeleton } from "@/components/ui/skeleton";
import { eventModeId, gameModeImageUrl, mapImageUrl } from "@/lib/artwork";
import { apiDate, formatPercent, readableMode } from "@/lib/format";
import { useI18n, type Translator } from "@/lib/i18n";
import { topPicksForMap } from "@/lib/meta-board";
import type { BrawlerMapStat, EventItem } from "@/lib/types";
import { BrawlerPortrait, brawlerName, type MetaLookups } from "./shared";

export function LiveRotation({ events, stats, minPicks, lookups }: { events: EventItem[]; stats: BrawlerMapStat[]; minPicks: number; lookups: MetaLookups }) {
  const { t } = useI18n();
  const now = useNow(30_000);
  const seen = new Set<number>();
  const live = events.filter((item) => {
    const id = item.event?.id;
    const end = apiDate(item.endTime);
    if (!id || seen.has(id) || (end && end.getTime() <= now)) return false;
    seen.add(id);
    return true;
  });
  if (!live.length) return <EmptyState title={t("meta.liveTitle")} detail={t("meta.liveEmpty")} />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {live.map((item) => {
        const mapId = item.event!.id!;
        const map = lookups.maps.get(mapId);
        const modeId = map?.gameMode?.id;
        const mode = modeId ? lookups.modes.get(modeId) : undefined;
        const picks = topPicksForMap(stats, mapId, minPicks);
        const end = apiDate(item.endTime);
        return (
          <li key={mapId}>
            <Link
              to="/maps/$mapId"
              params={{ mapId: String(mapId) }}
              className="meta-panel meta-press flex h-full gap-3 overflow-hidden p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ImageWithFallback
                src={map?.imageUrl || mapImageUrl(mapId)}
                fallbackSrc={mapImageUrl(mapId)}
                alt=""
                loading="lazy"
                className="h-28 w-20 shrink-0 rounded-lg bg-secondary object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: mode?.color || undefined }}>
                  <img src={mode?.imageUrl || gameModeImageUrl(modeId || eventModeId(item.event?.mode))} alt="" className="size-4 object-contain" />
                  <span className="truncate">{mode?.name || readableMode(item.event?.mode)}</span>
                </span>
                <span className="mt-0.5 truncate font-display text-lg leading-tight">{map?.name || item.event?.map || t("common.unknownMap")}</span>
                {end ? (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" aria-hidden />{t("meta.endsIn", { time: remaining(end.getTime() - now, t) })}</span>
                ) : null}
                <div className="mt-auto pt-2">
                  {picks.length ? (
                    <ul className="flex gap-2">
                      {picks.map((pick) => (
                        <li key={pick.brawlerId} className="flex min-w-0 flex-col items-center gap-0.5" title={`${brawlerName(lookups, pick.brawlerId)} · ${formatPercent(pick.winRate)}`}>
                          <BrawlerPortrait id={pick.brawlerId} name={brawlerName(lookups, pick.brawlerId)} className="size-10" />
                          <span className="game-stat text-[0.6875rem] text-accent">{formatPercent(pick.winRate, 0)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("meta.liveNoPicks")}</p>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Re-renders on an interval so countdowns and expiry stay current while the page sits open. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function remaining(ms: number, t: Translator) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return t("meta.daysHours", { days: Math.floor(hours / 24), hours: hours % 24 });
  if (hours) return t("meta.hoursMinutes", { hours, minutes: minutes % 60 });
  return t("meta.minutes", { minutes });
}

export function LiveRotationSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="meta-panel flex gap-3 p-3">
          <Skeleton className="h-28 w-20 rounded-lg" />
          <div className="flex-1 space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-5 w-32" /><div className="flex gap-2 pt-4">{[0, 1, 2].map((item) => <Skeleton key={item} className="size-10 rounded-lg" />)}</div></div>
        </div>
      ))}
    </div>
  );
}
