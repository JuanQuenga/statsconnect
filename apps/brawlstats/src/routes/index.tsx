import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayerSearch } from "@/components/PlayerSearch";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
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
  const error =
    catalogQuery.error || eventsQuery.error || playersQuery.error || clubsQuery.error;

  return (
    <div>
      <section className="brawl-hero border-b border-border">
        <div className="relative mx-auto grid min-h-[620px] max-w-7xl items-center gap-4 px-4 pt-12 md:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:pt-0">
          <div className="brawl-hero-copy relative z-10 self-center pb-4 lg:pb-16">
            <h1 className="mt-3 font-display text-5xl font-bold md:text-6xl">
              StatsConnect<span className="text-primary"> Brawl Stars</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              {t("home.description")}
            </p>
            <PlayerSearch className="mt-8 max-w-lg" buttonLabel={t("home.viewPlayer")} />
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/maps" className={cn(buttonVariants({ variant: "secondary" }), "h-9 px-3")}>
                {t("home.mapsMeta")}
              </Link>
              <Link to="/leaderboards" className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3")}>
                {t("nav.leaderboards")}
              </Link>
            </div>
          </div>

          <div className="relative min-h-[430px] self-end lg:min-h-[650px]">
            <img
              src={`${import.meta.env.BASE_URL}assets/generated/brawlstats-hero-official.webp`}
              alt={t("home.heroAlt")}
              width={900}
              height={1125}
              fetchPriority="high"
              className="brawl-hero-art absolute right-1/2 bottom-0 w-[min(700px,112%)] max-w-none translate-x-1/2 lg:right-[-1rem] lg:h-[700px] lg:w-auto lg:translate-x-0"
            />
          </div>
        </div>
      </section>

      <div className="page-shell space-y-14">
        {error ? (
          <PageStatus tone="error">{error instanceof Error ? error.message : t("home.loadError")}</PageStatus>
        ) : catalogQuery.isLoading ? (
          <PageStatus tone="loading">{t("home.loading")}</PageStatus>
        ) : null}

        <section>
          <div className="mb-5">
            <h2 className="section-title">{t("home.newest")}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {newest.map((brawler, index) => (
              <Card
                key={brawler.id}
                className="group gap-0 overflow-hidden py-0 transition hover:border-primary/50"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <ImageWithFallback
                  src={brawlerBorderUrl(brawler.id)}
                  alt={brawler.name}
                  className="aspect-square w-full object-cover"
                />
                <CardContent className="space-y-2 p-3 sm:p-4">
                  <Badge style={{ background: brawler.color, color: "#141414" }}>{brawler.rarity}</Badge>
                  <h3 className="font-display text-xl">{brawler.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {brawler.role} · {brawler.gadget}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <div>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="section-title">{t("home.activeEvents")}</h2>
              </div>
              <Link to="/maps" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                {t("home.allMaps")}
              </Link>
            </div>
            <div className="space-y-2">
              {(eventsQuery.data || []).length ? (
                eventsQuery.data!.slice(0, 6).map((item, index) => {
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
                      <span className="text-xs text-primary">{relativeEnd(item.endTime)}</span>
                    </Link>
                  );
                })
              ) : (
                <EmptyState title={t("home.noEvents")} detail={t("home.noEventsDetail")} />
              )}
            </div>
          </div>

          <div>
            <div className="mb-4">
              <h2 className="section-title">{t("home.topPlayers")}</h2>
            </div>
            <div className="data-surface overflow-hidden">
              <Table>
                <TableBody>
                  {(playersQuery.data || []).map((player, index) => (
                    <TableRow key={player.tag}>
                      <TableCell className="game-rank w-10 px-3 text-muted-foreground">{index + 1}</TableCell>
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
                      <TableCell className="game-stat px-3 text-right text-primary">{trophies(player.trophies)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {clubsQuery.data?.[0] ? (
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
