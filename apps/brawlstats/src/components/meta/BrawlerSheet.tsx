import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { gameModeImageUrl, mapImageUrl } from "@/lib/artwork";
import { formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { brawlerBestMaps, brawlerMatchups, brawlerModes, type BoardRow, type MatchupRow, type Scope } from "@/lib/meta-board";
import type { BrawlerMapStat, BrawlerMatchupStat } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BrawlerPortrait, brawlerName, signed, TIER_COLORS, type MetaLookups } from "./shared";

type SheetData = {
  row?: BoardRow;
  stats: BrawlerMapStat[];
  matchups?: BrawlerMatchupStat[];
  matchupsLoading: boolean;
  matchupsFailed: boolean;
  scope: Scope;
  minPicks: number;
};

export function BrawlerSheet({ brawlerId, lookups, data, onClose }: { brawlerId?: number; lookups: MetaLookups; data: SheetData; onClose: () => void }) {
  // Keep rendering the last brawler while the close animation runs.
  const [shownId, setShownId] = useState(brawlerId);
  useEffect(() => {
    if (brawlerId !== undefined) setShownId(brawlerId);
  }, [brawlerId]);

  return (
    <DialogPrimitive.Root
      open={brawlerId !== undefined}
      onOpenChange={(open) => { if (!open) onClose(); }}
      onOpenChangeComplete={(open) => { if (!open) setShownId(undefined); }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="meta-sheet-backdrop fixed inset-0 z-[80] bg-black/60 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup className="meta-sheet fixed inset-x-0 bottom-0 z-[81] flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-popover text-popover-foreground outline-none sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[28rem] sm:rounded-tr-none sm:rounded-l-2xl sm:border-t-0 sm:border-l">
          {shownId !== undefined ? <SheetBody brawlerId={shownId} lookups={lookups} data={data} /> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SheetBody({ brawlerId, lookups, data }: { brawlerId: number; lookups: MetaLookups; data: SheetData }) {
  const { t, number } = useI18n();
  const brawler = lookups.brawlers.get(brawlerId);
  const name = brawlerName(lookups, brawlerId);
  const { row } = data;
  const modes = brawlerModes(data.stats, brawlerId, lookups.mapModes, data.minPicks);
  const maps = brawlerBestMaps(data.stats, brawlerId, data.scope, data.minPicks);
  const matchups = data.matchups ? brawlerMatchups(data.matchups, brawlerId, data.scope) : null;
  const tierColor = row?.tier ? TIER_COLORS[row.tier] : undefined;

  return (
    <>
      <header className="relative flex items-center gap-4 border-b border-border p-4 pr-12 sm:p-5 sm:pr-14" style={{ background: tierColor ? `linear-gradient(120deg, color-mix(in srgb, ${tierColor} 16%, transparent), transparent 70%)` : undefined }}>
        <BrawlerPortrait id={brawlerId} name="" className="size-16 rounded-xl sm:size-20" />
        <div className="min-w-0">
          <DialogPrimitive.Title className="truncate font-display text-3xl leading-none">{name}</DialogPrimitive.Title>
          <DialogPrimitive.Description render={<div />} className="mt-2 flex flex-wrap gap-1.5">
            {brawler?.rarity ? <Badge variant="secondary">{brawler.rarity}</Badge> : null}
            {brawler?.role ? <Badge variant="outline">{brawler.role}</Badge> : null}
          </DialogPrimitive.Description>
        </div>
        <DialogPrimitive.Close aria-label={t("meta.close")} className="absolute top-3 right-3 grid size-9 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <XIcon className="size-5" />
        </DialogPrimitive.Close>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-5">
        {row ? (
          <dl className="grid grid-cols-3 gap-2">
            <Kpi label={t("meta.tier")} value={row.tier || t("meta.unranked")} color={tierColor} />
            <Kpi label={t("meta.winRate")} value={formatPercent(row.winRate)} />
            <Kpi label={t("meta.score")} value={row.score.toFixed(1)} />
            <Kpi label={t("meta.useRate")} value={formatPercent(row.useRate, 2)} />
            <Kpi label={t("meta.useDelta")} value={row.useDelta === null ? "—" : signed(row.useDelta)} tone={row.useDelta === null ? undefined : row.useDelta >= 0 ? "text-accent" : "text-destructive"} />
            <Kpi label={t("meta.starShort")} value={formatPercent(row.starRate)} />
            <div className="col-span-3 text-xs text-muted-foreground">{t("meta.picks")}: <span className="game-stat text-foreground">{number(row.picks)}</span>{!row.qualified ? ` · ${t("meta.lowSample")}` : null}</div>
          </dl>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{t("meta.selectedNoData", { name })}</p>
        )}

        <section aria-labelledby="sheet-modes">
          <h3 id="sheet-modes" className="mb-2 font-display text-lg">{t("meta.byMode")}</h3>
          {modes.length ? (
            <ul className="space-y-2">
              {modes.map((mode) => {
                const info = lookups.modes.get(mode.modeId);
                const active = data.scope.modeId === mode.modeId;
                return (
                  <li key={mode.modeId} className={cn("grid grid-cols-[1.25rem_minmax(0,7rem)_1fr_auto] items-center gap-2 text-sm", active && "font-semibold")}>
                    <img src={info?.imageUrl || gameModeImageUrl(mode.modeId)} alt="" className="size-5 object-contain" />
                    <span className="truncate">{info?.name || mode.modeId}</span>
                    <span className="relative h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
                      <span className={cn("absolute inset-y-0 left-0 rounded-full", mode.winRate >= 50 ? "bg-accent" : "bg-destructive/80")} style={{ width: `${Math.min(100, mode.winRate)}%` }} />
                      <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/50" />
                    </span>
                    <span className="game-stat w-14 text-right" title={`${number(mode.picks)} ${t("meta.picks")}`}>{formatPercent(mode.winRate)}</span>
                  </li>
                );
              })}
            </ul>
          ) : <Empty>{t("meta.notEnoughPicks")}</Empty>}
        </section>

        <section aria-labelledby="sheet-maps">
          <h3 id="sheet-maps" className="mb-2 font-display text-lg">{t("meta.bestMaps")}</h3>
          {maps.length ? (
            <ul className="space-y-1.5">
              {maps.map((map) => {
                const info = lookups.maps.get(map.mapId);
                return (
                  <li key={map.mapId}>
                    <Link to="/maps/$mapId" params={{ mapId: String(map.mapId) }} className="flex items-center gap-3 rounded-lg p-1.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                      <ImageWithFallback src={info?.imageUrl || mapImageUrl(map.mapId)} fallbackSrc={mapImageUrl(map.mapId)} alt="" loading="lazy" className="h-12 w-9 shrink-0 rounded bg-secondary object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{info?.name || `#${map.mapId}`}</span>
                        <span className="block truncate text-xs text-muted-foreground">{info?.gameMode?.name} · {number(map.picks)} {t("meta.picks").toLowerCase()}</span>
                      </span>
                      <span className="game-stat text-accent">{formatPercent(map.winRate)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <Empty>{t("meta.bestMapsEmpty", { count: data.minPicks })}</Empty>}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <MatchupList title={t("meta.beats")} rows={matchups?.best} loading={data.matchupsLoading} failed={data.matchupsFailed} lookups={lookups} positive />
          <MatchupList title={t("meta.struggles")} rows={matchups?.worst} loading={data.matchupsLoading} failed={data.matchupsFailed} lookups={lookups} />
        </section>

        <Link to="/brawlers/$brawlerId" params={{ brawlerId: String(brawlerId) }} className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground shadow-[0_3px_0_rgba(0,0,0,0.3)] outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring">
          {t("meta.openBrawler", { name })}
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </div>
    </>
  );
}

function Kpi({ label, value, color, tone }: { label: string; value: string; color?: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-secondary/70 px-3 py-2">
      <dt className="text-[0.6875rem] font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn("game-stat mt-0.5 truncate text-xl", tone)} style={color ? { color } : undefined}>{value}</dd>
    </div>
  );
}

function MatchupList({ title, rows, loading, failed, lookups, positive }: { title: string; rows?: MatchupRow[]; loading: boolean; failed: boolean; lookups: MetaLookups; positive?: boolean }) {
  const { t, number } = useI18n();
  return (
    <div>
      <h3 className="mb-2 font-display text-lg">{title}</h3>
      {loading && !rows ? (
        <div className="space-y-1.5">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-10 w-full" />)}</div>
      ) : failed && !rows ? (
        <Empty>{t("meta.loadFailed")}</Empty>
      ) : rows?.length ? (
        <ul className="space-y-1.5">
          {rows.map((row) => {
            const name = brawlerName(lookups, row.opponentId);
            return (
              <li key={row.opponentId} className="flex items-center gap-2.5" title={`${number(row.picks)} ${t("meta.picks").toLowerCase()}`}>
                <BrawlerPortrait id={row.opponentId} name="" className="size-9" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
                <span className={cn("game-stat text-sm", positive ? "text-accent" : "text-destructive")}>{formatPercent(row.winRate)}</span>
              </li>
            );
          })}
        </ul>
      ) : <Empty>{t("meta.matchupsEmpty")}</Empty>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
