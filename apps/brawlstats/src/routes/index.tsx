import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Trophy } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayerSearch } from "@/components/PlayerSearch";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableRow } from "@/components/ui/table";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import {
  brawlerBorderUrl,
  clubBadgeUrl,
  eventModeId,
  gameModeImageUrl,
  profileIconUrl,
} from "@/lib/artwork";
import { brawlData } from "@/lib/game-data";
import { readableMode, relativeEnd, trophies } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { queryListState } from "@/lib/query-list-state";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [{ title: "StatsConnect · Brawl Stars statistics" }],
  }),
});

function HomePage() {
  const { t } = useI18n();
  const catalogQuery = useQuery(brawlData.brawlers());
  const eventsQuery = useQuery(brawlData.events());
  const playersQuery = useQuery(brawlData.rankingPlayers("global", 6));
  const clubsQuery = useQuery(brawlData.rankingClubs("global", 6));

  const newest = [...(catalogQuery.data || [])].sort((a, b) => b.id - a.id).slice(0, 12);
  const catalogState = queryListState(catalogQuery);
  const eventsState = queryListState(eventsQuery);
  const playersState = queryListState(playersQuery);
  const clubsState = queryListState(clubsQuery);

  return (
    <div>
      <section className="brawl-hero border-b border-border">
        <div className="relative mx-auto grid max-w-7xl items-center gap-4 px-4 pt-10 md:px-6 lg:min-h-[580px] lg:grid-cols-[1fr_1fr] lg:pt-0">
          <div className="brawl-hero-copy relative z-10 self-center pb-4 lg:pb-16">
            <p className="brawl-eyebrow">StatsConnect</p>
            <h1 className="mt-3 font-display text-[clamp(3.25rem,7vw,6rem)] leading-[0.95] text-primary">
              Brawl Stars
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              {t("home.description")}
            </p>
            <div className="brawl-search-panel mt-7 max-w-lg">
              <PlayerSearch buttonLabel={t("home.viewPlayer")} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/maps" className={cn(buttonVariants({ variant: "secondary" }), "h-9 px-3")}>
                {t("home.mapsMeta")}
              </Link>
              <Link to="/leaderboards" className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3")}>
                {t("nav.leaderboards")}
              </Link>
            </div>
          </div>

          <div className="pointer-events-none relative h-[280px] self-end sm:h-[380px] lg:h-[580px]">
            <img
              src={`${import.meta.env.BASE_URL}assets/generated/brawlstats-hero-official.webp`}
              alt={t("home.heroAlt")}
              width={900}
              height={1125}
              fetchPriority="high"
              className="brawl-hero-art absolute right-1/2 bottom-0 h-[340px] w-auto max-w-none translate-x-1/2 sm:h-[450px] lg:right-[-1rem] lg:h-[620px] lg:translate-x-0"
            />
          </div>
        </div>
      </section>

      <div className="page-shell space-y-14">
        <section>
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="brawl-eyebrow mb-2">{t("home.liveCatalog")}</p>
              <h2 className="section-title">{t("home.newest")}</h2>
            </div>
            <Link to="/brawlers" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0")}>
              {t("common.brawlers")} <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </div>
          <HomeListFeedback state={catalogState} error={catalogQuery.error} emptyTitle={t("maps.noBrawlers")} />
          {catalogState === "ready" ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
            {newest.map((brawler) => (
              <Card
                key={brawler.id}
                className="brawler-roster-card group gap-0 overflow-hidden py-0"
              >
                <Link to="/brawlers/$brawlerId" params={{ brawlerId: String(brawler.id) }} className="block h-full">
                  <ImageWithFallback
                    src={brawlerBorderUrl(brawler.id)}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                  <CardContent className="space-y-2 p-3">
                    <Badge className="max-w-full whitespace-normal" style={{ background: brawler.color, color: "#141414" }}>{brawler.rarity}</Badge>
                    <h3 className="flex items-center justify-between gap-1 font-display text-xl">
                      <span className="min-w-0 break-words">{brawler.name}</span>
                      <ArrowUpRight className="size-4 shrink-0 text-primary" aria-hidden />
                    </h3>
                    <p className="text-sm text-muted-foreground">{brawler.role}</p>
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div> : null}
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <div>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="brawl-eyebrow mb-2">{t("home.rotation")}</p>
                <h2 className="section-title">{t("home.activeEvents")}</h2>
              </div>
              <Link to="/maps" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                {t("home.allMaps")}
              </Link>
            </div>
            <div className="space-y-2">
              <HomeListFeedback state={eventsState} error={eventsQuery.error} emptyTitle={t("home.noEvents")} emptyDetail={t("home.noEventsDetail")} />
              {eventsState === "ready" ? (
                (eventsQuery.data || []).slice(0, 6).map((item, index) => {
                  const mode = item.event?.mode || "unknown";
                  const mapId = item.event?.id;
                  return (
                    <Link
                      key={`${mode}-${item.event?.map}-${index}`}
                      to={mapId ? "/maps/$mapId" : "/maps"}
                      params={mapId ? { mapId: String(mapId) } : undefined}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 transition hover:border-accent/60"
                    >
                      <img src={gameModeImageUrl(eventModeId(mode))} alt="" className="size-12 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{readableMode(mode)}</p>
                        <p className="truncate text-sm text-muted-foreground">{item.event?.map || t("home.mapUnavailable")}</p>
                      </div>
                      <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-xs tabular-nums text-primary">{relativeEnd(item.endTime)}</span>
                    </Link>
                  );
                })
              ) : null}
            </div>
          </div>

          <div>
            <div className="mb-4">
              <p className="brawl-eyebrow mb-2">{t("home.globalRankings")}</p>
              <h2 className="section-title">{t("home.topPlayers")}</h2>
            </div>
            <HomeListFeedback state={playersState} error={playersQuery.error} emptyTitle={t("leaderboard.empty")} />
            {playersState === "ready" ? <div className="data-surface overflow-hidden">
              <Table>
                <TableCaption className="sr-only">{t("home.topPlayers")} · {t("common.trophies")}</TableCaption>
                <TableBody>
                  {(playersQuery.data || []).map((player, index) => (
                    <TableRow key={player.tag}>
                      <TableCell className={cn("game-rank w-10 px-3", index === 0 ? "text-primary" : "text-muted-foreground")}>{index + 1}</TableCell>
                      <TableCell className="w-12 px-0">
                        <img src={profileIconUrl(player.icon?.id)} alt="" className="size-8 rounded-full" />
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/players"
                          search={{ tag: player.tag }}
                          className="game-label hover:text-primary"
                        >
                          {player.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{player.club?.name || t("common.noClub")}</p>
                      </TableCell>
                      <TableCell className="game-stat px-3 text-right text-primary"><span className="inline-flex items-center gap-1.5"><Trophy className="size-3.5" aria-hidden />{trophies(player.trophies)}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div> : null}
            {clubsState !== "ready" ? <div className="mt-4">
              <h3 className="mb-2 font-display text-xl">{t("home.topClub")}</h3>
              <HomeListFeedback state={clubsState} error={clubsQuery.error} emptyTitle={t("leaderboard.empty")} />
            </div> : null}
            {clubsState === "ready" && clubsQuery.data?.[0] ? (
              <Card className="mt-4 flex-row items-center gap-3 p-4 py-4">
                <img src={clubBadgeUrl(clubsQuery.data[0].badgeId)} alt="" className="size-12" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("home.topClub")}</p>
                  <Link
                    to="/clubs"
                    search={{ tag: clubsQuery.data[0].tag }}
                    className="font-display text-xl hover:text-primary"
                  >
                    {clubsQuery.data[0].name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {clubsQuery.data[0].tag} · {trophies(clubsQuery.data[0].trophies)} {t("common.trophies").toLocaleLowerCase()}
                  </p>
                </div>
              </Card>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function HomeListFeedback({ state, error, emptyTitle, emptyDetail }: {
  state: ReturnType<typeof queryListState>;
  error: Error | null;
  emptyTitle: string;
  emptyDetail?: string;
}) {
  const { t } = useI18n();
  switch (state) {
    case "loading": return <PageStatus tone="loading">{t("home.loading")}</PageStatus>;
    case "error": return <PageStatus tone="error">{error?.message || t("home.loadError")}</PageStatus>;
    case "empty": return <EmptyState title={emptyTitle} detail={emptyDetail} />;
    case "ready": return null;
  }
}
