import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Crown,
  Download,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { useEffect, useMemo, type CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlayerSearch as PlayerSearchBox } from "@/components/PlayerSearch";
import { ProfileActions } from "@/components/ProfileActions";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { brawlerBorderUrl, brawlerFeatureArtUrl, brawlerModelUrl, profileIconUrl } from "@/lib/artwork";
import { brawlData } from "@/lib/game-data";
import { formatPercent, normalizeTag, readableMode, trophies } from "@/lib/format";
import { rememberRecentProfile } from "@/lib/preferences";
import type { BattleLogItem, BrawlerCatalogItem, PlayerAnalytics, PlayerBattle, PlayerProfile, PlayerSearchResponse, PlayerSnapshot } from "@/lib/types";
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
    ...brawlData.player(tag),
    enabled: Boolean(tag),
  });

  const directoryQuery = useQuery({
    ...brawlData.playerSearch(nameQuery, 25),
    enabled: !tag && nameQuery.length >= 2,
  });

  const historyQuery = useQuery({
    ...brawlData.playerHistory(tag, playerQuery.dataUpdatedAt),
    enabled: Boolean(tag && playerQuery.data),
  });

  const analyticsQuery = useInfiniteQuery({
    ...brawlData.playerAnalytics(tag, playerQuery.dataUpdatedAt),
    enabled: Boolean(tag && playerQuery.data),
  });

  const catalogQuery = useQuery({
    ...brawlData.brawlers(),
    enabled: Boolean(tag),
  });

  const player = playerQuery.data?.player;
  const battles = playerQuery.data?.battles || [];
  const historyData = historyQuery.data;
  const catalogData = catalogQuery.data;
  const analyticsPages = analyticsQuery.data?.pages;
  const history = useMemo(
    () => [...(historyData || [])].sort((a, b) => a.day - b.day),
    [historyData],
  );
  const catalog = useMemo(
    () => new Map((catalogData || []).map((item) => [item.id, item])),
    [catalogData],
  );
  const analytics = analyticsPages?.[0];
  const trackedBattles = useMemo(
    () => analyticsPages?.flatMap((page) => page.battles) || [],
    [analyticsPages],
  );

  // Depend on stable primitives: the player object identity changes on every
  // background refetch, which would otherwise rewrite localStorage each poll.
  const playerTag = player?.tag;
  const playerName = player?.name;
  const playerIconId = player?.icon?.id;
  const playerTrophies = player?.trophies;
  useEffect(() => {
    if (!playerTag) return;
    rememberRecentProfile({
      tag: playerTag,
      name: playerName,
      iconId: playerIconId,
      trophies: playerTrophies,
    });
  }, [playerTag, playerName, playerIconId, playerTrophies]);

  if (player) {
    return (
      <PlayerProfilePage
        player={player}
        history={history}
        analytics={analytics}
        trackedBattles={trackedBattles}
        liveBattles={battles}
        catalog={catalog}
        analyticsLoading={analyticsQuery.isLoading}
        fetchingMore={analyticsQuery.isFetchingNextPage}
        onLoadMore={() => analyticsQuery.fetchNextPage()}
      />
    );
  }

  return (
    <div className="page-shell">
      <div className="page-intro">
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

    </div>
  );
}

type PlayerAccentStyle = CSSProperties & { "--player-accent": string };

function PlayerProfilePage({
  player,
  history,
  analytics,
  trackedBattles,
  liveBattles,
  catalog,
  analyticsLoading,
  fetchingMore,
  onLoadMore,
}: {
  player: PlayerProfile;
  history: PlayerSnapshot[];
  analytics?: PlayerAnalytics;
  trackedBattles: PlayerBattle[];
  liveBattles: BattleLogItem[];
  catalog: Map<number, BrawlerCatalogItem>;
  analyticsLoading: boolean;
  fetchingMore: boolean;
  onLoadMore: () => void;
}) {
  const { t, number } = useI18n();
  const brawlers = [...(player.brawlers || [])].sort((a, b) => b.trophies - a.trophies);
  const signature = brawlers[0];
  const signatureMeta = signature ? catalog.get(signature.id) : undefined;
  const signatureFeatureArt = signature ? brawlerFeatureArtUrl(signature.id) : undefined;
  const summary = analytics?.summaries.find((item) => item.days === 30);
  const accent = /^#[0-9a-f]{6}$/i.test(signatureMeta?.color || "") ? signatureMeta!.color : "#f5c85b";
  const style: PlayerAccentStyle = { "--player-accent": accent };
  const trophyProgress = player.highestTrophies > 0
    ? Math.min(100, (player.trophies / player.highestTrophies) * 100)
    : 0;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${player.name} (${player.tag}) · StatsConnect Brawl Stars statistics`;
    return () => {
      document.title = previousTitle;
    };
  }, [player.name, player.tag]);

  return (
    <div className="player-profile-shell" style={style}>
      <section className="player-identity" aria-labelledby="player-name">
        <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-8 px-4 py-7 md:px-6 md:py-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,.75fr)] lg:items-end lg:py-14">
          <div>
            <div className="mb-7 flex flex-wrap items-center gap-3">
              <Link
                to="/players"
                search={{}}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                {t("common.players")}
              </Link>
              <span className="h-4 w-px bg-border" aria-hidden />
              <Badge variant="outline" className="border-white/15 bg-black/15 text-foreground">
                <span className="mr-1 size-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
                {t("player.liveProfile")}
              </Badge>
            </div>

            <div className="flex items-center gap-4 sm:gap-5">
              <div className="relative shrink-0">
                <div className="absolute -inset-2 rounded-[1.4rem] bg-[var(--player-accent)]/20 blur-lg" aria-hidden />
                <img
                  src={profileIconUrl(player.icon?.id)}
                  alt=""
                  className="relative size-20 rounded-2xl border border-white/20 bg-card object-cover shadow-2xl sm:size-28"
                />
                <span className="absolute -right-2 -bottom-2 grid size-8 place-items-center rounded-full border-2 border-background bg-primary font-display text-sm text-primary-foreground">
                  {player.expLevel}
                </span>
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold tracking-[0.18em] text-[var(--player-accent)] uppercase">
                  {player.tag}
                </p>
                <h1 id="player-name" className="truncate font-display text-5xl leading-[.9] tracking-[-0.035em] text-white sm:text-7xl">
                  {player.name}
                </h1>
                {player.club?.tag ? (
                  <Link
                    to="/clubs"
                    search={{ tag: player.club.tag }}
                    className="mt-3 inline-flex items-center gap-2 text-sm text-foreground/75 transition hover:text-white"
                  >
                    <Users className="size-4 text-accent" />
                    {t("player.clubNamed", { name: player.club.name || player.club.tag })}
                  </Link>
                ) : (
                  <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="size-4" />
                    {t("player.notInClub")}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              <Button size="lg" onClick={() => downloadProfileCard(player, analytics, t, number)}>
                <Download />
                {t("player.downloadCard")}
              </Button>
              <ProfileActions size="lg" profile={{ tag: player.tag, name: player.name, iconId: player.icon?.id, trophies: player.trophies }} />
            </div>
          </div>

          {signature ? (
            <div className="relative hidden min-h-64 lg:block" aria-label={`${signature.name} ${t("player.brawler")}`}>
              <div className="absolute inset-x-8 bottom-0 h-24 rounded-[50%] bg-[var(--player-accent)]/25 blur-3xl" aria-hidden />
              <ImageWithFallback
                src={signatureFeatureArt || brawlerModelUrl(signature.id)}
                fallbackSrc={signatureMeta?.imageUrl2 || signatureMeta?.imageUrl || brawlerBorderUrl(signature.id)}
                alt={signature.name}
                className={signatureFeatureArt
                  ? "absolute inset-0 h-full w-full rounded-2xl object-cover object-center opacity-90"
                  : "absolute right-0 bottom-0 max-h-[25rem] w-full object-contain object-bottom drop-shadow-[0_24px_28px_rgba(0,0,0,.55)]"}
              />
              {signatureFeatureArt ? <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-background/60 via-transparent to-transparent" aria-hidden /> : null}
              <Card className="absolute right-2 bottom-1 z-10 w-48 gap-1 border border-white/10 bg-background/80 p-3 py-3 backdrop-blur-md">
                <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">{t("player.brawler")}</p>
                <div className="flex items-end justify-between gap-2">
                  <p className="font-display text-xl">{signature.name}</p>
                  <p className="font-display text-primary">{trophies(signature.trophies)}</p>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </section>

      <main className="mx-auto w-full max-w-7xl space-y-9 px-4 py-6 md:px-6 md:py-9">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label={t("player.liveProfile")}>
          <ProfileStat icon={Trophy} label={t("common.trophies")} value={trophies(player.trophies)} emphasized />
          <ProfileStat icon={Crown} label={t("common.highest")} value={trophies(player.highestTrophies)} />
          <ProfileStat icon={Swords} label={t("player.threeWins")} value={trophies(player["3vs3Victories"] || 0)} />
          <ProfileStat icon={Target} label={t("player.soloDuoWins")} value={`${trophies(player.soloVictories || 0)} / ${trophies(player.duoVictories || 0)}`} />
          <ProfileStat icon={Sparkles} label={t("common.brawlers")} value={number(brawlers.length)} />
        </section>

        <Card className="gap-4 border border-white/5 bg-card/80 p-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <span>{t("player.levelXp", { level: player.expLevel, xp: trophies(player.expPoints) })}</span>
              <span className="font-display text-foreground">{Math.round(trophyProgress)}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-[var(--player-accent)]" style={{ width: `${trophyProgress}%` }} />
            </div>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label={t("player.liveProfile")}>
            <a href="#performance" className="text-muted-foreground transition hover:text-foreground">{t("player.performance")}</a>
            <a href="#ranked" className="text-muted-foreground transition hover:text-foreground">{t("player.ranked")}</a>
            <a href="#roster" className="text-muted-foreground transition hover:text-foreground">{t("player.roster")}</a>
          </nav>
        </Card>

        {summary ? (
          <section className="grid gap-3 md:grid-cols-4" aria-label={t("player.record30")}>
            <ProfileSignal icon={Activity} label={t("player.record30")} value={`${summary.wins}W · ${summary.losses}L · ${summary.draws}D`} />
            <ProfileSignal icon={Target} label={t("player.winRate")} value={formatPercent(summary.winRate)} />
            <ProfileSignal icon={Trophy} label={t("player.netTrophies")} value={`${summary.netTrophies > 0 ? "+" : ""}${summary.netTrophies}`} />
            <ProfileSignal icon={Swords} label={t("player.streak")} value={analytics ? `${analytics.streaks.current} ${analytics.streaks.currentResult} · ${analytics.streaks.longestWin}W` : "—"} />
          </section>
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
          {history.length ? <PlayerHistory snapshots={history} /> : <EmptyState title={t("player.noHistory")} detail={t("player.noHistoryDetail")} />}
          <div id="ranked"><RankedPanel player={player} snapshots={history} /></div>
        </div>

        <div id="performance">
          <PlayerAnalyticsPanel
            analytics={analytics}
            battles={trackedBattles}
            liveBattles={liveBattles}
            loading={analyticsLoading}
            fetchingMore={fetchingMore}
            onLoadMore={onLoadMore}
          />
        </div>

        <PlayerRoster player={player} brawlers={brawlers} catalog={catalog} />
      </main>
    </div>
  );
}

function ProfileStat({ icon: Icon, label, value, emphasized = false }: {
  icon: typeof Trophy;
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <Card className={`relative gap-3 border p-4 py-4 ${emphasized ? "border-[var(--player-accent)]/35 bg-[var(--player-accent)]/10" : "border-white/5 bg-card/80"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className={`size-4 ${emphasized ? "text-[var(--player-accent)]" : "text-muted-foreground"}`} />
      </div>
      <p className={`font-display text-2xl ${emphasized ? "text-[var(--player-accent)]" : "text-foreground"}`}>{value}</p>
    </Card>
  );
}

function ProfileSignal({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/45 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-accent"><Icon className="size-4" /></span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-display text-lg">{value}</p>
      </div>
    </div>
  );
}

function PlayerRoster({
  player,
  brawlers,
  catalog,
}: {
  player: PlayerProfile;
  brawlers: NonNullable<PlayerProfile["brawlers"]>;
  catalog: Map<number, BrawlerCatalogItem>;
}) {
  const { t } = useI18n();
  const featured = brawlers.slice(0, 3);
  const remaining = brawlers.slice(3);

  return (
    <section id="roster" className="scroll-mt-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">{t("player.roster")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{player.name}</p>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("player.rosterSummary", {
            owned: brawlers.length,
            power: brawlers.filter((item) => item.power === 11).length,
            gadgets: brawlers.reduce((sum, item) => sum + (item.gadgets?.length || 0), 0),
            powers: brawlers.reduce((sum, item) => sum + (item.starPowers?.length || 0), 0),
          })}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {featured.map((item, index) => {
          const meta = catalog.get(item.id);
          const featureArt = brawlerFeatureArtUrl(item.id);
          return (
            <Link key={item.id} to="/brawlers/$brawlerId" params={{ brawlerId: String(item.id) }} className="group">
              <Card className="relative min-h-56 gap-0 overflow-hidden border border-white/5 bg-card/85 p-0 py-0 transition duration-300 group-hover:-translate-y-1 group-hover:border-[var(--player-accent)]/40">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,color-mix(in_srgb,var(--player-accent)_22%,transparent),transparent_50%)]" aria-hidden />
                <ImageWithFallback
                  src={featureArt || brawlerModelUrl(item.id)}
                  fallbackSrc={meta?.imageUrl2 || meta?.imageUrl || brawlerBorderUrl(item.id)}
                  alt={item.name}
                  className={featureArt
                    ? "absolute inset-0 h-full w-full object-cover object-center opacity-75 transition duration-300 group-hover:scale-105 group-hover:opacity-90"
                    : "absolute right-0 bottom-0 h-[92%] w-[58%] object-contain object-bottom drop-shadow-xl transition duration-300 group-hover:scale-105"}
                />
                {featureArt ? <div className="absolute inset-0 bg-gradient-to-r from-card via-card/85 to-card/10" aria-hidden /> : null}
                <div className="relative z-10 flex h-full min-h-56 max-w-[62%] flex-col p-5">
                  <span className="font-display text-4xl text-white/10">0{index + 1}</span>
                  <div className="mt-auto">
                    <p className="text-xs text-muted-foreground">{meta?.rarity || t("player.brawler")}</p>
                    <h3 className="font-display text-2xl group-hover:text-[var(--player-accent)]">{item.name}</h3>
                    <p className="mt-2 font-display text-xl text-primary">{trophies(item.trophies)}</p>
                    <p className="text-xs text-muted-foreground">{t("common.rank", { rank: item.rank })} · {t("player.best", { value: trophies(item.highestTrophies || item.trophies) })}</p>
                  </div>
                </div>
                <Badge className="absolute top-4 right-4 z-10">{item.power}</Badge>
              </Card>
            </Link>
          );
        })}
      </div>

      {remaining.length ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {remaining.map((item) => {
            const meta = catalog.get(item.id);
            return (
              <Link key={item.id} to="/brawlers/$brawlerId" params={{ brawlerId: String(item.id) }} className="group">
                <Card className="h-full flex-row items-center gap-3 border border-white/5 bg-card/70 p-3 py-3 transition group-hover:border-[var(--player-accent)]/35 group-hover:bg-card">
                  <ImageWithFallback
                    src={brawlerBorderUrl(item.id)}
                    fallbackSrc={meta?.imageUrl2 || meta?.imageUrl3}
                    alt=""
                    className="size-14 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate font-display text-base group-hover:text-[var(--player-accent)]">{item.name}</h3>
                      <Badge variant="outline" className="shrink-0">{item.power}</Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{meta?.rarity || t("player.brawler")} · {t("common.rank", { rank: item.rank })}</p>
                    <p className="mt-1 font-display text-sm text-primary">{trophies(item.trophies)} {t("common.trophies").toLocaleLowerCase()}</p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : null}
    </section>
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
  const activity = activityDays(analytics?.activity || []);
  return (
    <section className="space-y-5">
      <div>
        <h3 className="font-display text-3xl">{t("player.performance")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("player.performanceDetail")}</p>
      </div>
      {analytics ? <PlayerActivityTracker analytics={analytics} activity={activity} /> : null}
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
            <TableCell><Badge className="game-label" variant={battle.result === "victory" ? "default" : "outline"}>{battle.rank ? `#${battle.rank}` : battle.result}{battle.starPlayer ? ` · ${t("common.star")}` : ""}</Badge></TableCell>
            <TableCell className={`game-stat text-right ${(battle.trophyChange || 0) >= 0 ? "text-primary" : "text-destructive"}`}>{battle.trophyChange === undefined ? "—" : `${battle.trophyChange > 0 ? "+" : ""}${battle.trophyChange}`}</TableCell>
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

type ActivityDay = ReturnType<typeof activityDays>[number];

function activityWeeks(days: ActivityDay[]) {
  const firstWeekday = new Date(`${days[0]?.day}T00:00:00Z`).getUTCDay();
  const calendar: Array<ActivityDay | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...days,
  ];
  while (calendar.length % 7) calendar.push(null);
  return Array.from({ length: calendar.length / 7 }, (_, index) => calendar.slice(index * 7, index * 7 + 7));
}

function activityLevelClass(battles: number) {
  if (battles === 0) return "bg-secondary/70 ring-1 ring-inset ring-white/5";
  if (battles < 3) return "bg-primary/25";
  if (battles < 6) return "bg-primary/50";
  if (battles < 10) return "bg-primary/75";
  return "bg-primary";
}

function PlayerActivityTracker({ analytics, activity }: { analytics: PlayerAnalytics; activity: ActivityDay[] }) {
  const { t, locale, number } = useI18n();
  const weeks = activityWeeks(activity);
  const summary = analytics.summaries.find((item) => item.days === 90) ?? analytics.summaries.at(-1);
  const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];
  let previousMonth = "";
  const monthLabels = weeks.map((week) => {
    const day = week.find((item): item is ActivityDay => item !== null);
    if (!day) return "";
    const monthKey = day.day.slice(0, 7);
    if (monthKey === previousMonth) return "";
    previousMonth = monthKey;
    return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
      new Date(`${day.day}T00:00:00Z`),
    );
  });
  const cells = weeks.flatMap((week) => week);

  return (
    <Card className="gap-0 overflow-hidden border border-white/5 bg-card/80 p-0 py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h4 className="font-display text-xl">{t("player.activity90")}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {number(summary?.battles ?? 0)} {t("common.battles").toLocaleLowerCase()}
          </p>
        </div>
        <Badge variant="outline" className="font-normal text-muted-foreground">UTC</Badge>
      </div>

      <div className="grid border-t border-border/70 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 overflow-x-auto p-5">
          <div className="activity-calendar mx-auto w-fit" aria-label={t("player.heatmapAria")}>
            <div className="activity-calendar-months mb-2 flex gap-1" aria-hidden>
              {monthLabels.map((label, index) => (
                <span key={`${label}-${index}`} className="activity-calendar-month shrink-0 overflow-visible whitespace-nowrap text-xs text-muted-foreground">
                  {label}
                </span>
              ))}
            </div>
            <div className="flex gap-3">
              <div className="activity-calendar-days grid w-8 shrink-0 gap-1 text-xs text-muted-foreground" aria-hidden>
                {dayLabels.map((label, index) => <span key={`${label}-${index}`} className="flex items-center justify-end">{label}</span>)}
              </div>
              <div className="activity-calendar-grid grid grid-flow-col grid-rows-7 gap-1">
                {cells.map((day, index) => day ? (
                  <div
                    key={day.day}
                    title={t("player.activityTitle", { date: day.day, battles: day.battles, wins: day.wins })}
                    className={`activity-calendar-cell rounded-md transition hover:ring-2 hover:ring-primary/60 ${activityLevelClass(day.battles)}`}
                  />
                ) : <span key={`empty-${index}`} className="activity-calendar-cell" aria-hidden />)}
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>{t("player.activityLegend")}</span>
              <span className="size-3 rounded-[3px] bg-secondary/70 ring-1 ring-inset ring-white/5" />
              <span className="size-3 rounded-[3px] bg-primary/25" />
              <span className="size-3 rounded-[3px] bg-primary/50" />
              <span className="size-3 rounded-[3px] bg-primary/75" />
              <span className="size-3 rounded-[3px] bg-primary" />
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px border-t border-border/70 bg-border/70 lg:grid-cols-1 lg:border-t-0 lg:border-l">
          {[
            [t("common.battles"), number(summary?.battles ?? 0)],
            [t("common.record"), `${summary?.wins ?? 0}W · ${summary?.losses ?? 0}L`],
            [t("player.winRate"), formatPercent(summary?.winRate ?? 0)],
            [t("player.netTrophies"), `${(summary?.netTrophies ?? 0) > 0 ? "+" : ""}${summary?.netTrophies ?? 0}`],
          ].map(([label, value]) => (
            <div key={label} className="bg-card px-5 py-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 font-display text-lg text-foreground">{value}</dd>
            </div>
          ))}
          {analytics.capped ? <p className="col-span-2 bg-card px-5 py-3 text-xs text-amber-500 lg:col-span-1">{t("player.capNotice")}</p> : null}
        </dl>
      </div>
    </Card>
  );
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
    <h3 className="font-display text-2xl">{t("player.rankedProgression")}</h3>
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
  anchor.download = `${player.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-statsconnect-brawl-stars.svg`;
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
        <h3 className="font-display text-2xl">{t("player.trophyHistory")}</h3>
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
