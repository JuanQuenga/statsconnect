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
  apiFetch,
  brawlerBorderUrl,
  clubBadgeUrl,
  collection,
  eventModeId,
  gameModeImageUrl,
  profileIconUrl,
} from "@/lib/api";
import { normalizeCatalog } from "@/lib/brawlers";
import { readableMode, relativeEnd, trophies } from "@/lib/format";
import type { EventItem, RankingClub, RankingPlayer } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [{ title: "BrawlStats.io" }],
  }),
});

function HomePage() {
  const catalogQuery = useQuery({
    queryKey: ["brawlers"],
    queryFn: () => apiFetch("/api/brawlers").then(normalizeCatalog),
  });
  const eventsQuery = useQuery({
    queryKey: ["events"],
    queryFn: () => apiFetch("/api/events").then((p) => collection<EventItem>(p).slice(0, 6)),
  });
  const playersQuery = useQuery({
    queryKey: ["rankings", "players", "global", 6],
    queryFn: () =>
      apiFetch("/api/rankings?kind=players&country=global&limit=6").then((p) => collection<RankingPlayer>(p)),
  });
  const clubsQuery = useQuery({
    queryKey: ["rankings", "clubs", "global", 6],
    queryFn: () =>
      apiFetch("/api/rankings?kind=clubs&country=global&limit=6").then((p) => collection<RankingClub>(p)),
  });

  const newest = [...(catalogQuery.data || [])].sort((a, b) => b.id - a.id).slice(0, 12);
  const featured = newest[0];
  const error =
    catalogQuery.error || eventsQuery.error || playersQuery.error || clubsQuery.error;

  return (
    <div>
      <section className="brawl-hero border-b border-border">
        <div className="relative mx-auto grid min-h-[680px] max-w-7xl items-center gap-4 px-4 pt-12 md:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:pt-0">
          <div className="brawl-hero-copy relative z-10 self-center pb-4 lg:pb-16">
            <p className="eyebrow">Live Brawl Stars statistics</p>
            <h1 className="mt-3 font-display text-5xl font-bold md:text-7xl">
              BrawlStats<span className="text-primary">.io</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              Track players, clubs, event rotation, map meta, and official rankings — powered by the Brawl Stars API
              and first-party battle aggregation.
            </p>
            <PlayerSearch className="mt-8 max-w-lg" buttonLabel="View Player" />
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/maps" className={cn(buttonVariants({ variant: "secondary" }), "h-9 px-3")}>
                Maps & Meta
              </Link>
              <Link to="/leaderboards" className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3")}>
                Leaderboards
              </Link>
            </div>
          </div>

          <div className="relative min-h-[430px] self-end lg:min-h-[650px]">
            <img
              src={`${import.meta.env.BASE_URL}assets/generated/brawlstats-hero-official.webp`}
              alt="Colt, Shelly, and Spike from Brawl Stars"
              width={900}
              height={1125}
              fetchPriority="high"
              className="brawl-hero-art absolute right-1/2 bottom-0 w-[min(700px,112%)] max-w-none translate-x-1/2 lg:right-[-1rem] lg:h-[700px] lg:w-auto lg:translate-x-0"
            />
            {featured ? (
              <div className="absolute right-0 bottom-6 z-10 hidden items-center gap-3 rounded-xl border border-white/15 bg-card/90 px-4 py-3 shadow-2xl backdrop-blur-md sm:flex lg:right-2 lg:bottom-10">
                <ImageWithFallback
                  src={brawlerBorderUrl(featured.id)}
                  alt=""
                  className="size-12 rounded-lg object-cover"
                />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">Live catalog</p>
                  <p className="font-display text-lg leading-tight">Newest: {featured.name}</p>
                  <p className="text-xs text-muted-foreground">{featured.rarity} · {featured.role}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="page-shell space-y-14">
        {error ? (
          <PageStatus tone="error">{error instanceof Error ? error.message : "Failed to load live data."}</PageStatus>
        ) : catalogQuery.isLoading ? (
          <PageStatus tone="loading">Loading live game data…</PageStatus>
        ) : null}

        <section>
          <div className="mb-5">
            <p className="eyebrow">Live game data</p>
            <h2 className="section-title">Newest brawlers</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                <CardContent className="space-y-2 p-4">
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
                <p className="eyebrow">Current rotation</p>
                <h2 className="section-title">Active events</h2>
              </div>
              <Link to="/maps" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                All maps
              </Link>
            </div>
            <div className="space-y-2">
              {(eventsQuery.data || []).length ? (
                eventsQuery.data!.map((item, index) => {
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
                        <p className="truncate text-sm text-muted-foreground">{item.event?.map || "Map unavailable"}</p>
                      </div>
                      <span className="text-xs text-primary">{relativeEnd(item.endTime)}</span>
                    </Link>
                  );
                })
              ) : (
                <EmptyState title="No active events" detail="Check back after the next rotation." />
              )}
            </div>
          </div>

          <div>
            <div className="mb-4">
              <p className="eyebrow">Global rankings</p>
              <h2 className="section-title">Top players</h2>
            </div>
            <div className="data-surface overflow-hidden">
              <Table>
                <TableBody>
                  {(playersQuery.data || []).map((player, index) => (
                    <TableRow key={player.tag}>
                      <TableCell className="w-10 px-3 text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="w-12 px-0">
                        <img src={profileIconUrl(player.icon?.id)} alt="" className="size-8 rounded-full" />
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/players"
                          search={{ tag: player.tag }}
                          className="font-medium hover:text-primary"
                        >
                          {player.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{player.club?.name || "No club"}</p>
                      </TableCell>
                      <TableCell className="px-3 text-right font-medium text-primary">{trophies(player.trophies)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {clubsQuery.data?.[0] ? (
              <Card className="mt-4 flex-row items-center gap-3 p-4 py-4">
                <img src={clubBadgeUrl(clubsQuery.data[0].badgeId)} alt="" className="size-12" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Top club</p>
                  <Link
                    to="/clubs"
                    search={{ tag: clubsQuery.data[0].tag }}
                    className="font-display text-xl hover:text-primary"
                  >
                    {clubsQuery.data[0].name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {clubsQuery.data[0].tag} · {trophies(clubsQuery.data[0].trophies)} trophies
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
