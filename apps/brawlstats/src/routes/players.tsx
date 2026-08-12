import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlayerSearch as PlayerSearchBox } from "@/components/PlayerSearch";
import { ProfileActions } from "@/components/ProfileActions";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { apiFetch, brawlerBorderUrl, collection, profileIconUrl } from "@/lib/api";
import { normalizeCatalog } from "@/lib/brawlers";
import { formatPercent, normalizeTag, readableMode, trophies } from "@/lib/format";
import { rememberRecentProfile } from "@/lib/preferences";
import type { BattleLogItem, PlayerAnalytics, PlayerBattle, PlayerProfile, PlayerSearchResponse, PlayerSnapshot } from "@/lib/types";
import { useI18n, type Translator } from "@/lib/i18n";

type PlayerSearch = { tag?: string; q?: string };

export const Route = createFileRoute("/players")({
  validateSearch: (search: Record<string, unknown>): PlayerSearch => ({
    tag: typeof search.tag === "string" ? search.tag : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: PlayersPage,
});

function PlayersPage() {
  const { t, number } = useI18n();
  const { tag: rawTag, q: rawQuery } = Route.useSearch();
  const tag = rawTag ? normalizeTag(rawTag) : null;
  const nameQuery = rawQuery?.trim() || "";

  const playerQuery = useQuery({
    queryKey: ["player", tag],
    enabled: Boolean(tag),
    queryFn: async () => {
      const payload = await apiFetch<{ player: PlayerProfile; battleLog: { items?: BattleLogItem[] } }>(
        `/api/player?tag=${encodeURIComponent(tag!)}`,
      );
      return {
        player: payload.player,
        battles: collection<BattleLogItem>(payload.battleLog),
      };
    },
  });

  const directoryQuery = useQuery({
    queryKey: ["player-search-page", nameQuery],
    enabled: !tag && nameQuery.length >= 2,
    queryFn: () => apiFetch<PlayerSearchResponse>(`/api/player-search?q=${encodeURIComponent(nameQuery)}&limit=25`),
  });

  const historyQuery = useQuery({
    queryKey: ["player-history", tag, playerQuery.dataUpdatedAt],
    enabled: Boolean(tag && playerQuery.data),
    queryFn: () =>
      apiFetch<{ snapshots: PlayerSnapshot[] }>(`/api/player-history?tag=${encodeURIComponent(tag!)}`).then(
        (payload) => payload.snapshots,
      ),
  });

  const analyticsQuery = useInfiniteQuery({
    queryKey: ["player-analytics", tag, playerQuery.dataUpdatedAt],
    enabled: Boolean(tag && playerQuery.data),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => apiFetch<PlayerAnalytics>(
      `/api/player-analytics?tag=${encodeURIComponent(tag!)}&limit=50${pageParam ? `&before=${pageParam}` : ""}`,
    ),
    getNextPageParam: (page) => page.hasMore ? page.nextCursor : undefined,
  });

  const catalogQuery = useQuery({
    queryKey: ["brawlers"],
    queryFn: () => apiFetch("/api/brawlers").then(normalizeCatalog),
    enabled: Boolean(tag),
  });

  const player = playerQuery.data?.player;
  const battles = playerQuery.data?.battles || [];
  const history = [...(historyQuery.data || [])].sort((a, b) => a.day - b.day);
  const catalog = new Map((catalogQuery.data || []).map((item) => [item.id, item]));
  const brawlers = [...(player?.brawlers || [])].sort((a, b) => b.trophies - a.trophies);
  const analytics = analyticsQuery.data?.pages[0];
  const trackedBattles = analyticsQuery.data?.pages.flatMap((page) => page.battles) || [];

  useEffect(() => {
    if (!player) return;
    rememberRecentProfile({
      tag: player.tag,
      name: player.name,
      iconId: player.icon?.id,
      trophies: player.trophies,
    });
  }, [player]);

  return (
    <div className="page-shell">
      <div>
        <p className="eyebrow">{t("player.eyebrow")}</p>
        <h1 className="font-display text-4xl">{t("player.title")}</h1>
        <PlayerSearchBox initialValue={rawTag || nameQuery} className="mt-4 max-w-lg" buttonLabel={t("common.find")} />
      </div>

      {!tag && !nameQuery ? (
        <EmptyState title={t("player.searchTitle")} detail={t("player.searchDetail")} />
      ) : null}
      {!tag && nameQuery && directoryQuery.isLoading ? <PageStatus tone="loading">{t("search.searching")}</PageStatus> : null}
      {!tag && directoryQuery.error ? (
        <PageStatus tone="error">
          {directoryQuery.error instanceof Error ? directoryQuery.error.message : t("player.searchFailed")}
        </PageStatus>
      ) : null}
      {!tag && directoryQuery.data ? <PlayerResults query={nameQuery} results={directoryQuery.data} /> : null}
      {tag && playerQuery.isLoading ? <PageStatus tone="loading">{t("player.loadingProfile")}</PageStatus> : null}
      {playerQuery.error ? (
        <PageStatus tone="error">{playerQuery.error instanceof Error ? playerQuery.error.message : t("player.loadFailed")}</PageStatus>
      ) : null}

      {player ? (
        <>
          <Card className="grid gap-6 p-6 py-6 md:grid-cols-[auto_1fr]">
            <img src={profileIconUrl(player.icon?.id)} alt="" className="size-24 rounded-xl border border-border" />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("player.liveProfile")}</p>
              <h2 className="font-display text-4xl">{player.name}</h2>
              <p className="text-muted-foreground">{player.tag}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadProfileCard(player, analytics, t, number)}>
                  {t("player.downloadCard")}
                </Button>
                <ProfileActions profile={{ tag: player.tag, name: player.name, iconId: player.icon?.id, trophies: player.trophies }} />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-4">
                {[
                  [t("common.trophies"), trophies(player.trophies)],
                  [t("common.highest"), trophies(player.highestTrophies)],
                  [t("player.threeWins"), trophies(player["3vs3Victories"] || 0)],
                  [t("player.soloDuoWins"), `${trophies(player.soloVictories || 0)} / ${trophies(player.duoVictories || 0)}`],
                ].map(([label, value]) => (
                  <div key={label} className="border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-display text-2xl text-primary">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                  {t("player.levelXp", { level: player.expLevel, xp: trophies(player.expPoints) })}
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-accent" style={{ width: `${Math.min(100, player.expPoints % 100)}%` }} />
                </div>
              </div>
              {player.club?.tag ? (
                <Link
                  to="/clubs"
                  search={{ tag: player.club.tag }}
                  className="mt-4 inline-flex items-center gap-2 text-sm text-accent hover:underline"
                >
                  {t("player.clubNamed", { name: player.club.name || player.club.tag })}
                </Link>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">{t("player.notInClub")}</p>
              )}
            </div>
          </Card>

          {history.length ? <PlayerHistory snapshots={history} /> : null}

          <PlayerAnalyticsPanel
            analytics={analytics}
            battles={trackedBattles}
            liveBattles={battles}
            loading={analyticsQuery.isLoading}
            fetchingMore={analyticsQuery.isFetchingNextPage}
            onLoadMore={() => analyticsQuery.fetchNextPage()}
          />

          <RankedPanel player={player} snapshots={history} />

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <h3 className="font-display text-2xl">{t("player.roster")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("player.rosterSummary", {
                  owned: brawlers.length,
                  power: brawlers.filter((item) => item.power === 11).length,
                  gadgets: brawlers.reduce((sum, item) => sum + (item.gadgets?.length || 0), 0),
                  powers: brawlers.reduce((sum, item) => sum + (item.starPowers?.length || 0), 0),
                })}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {brawlers.map((item) => {
                const meta = catalog.get(item.id);
                return (
                  <Link key={item.id} to="/brawlers/$brawlerId" params={{ brawlerId: String(item.id) }} className="group">
                    <Card className="h-full gap-0 overflow-hidden py-0 transition-colors group-hover:border-primary/60">
                      <div className="relative">
                        <img src={brawlerBorderUrl(item.id)} alt={item.name} className="aspect-square w-full object-cover" />
                        <Badge className="absolute top-2 right-2">{item.power}</Badge>
                      </div>
                      <div className="space-y-1 p-3">
                        <h4 className="font-display text-lg group-hover:text-primary">{item.name}</h4>
                        <p className="text-xs text-muted-foreground">{meta?.rarity || t("player.brawler")}</p>
                        <p className="font-display text-sm text-primary">{trophies(item.trophies)} {t("common.trophies").toLocaleLowerCase()}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("common.rank", { rank: item.rank })} · {t("player.best", { value: trophies(item.highestTrophies || item.trophies) })}
                        </p>
                        <div className="flex flex-wrap gap-1 pt-1">
                          <Badge variant="outline">{t("player.gadgets", { count: item.gadgets?.length || 0 })}</Badge>
                          <Badge variant="outline">{t("player.powers", { count: item.starPowers?.length || 0 })}</Badge>
                          <Badge variant="outline">{t("player.gears", { count: item.gears?.length || 0 })}</Badge>
                          {(item.hypercharges?.length || item.buffies?.length) ? (
                            <Badge variant="outline">{t("player.hypercharge", { count: (item.hypercharges?.length || item.buffies?.length) ?? 0 })}</Badge>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function PlayerAnalyticsPanel({
  analytics,
  battles,
  liveBattles,
  loading,
  fetchingMore,
  onLoadMore,
}: {
  analytics?: PlayerAnalytics;
  battles: PlayerBattle[];
  liveBattles: BattleLogItem[];
  loading: boolean;
  fetchingMore: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useI18n();
  if (loading) return <PageStatus tone="loading">{t("player.analyticsLoading")}</PageStatus>;
  if (!analytics?.summaries.length && !liveBattles.length) {
    return <EmptyState title={t("player.noHistory")} detail={t("player.noHistoryDetail")} />;
  }
  const summary = analytics?.summaries.find((item) => item.days === 30);
  const activity = activityDays(analytics?.activity || []);
  return (
    <section className="space-y-5">
      <div>
        <p className="eyebrow">{t("player.prospective")}</p>
        <h3 className="font-display text-3xl">{t("player.performance")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("player.performanceDetail")}</p>
      </div>
      {analytics ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [t("player.record30"), summary ? `${summary.wins}W · ${summary.losses}L · ${summary.draws}D` : "—"],
              [t("player.winRate"), summary ? formatPercent(summary.winRate) : "—"],
              [t("player.netTrophies"), summary ? `${summary.netTrophies > 0 ? "+" : ""}${summary.netTrophies}` : "—"],
              [t("player.streak"), `${analytics.streaks.current} ${analytics.streaks.currentResult} · ${analytics.streaks.longestWin}W`],
            ].map(([label, value]) => (
              <Card key={label} className="gap-1 p-4 py-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-display text-xl text-primary">{value}</p>
              </Card>
            ))}
          </div>
          <Card className="gap-3 p-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-display text-xl">{t("player.activity90")}</h4>
              <span className="text-xs text-muted-foreground">{t("player.activityLegend")}</span>
            </div>
            <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto" aria-label={t("player.heatmapAria")}>
              {activity.map((day) => (
                <div
                  key={day.day}
                  title={t("player.activityTitle", { date: day.day, battles: day.battles, wins: day.wins })}
                  className={`size-3 rounded-sm ${day.battles === 0 ? "bg-secondary" : day.battles < 3 ? "bg-primary/35" : day.battles < 6 ? "bg-primary/65" : "bg-primary"}`}
                />
              ))}
            </div>
            {analytics.capped ? <p className="text-xs text-amber-500">{t("player.capNotice")}</p> : null}
          </Card>
        </>
      ) : null}
      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">{t("player.battleHistory")}</TabsTrigger>
          <TabsTrigger value="modes">{t("player.modes")}</TabsTrigger>
          <TabsTrigger value="brawlers">{t("common.brawlers")}</TabsTrigger>
          <TabsTrigger value="windows">{t("player.windows")}</TabsTrigger>
        </TabsList>
        <TabsContent value="history" className="mt-4 space-y-3">
          {battles.length ? <BattleHistory battles={battles} /> : <LiveBattleFallback battles={liveBattles} />}
          {analytics?.hasMore ? (
            <Button variant="outline" disabled={fetchingMore} onClick={onLoadMore}>{fetchingMore ? t("player.loadingOlder") : t("player.loadOlder")}</Button>
          ) : null}
        </TabsContent>
        <TabsContent value="modes" className="mt-4">
          <PerformanceTable rows={(analytics?.modes || []).map((row) => ({ key: row.mode, label: readableMode(row.mode), ...row }))} />
        </TabsContent>
        <TabsContent value="brawlers" className="mt-4">
          <PerformanceTable rows={(analytics?.brawlers || []).map((row) => ({ key: String(row.brawlerId), label: row.brawlerName, ...row }))} />
        </TabsContent>
        <TabsContent value="windows" className="mt-4">
          <PerformanceTable rows={(analytics?.summaries || []).map((row) => ({ key: String(row.days), label: `${row.days} days`, ...row }))} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function BattleHistory({ battles }: { battles: PlayerBattle[] }) {
  const { t, date } = useI18n();
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader><TableRow><TableHead>{t("common.date")}</TableHead><TableHead>{t("player.modeMap")}</TableHead><TableHead>{t("player.brawler")}</TableHead><TableHead>{t("common.result")}</TableHead><TableHead className="text-right">{t("common.trophies")}</TableHead></TableRow></TableHeader>
        <TableBody>{battles.map((battle) => (
          <TableRow key={`${battle.battleTime}-${battle.mode}-${battle.brawlerId || 0}`}>
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{date(battle.battleTimestamp, { dateStyle: "short", timeStyle: "short" })}</TableCell>
            <TableCell><p>{readableMode(battle.mode)}</p><p className="text-xs text-muted-foreground">{battle.mapName || t("common.unknownMap")}</p></TableCell>
            <TableCell>{battle.brawlerName || t("common.unknown")}</TableCell>
            <TableCell><Badge variant={battle.result === "victory" ? "default" : "outline"}>{battle.rank ? `#${battle.rank}` : battle.result}{battle.starPlayer ? ` · ${t("common.star")}` : ""}</Badge></TableCell>
            <TableCell className={`text-right ${(battle.trophyChange || 0) >= 0 ? "text-primary" : "text-destructive"}`}>{battle.trophyChange === undefined ? "—" : `${battle.trophyChange > 0 ? "+" : ""}${battle.trophyChange}`}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </div>
  );
}

function LiveBattleFallback({ battles }: { battles: BattleLogItem[] }) {
  const { t } = useI18n();
  return <div className="space-y-2">{battles.map((item, index) => (
    <div key={`${item.battleTime}-${index}`} className="data-surface px-4 py-3">
      <p className="font-medium">{readableMode(item.event?.mode || item.battle?.mode)}</p>
      <p className="text-sm text-muted-foreground">{item.event?.map || t("common.unknownMap")} · {item.battle?.result || (item.battle?.rank ? t("common.rank", { rank: item.battle.rank }) : t("common.completed"))}</p>
    </div>
  ))}</div>;
}

type PerformanceRow = { key: string; label: string; battles: number; wins: number; losses: number; draws: number; winRate: number; netTrophies: number; starPlayerRate: number };
function PerformanceTable({ rows }: { rows: PerformanceRow[] }) {
  const { t } = useI18n();
  if (!rows.length) return <EmptyState title={t("player.notEnough")} />;
  return <div className="overflow-hidden rounded-xl border border-border"><Table>
    <TableHeader><TableRow><TableHead>{t("player.group")}</TableHead><TableHead className="text-right">{t("common.battles")}</TableHead><TableHead className="text-right">{t("common.record")}</TableHead><TableHead className="text-right">{t("player.winRate")}</TableHead><TableHead className="text-right">{t("player.net")}</TableHead><TableHead className="text-right">{t("player.starRate")}</TableHead></TableRow></TableHeader>
    <TableBody>{rows.map((row) => <TableRow key={row.key}><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right">{row.battles}</TableCell><TableCell className="text-right">{row.wins}-{row.losses}-{row.draws}</TableCell><TableCell className="text-right">{formatPercent(row.winRate)}</TableCell><TableCell className="text-right">{row.netTrophies > 0 ? "+" : ""}{row.netTrophies}</TableCell><TableCell className="text-right">{formatPercent(row.starPlayerRate)}</TableCell></TableRow>)}</TableBody>
  </Table></div>;
}

function activityDays(rows: PlayerAnalytics["activity"]) {
  const values = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: 90 }, (_, offset) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (89 - offset));
    const day = date.toISOString().slice(0, 10);
    return values.get(day) || { day, battles: 0, wins: 0 };
  });
}

function RankedPanel({ player, snapshots }: { player: PlayerProfile; snapshots: PlayerSnapshot[] }) {
  const { t } = useI18n();
  const latest = snapshots.at(-1);
  const ranked = player.ranked;
  const current = ranked?.currentRank ?? latest?.rankedCurrent;
  const seasonBest = ranked?.seasonBestRank ?? latest?.rankedSeasonBest;
  const allTime = ranked?.bestRank ?? latest?.rankedBest;
  const rankedHistory = snapshots.filter((snapshot) => snapshot.rankedCurrent !== undefined);
  return <Card className="gap-4 p-6 py-6">
    <div><p className="eyebrow">{t("player.ranked")}</p><h3 className="font-display text-2xl">{t("player.rankedProgression")}</h3></div>
    <div className="grid gap-3 sm:grid-cols-3">{[
      [t("common.current"), ranked?.currentRankName || latest?.rankedCurrentName, current],
      [t("player.seasonBest"), ranked?.seasonBestRankName || latest?.rankedSeasonBestName, seasonBest],
      [t("player.allTimeBest"), ranked?.bestRankName || latest?.rankedBestName, allTime],
    ].map(([label, name, value]) => <div key={String(label)} className="border-t border-border pt-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-xl text-primary">{name || (value === undefined ? t("player.notExposed") : value)}</p>{name && value !== undefined ? <p className="text-xs text-muted-foreground">{t("player.tierValue", { value })}</p> : null}</div>)}</div>
    {rankedHistory.length > 1 ? <div className="flex h-20 items-end gap-1">{rankedHistory.slice(-90).map((snapshot) => <div key={snapshot.day} title={`${snapshot.day}: ${snapshot.rankedCurrentName || snapshot.rankedCurrent}`} className="min-w-1 flex-1 rounded-t bg-accent" style={{ height: `${Math.max(10, ((snapshot.rankedCurrent || 0) / Math.max(...rankedHistory.map((row) => row.rankedCurrent || 1))) * 100)}%` }} />)}</div> : <p className="text-sm text-muted-foreground">{t("player.rankedHistoryEmpty")}</p>}
  </Card>;
}

function profileCardSvg(player: PlayerProfile, analytics: PlayerAnalytics | undefined, t: Translator, number: (value: number) => string) {
  const summary = analytics?.summaries.find((row) => row.days === 30);
  const safe = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] || character);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#111827"/><stop offset="1" stop-color="#172554"/></linearGradient></defs><rect width="1200" height="630" rx="40" fill="url(#g)"/><text x="80" y="105" fill="#60a5fa" font-family="system-ui" font-size="30" font-weight="700">${safe(t("player.cardTitle"))}</text><text x="80" y="210" fill="white" font-family="system-ui" font-size="72" font-weight="800">${safe(player.name)}</text><text x="80" y="260" fill="#94a3b8" font-family="system-ui" font-size="32">${safe(player.tag)}</text><text x="80" y="380" fill="white" font-family="system-ui" font-size="30">${safe(t("common.trophies"))}</text><text x="80" y="440" fill="#facc15" font-family="system-ui" font-size="58" font-weight="800">${number(player.trophies)}</text><text x="440" y="380" fill="white" font-family="system-ui" font-size="30">${safe(t("player.record30"))}</text><text x="440" y="440" fill="#4ade80" font-family="system-ui" font-size="50" font-weight="800">${summary ? `${summary.wins}W ${summary.losses}L` : safe(t("player.cardTracking"))}</text><text x="850" y="380" fill="white" font-family="system-ui" font-size="30">${safe(t("player.cardBest"))}</text><text x="850" y="440" fill="#facc15" font-family="system-ui" font-size="50" font-weight="800">${number(player.highestTrophies)}</text><text x="80" y="560" fill="#94a3b8" font-family="system-ui" font-size="24">${safe(t("player.cardFooter"))}</text></svg>`;
}

function downloadProfileCard(player: PlayerProfile, analytics: PlayerAnalytics | undefined, t: Translator, number: (value: number) => string) {
  const url = URL.createObjectURL(new Blob([profileCardSvg(player, analytics, t, number)], { type: "image/svg+xml" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${player.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-brawlstats.svg`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function PlayerResults({ query, results }: { query: string; results: PlayerSearchResponse }) {
  const { t } = useI18n();
  if (!results.players.length) {
    return (
      <EmptyState
        title={t("player.noNamed", { query })}
        detail={t("player.noNamedDetail")}
      />
    );
  }

  return (
    <section>
      <p className="text-xs uppercase tracking-[0.2em] text-accent">{t("player.directory")}</p>
      <h2 className="font-display text-3xl">{t("player.matching", { query })}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {results.players.map((player) => (
          <Link
            key={player.tag}
            to="/players"
            search={{ tag: `#${player.tag}` }}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-accent/60"
          >
            <img src={profileIconUrl(player.iconId)} alt="" className="size-12 rounded-xl" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display">{player.name}</span>
              <span className="block text-xs text-muted-foreground">#{player.tag} · {player.clubName || t("common.noTrackedClub")}</span>
            </span>
            {typeof player.trophies === "number" ? (
              <span className="font-display text-sm text-primary">{trophies(player.trophies)}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

function PlayerHistory({ snapshots }: { snapshots: PlayerSnapshot[] }) {
  const { t } = useI18n();
  const first = snapshots[0];
  const latest = snapshots[snapshots.length - 1];
  const min = Math.min(...snapshots.map((snapshot) => snapshot.trophies));
  const max = Math.max(...snapshots.map((snapshot) => snapshot.trophies));
  const range = Math.max(1, max - min);
  const change = latest.trophies - first.trophies;

  return (
    <Card className="gap-0 p-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent">{t("player.continuous")}</p>
          <h3 className="font-display text-2xl">{t("player.trophyHistory")}</h3>
        </div>
        <p className={`font-display ${change >= 0 ? "text-primary" : "text-destructive"}`}>
          {t("player.sinceFirst", { change: `${change > 0 ? "+" : ""}${trophies(change)}` })}
        </p>
      </div>
      <div className="mt-5 flex h-40 items-end gap-1 rounded-lg bg-secondary/60 p-4" aria-label={t("player.dailyHistory")}>
        {snapshots.slice(-60).map((snapshot) => {
          const height = 18 + ((snapshot.trophies - min) / range) * 82;
          return (
            <div
              key={snapshot.day}
              title={`${snapshot.day}: ${trophies(snapshot.trophies)} ${t("common.trophies").toLocaleLowerCase()}`}
              className="min-w-1 flex-1 rounded-t-sm bg-primary/75 transition hover:bg-primary"
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {[
          [t("player.trackedDays"), snapshots.length],
          [t("player.currentTrophies"), trophies(latest.trophies)],
          [t("player.highestRecorded"), trophies(max)],
          [t("player.power11"), latest.power11Count],
        ].map(([label, value]) => (
          <div key={label} className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-display text-xl text-primary">{value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
