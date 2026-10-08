import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useMemo } from "react";
import { LiveRotation, LiveRotationSkeleton } from "@/components/meta/LiveRotation";
import { BrawlerSheet } from "@/components/meta/BrawlerSheet";
import { MetaControls } from "@/components/meta/MetaControls";
import { MetaLeaderboard, MetaLeaderboardSkeleton } from "@/components/meta/MetaLeaderboard";
import { MetaPulse, MetaPulseSkeleton, summarySentences } from "@/components/meta/MetaPulse";
import { MetaScatter, MetaScatterSkeleton } from "@/components/meta/MetaScatter";
import { MetaTierList, MetaTierListSkeleton } from "@/components/meta/MetaTierList";
import { brawlerName, Panel, SectionHeader, type MetaLookups, type ModeInfo } from "@/components/meta/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { brawlData } from "@/lib/game-data";
import { useI18n, type Translator } from "@/lib/i18n";
import type { TrophyBucket } from "@/lib/meta";
import { buildMetaBoard, metaHighlights, modesWithData, sortBoardRows, type BoardRow, type BoardSortKey, type SortDirection } from "@/lib/meta-board";
import type { MetaTrendWindow, MetaTrendsResponse } from "@/lib/types";

/** Numeric windows stay numbers in the URL so they serialize as `window=30`, not `window="30"`. */
type WindowParam = 7 | 30 | 90 | "all";
type MetaSearch = {
  trophy?: TrophyBucket;
  window?: WindowParam;
  mode?: number;
  sort?: BoardSortKey;
  dir?: SortDirection;
  q?: string;
  brawler?: number;
};

export const Route = createFileRoute("/meta")({
  // Unknown or legacy params (metric, group, compare, min) are dropped here.
  validateSearch: (search: Record<string, unknown>): MetaSearch => ({
    trophy: isBucket(search.trophy) ? search.trophy : undefined,
    window: windowParam(search.window),
    mode: positiveInt(search.mode),
    sort: isSortKey(search.sort) ? search.sort : undefined,
    dir: search.dir === "asc" || search.dir === "desc" ? search.dir : undefined,
    q: (typeof search.q === "string" || typeof search.q === "number") && String(search.q) ? String(search.q) : undefined,
    brawler: positiveInt(search.brawler),
  }),
  component: MetaBoardPage,
});

function MetaBoardPage() {
  const { t, date, number } = useI18n();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const trophy = search.trophy || "all";
  const trendWindow: MetaTrendWindow = search.window === undefined ? "30" : search.window === "all" ? "all" : search.window === 7 ? "7" : search.window === 90 ? "90" : "30";
  const sort = search.sort || "score";
  const dir = search.dir || "desc";

  const catalogQuery = useQuery(brawlData.brawlers());
  const mapsQuery = useQuery(brawlData.maps());
  const eventsQuery = useQuery({ ...brawlData.events(), refetchInterval: 60_000 });
  const trendsQuery = useQuery({ ...brawlData.metaTrends(trophy, trendWindow), placeholderData: keepPreviousData });
  // Matchups are only returned for a single brawler, so the detail panel asks separately.
  const brawlerQuery = useQuery({ ...brawlData.metaTrends(trophy, trendWindow, search.brawler), enabled: search.brawler !== undefined });

  const lookups = useMemo<MetaLookups>(() => {
    const maps = new Map((mapsQuery.data || []).map((map) => [map.id, map]));
    const modes = new Map<number, ModeInfo>();
    const mapModes = new Map<number, number | undefined>();
    for (const map of maps.values()) {
      mapModes.set(map.id, map.gameMode?.id);
      if (map.gameMode && !modes.has(map.gameMode.id)) {
        modes.set(map.gameMode.id, { id: map.gameMode.id, name: map.gameMode.name, imageUrl: map.gameMode.imageUrl, color: map.gameMode.color });
      }
    }
    return { brawlers: new Map((catalogQuery.data || []).map((item) => [item.id, item])), maps, modes, mapModes };
  }, [catalogQuery.data, mapsQuery.data]);

  const data = trendsQuery.data;
  const scope = useMemo(() => ({ mapModes: lookups.mapModes, modeId: search.mode }), [lookups.mapModes, search.mode]);
  const board = useMemo(
    () => buildMetaBoard({ current: data?.current.stats || [], previous: data?.previous?.stats, scope, minPicks: data?.minPicks ?? 25 }),
    [data, scope],
  );
  const highlights = useMemo(() => metaHighlights(board), [board]);
  const sortedRows = useMemo(() => sortBoardRows(board.rows, sort, dir), [board.rows, sort, dir]);
  const rankedRows = useMemo(() => board.rows.filter((row) => row.qualified), [board.rows]);
  const modes = useMemo(() => modesWithData(data?.current.stats || [], lookups.mapModes), [data, lookups.mapModes]);

  const update = (patch: Partial<MetaSearch>, push = false) => void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: !push, resetScroll: false });
  const select = (brawler: number) => update({ brawler }, true);
  const ready = Boolean(data && catalogQuery.data && mapsQuery.data);
  const error = trendsQuery.error || catalogQuery.error || mapsQuery.error;
  const modeName = search.mode !== undefined ? lookups.modes.get(search.mode)?.name : undefined;
  const formatDay = (value: number) => date(value, { month: "short", day: "numeric", timeZone: "UTC" });
  const summary = ready ? summarySentences({ highlights, lookups, modeName, trophy, window: trendWindow, t }) : [];
  const noData = ready && !board.rows.length;

  const exportCsv = () => {
    const header = ["rank", "brawler", "tier", "score", "win_rate", "use_rate", "star_player_rate", "picks", "wins", "losses", "use_delta_pp", "trophy_range", "window", "mode", "period_start_utc", "period_end_utc"];
    const lines = sortedRows.map((row, index) => [
      index + 1, brawlerName(lookups, row.brawlerId), row.tier || "", row.score.toFixed(2), row.winRate.toFixed(2), row.useRate.toFixed(3), row.starRate.toFixed(2),
      row.picks, row.wins, row.losses, row.useDelta === null ? "" : row.useDelta.toFixed(3), trophy, trendWindow, modeName || "all",
      dateIso(data?.current.startAt), dateIso(data?.current.endAt),
    ].map(csvCell).join(","));
    const url = URL.createObjectURL(new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `statsconnect-brawl-stars-meta-${trophy}-${trendWindow}${search.mode ? `-${search.mode}` : ""}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-shell space-y-6 md:space-y-8">
      <header className="page-intro">
        <h1 className="font-display text-4xl md:text-5xl">{t("meta.title")}</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">{t("meta.description")}</p>
        <p className="mt-3 flex min-h-5 items-center gap-2 text-sm text-muted-foreground">
          {data ? (
            <>
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />
              {board.totalPicks
                ? t("meta.freshness", { picks: number(board.totalPicks), start: formatDay(data.current.startAt), end: formatDay(data.current.endAt) })
                : t("meta.freshnessEmpty")}
            </>
          ) : <Skeleton className="h-4 w-64" />}
        </p>
      </header>

      <MetaControls
        trophy={trophy}
        window={trendWindow}
        mode={search.mode}
        modes={modes}
        lookups={lookups}
        updating={trendsQuery.isPlaceholderData && trendsQuery.isFetching}
        canExport={sortedRows.length > 0 && !trendsQuery.isPlaceholderData}
        onChange={({ window: nextWindow, ...patch }) => update(nextWindow ? { ...patch, window: windowParam(nextWindow) } : patch)}
        onExport={exportCsv}
      />

      {error ? <PageStatus tone="error">{error instanceof Error ? error.message : t("meta.loadFailed")}</PageStatus> : null}
      {data ? <CoverageBanner data={data} trendWindow={trendWindow} t={t} formatDate={(value) => date(value, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} /> : null}

      <section aria-labelledby="meta-pulse">
        <SectionHeader id="meta-pulse" title={t("meta.pulseTitle")} />
        {ready ? <MetaPulse highlights={highlights} lookups={lookups} onSelect={select} /> : <MetaPulseSkeleton />}
        <div className="mt-4 max-w-4xl border-l-[3px] border-primary pl-4">
          {ready ? (
            <p className="text-[1.0625rem] leading-relaxed text-foreground/90">{summary.join(" ")}</p>
          ) : (
            <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-2/3" /></div>
          )}
        </div>
      </section>

      {noData ? (
        <EmptyState title={t("meta.noData")} detail={t("meta.noDataDetail")} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Panel aria-labelledby="meta-tiers">
            <SectionHeader id="meta-tiers" title={t("meta.tierTitle")} detail={t("meta.tierDetail", { count: number(board.floor) })} />
            {!ready ? <MetaTierListSkeleton /> : rankedRows.length ? (
              <MetaTierList rows={rankedRows} lookups={lookups} selected={search.brawler} onSelect={select} />
            ) : <SectionEmpty>{t("meta.tierEmpty", { count: number(board.floor) })}</SectionEmpty>}
          </Panel>
          <Panel aria-labelledby="meta-map">
            <SectionHeader id="meta-map" title={t("meta.mapTitle")} detail={t("meta.mapDetail")} />
            {!ready ? <MetaScatterSkeleton /> : rankedRows.length ? (
              <MetaScatter rows={rankedRows} medianUse={highlights.medianUse} lookups={lookups} selected={search.brawler} onSelect={select} />
            ) : <SectionEmpty>{t("meta.tierEmpty", { count: number(board.floor) })}</SectionEmpty>}
          </Panel>
        </div>
      )}

      <section aria-labelledby="meta-live">
        <SectionHeader id="meta-live" title={t("meta.liveTitle")} detail={t("meta.liveDetail")} />
        {eventsQuery.isPending || !ready ? <LiveRotationSkeleton /> : (
          <LiveRotation events={eventsQuery.data || []} stats={data?.current.stats || []} minPicks={data?.minPicks ?? 25} lookups={lookups} />
        )}
      </section>

      {noData ? null : (
        <Panel aria-labelledby="meta-board">
          <SectionHeader id="meta-board" title={t("meta.boardTitle")} detail={t("meta.boardDetail", { count: number(board.floor) })} />
          {ready ? (
            <MetaLeaderboard
              rows={sortedRows}
              lookups={lookups}
              sort={sort}
              dir={dir}
              query={search.q || ""}
              selected={search.brawler}
              onSort={(key) => update(key === sort ? { dir: dir === "desc" ? "asc" : "desc" } : { sort: key, dir: "desc" })}
              onQuery={(value) => update({ q: value || undefined })}
              onSelect={select}
            />
          ) : <MetaLeaderboardSkeleton />}
        </Panel>
      )}

      <footer className="max-w-4xl space-y-2 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
        <p>{t("meta.methodology", { min: number(data?.minPicks ?? 25) })}</p>
        {data?.coverageStartAt ? <p>{t("meta.coverageStarts", { date: date(data.coverageStartAt, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) })}</p> : null}
      </footer>

      <BrawlerSheet
        brawlerId={search.brawler}
        lookups={lookups}
        onClose={() => update({ brawler: undefined })}
        data={{
          row: board.rows.find((row: BoardRow) => row.brawlerId === search.brawler),
          stats: data?.current.stats || [],
          matchups: brawlerQuery.data?.currentMatchups,
          matchupsLoading: brawlerQuery.isPending && search.brawler !== undefined,
          matchupsFailed: brawlerQuery.isError,
          scope,
          minPicks: data?.minPicks ?? 25,
        }}
      />
    </div>
  );
}

function CoverageBanner({ data, trendWindow, t, formatDate }: { data: MetaTrendsResponse; trendWindow: MetaTrendWindow; t: Translator; formatDate: (value: number) => string }) {
  const notes: Array<{ title: string; detail: string }> = [];
  const windowLabel = trendWindow === "all" ? t("meta.allTrackedDays") : t("meta.lastDays", { count: trendWindow });
  if (!data.coverageStartAt) notes.push({ title: t("meta.coverageNotStarted"), detail: t("meta.coverageNotStartedDetail") });
  else if (!data.currentCoverageComplete) notes.push({ title: t("meta.coverageStarts", { date: formatDate(data.coverageStartAt) }), detail: t("meta.coveragePartial", { window: windowLabel }) });
  if (data.current.capped) notes.push({ title: t("meta.safetyCap", { count: data.rowLimit.toLocaleString("en-US") }), detail: "" });
  if (data.previous && !data.comparisonReady) notes.push({ title: t("meta.previousPartial"), detail: t("meta.previousPartialDetail") });
  if (!notes.length) return null;
  return (
    <div role="status" className="flex gap-3 rounded-xl border border-accent/35 bg-accent/[0.07] px-4 py-3 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
      <ul className="space-y-1">
        {notes.map((note) => (
          <li key={note.title}><span className="font-semibold text-foreground">{note.title}</span>{note.detail ? <span className="text-muted-foreground"> {note.detail}</span> : null}</li>
        ))}
      </ul>
    </div>
  );
}

function SectionEmpty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function dateIso(value?: number | null) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }
function positiveInt(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
function isBucket(value: unknown): value is TrophyBucket { return value === "all" || value === "0-499" || value === "500-999" || value === "1000+"; }
function windowParam(value: unknown): WindowParam | undefined {
  if (value === "all") return "all";
  const days = Number(value);
  return days === 7 || days === 30 || days === 90 ? days : undefined;
}
function isSortKey(value: unknown): value is BoardSortKey { return value === "score" || value === "win" || value === "use" || value === "star" || value === "picks" || value === "delta"; }
