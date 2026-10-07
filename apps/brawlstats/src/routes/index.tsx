import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdSenseUnit } from "@statsconnect/monetization";
import type { CSSProperties, ReactNode } from "react";
import { Clock, Trophy } from "lucide-react";
import { PlayerSearch } from "@/components/PlayerSearch";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import {
  brawlerBorderUrl,
  brawlerPortraitUrl,
  clubBadgeUrl,
  eventModeColor,
  eventModeId,
  gameModeImageUrl,
  mapImageUrl,
  profileIconUrl,
} from "@/lib/artwork";
import { brawlData } from "@/lib/game-data";
import { readableMode, relativeEnd, trophies } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { queryListState } from "@/lib/query-list-state";
import type { EventItem } from "@/lib/types";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [{ title: "StatsConnect · Brawl Stars statistics" }],
  }),
});

type ListState = ReturnType<typeof queryListState>;

function HomePage() {
  const { t } = useI18n();
  const catalogQuery = useQuery(brawlData.brawlers());
  const eventsQuery = useQuery(brawlData.events());
  const playersQuery = useQuery(brawlData.rankingPlayers("global", 8));
  const clubsQuery = useQuery(brawlData.rankingClubs("global", 8));

  const newest = [...(catalogQuery.data || [])].sort((a, b) => b.id - a.id).slice(0, 6);
  const catalogState = queryListState(catalogQuery);
  const eventsState = queryListState(eventsQuery);
  const playersState = queryListState(playersQuery);
  const clubsState = queryListState(clubsQuery);

  return (
    <div>
      <section className="brawl-hero">
        <div className="relative mx-auto grid max-w-7xl items-center gap-2 px-4 pt-12 md:px-6 lg:min-h-[560px] lg:grid-cols-[1.05fr_0.95fr] lg:pt-0">
          <div className="brawl-hero-copy relative z-10 self-center pb-2 lg:pb-10">
            <h1 className="brawl-hero-title font-display">Brawl Stars</h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted-foreground">
              {t("home.description")}
            </p>
            <div className="brawl-search-panel mt-7 max-w-xl">
              <PlayerSearch buttonLabel={t("home.viewPlayer")} />
            </div>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link to="/maps" className="brawl-chip">{t("home.mapsMeta")}</Link>
              <Link to="/leaderboards" className="brawl-chip">{t("nav.leaderboards")}</Link>
              <Link to="/assistant" className="brawl-chip">{t("nav.assistant")}</Link>
            </div>
          </div>

          <div className="pointer-events-none relative h-[280px] self-end sm:h-[380px] lg:h-[560px]">
            <img
              src={`${import.meta.env.BASE_URL}assets/generated/brawlstats-hero-official.webp`}
              alt={t("home.heroAlt")}
              width={900}
              height={1125}
              fetchPriority="high"
              className="brawl-hero-art absolute right-1/2 bottom-0 h-[330px] w-auto max-w-none translate-x-1/2 sm:h-[440px] lg:right-[-1rem] lg:h-[600px] lg:translate-x-0"
            />
          </div>
        </div>
      </section>

      <div className="page-shell space-y-16">
        <section aria-labelledby="home-events">
          <SectionHeader id="home-events" title={t("home.activeEvents")} link={<Link to="/maps" className="brawl-chip">{t("home.allMaps")}</Link>} />
          <HomeListFeedback state={eventsState} error={eventsQuery.error} emptyTitle={t("home.noEvents")} emptyDetail={t("home.noEventsDetail")} />
          {eventsState === "ready" ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(eventsQuery.data || []).slice(0, 6).map((item, index) => (
                <li key={`${item.event?.mode}-${item.event?.map}-${index}`}>
                  <EventSlot item={item} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section aria-labelledby="home-newest">
          <SectionHeader id="home-newest" title={t("home.newest")} link={<Link to="/brawlers" className="brawl-chip">{t("common.brawlers")}</Link>} />
          <HomeListFeedback state={catalogState} error={catalogQuery.error} emptyTitle={t("maps.noBrawlers")} />
          {catalogState === "ready" ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {newest.map((brawler) => (
                <li key={brawler.id}>
                  <Link
                    to="/brawlers/$brawlerId"
                    params={{ brawlerId: String(brawler.id) }}
                    className="brawler-roster-card"
                    style={{ "--rarity": brawler.color } as CSSProperties}
                  >
                    <figure>
                      <ImageWithFallback
                        src={brawlerPortraitUrl(brawler.id)}
                        fallbackSrc={brawlerBorderUrl(brawler.id)}
                        alt=""
                        loading="lazy"
                        className="aspect-[6/5] w-full object-cover"
                      />
                      <figcaption className="px-3 pt-1.5 pb-2.5">
                        <span className="block truncate font-display text-xl leading-tight text-white">{brawler.name}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-[#c9d6f5]">
                          <span className="size-2.5 shrink-0 rounded-full border border-black/40" style={{ background: brawler.color }} aria-hidden />
                          <span className="truncate">{brawler.rarity} · {brawler.role}</span>
                        </span>
                      </figcaption>
                    </figure>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <AdSenseUnit
          clientId={import.meta.env.VITE_ADSENSE_CLIENT_ID}
          slotId={import.meta.env.VITE_ADSENSE_BRAWL_HOME_SLOT}
          serveAds={import.meta.env.PROD}
          className="mx-auto max-w-4xl px-4 text-muted-foreground sm:px-6"
        />

        <section className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeader id="home-players" title={t("home.topPlayers")} link={<Link to="/leaderboards" className="brawl-chip">{t("nav.leaderboards")}</Link>} />
            <HomeListFeedback state={playersState} error={playersQuery.error} emptyTitle={t("leaderboard.empty")} />
            {playersState === "ready" ? (
              <RankList>
                {(playersQuery.data || []).map((player, index) => (
                  <RankRow
                    key={player.tag}
                    rank={index + 1}
                    icon={<img src={profileIconUrl(player.icon?.id)} alt="" className="size-10 rounded-lg border-2 border-[var(--ink)]" />}
                    name={<Link to="/players" search={{ tag: player.tag }} className="hover:text-primary">{player.name}</Link>}
                    detail={player.club?.name || t("common.noClub")}
                    value={trophies(player.trophies)}
                  />
                ))}
              </RankList>
            ) : null}
          </div>

          <div>
            <SectionHeader id="home-clubs" title={t("home.topClubs")} link={<Link to="/clubs" className="brawl-chip">{t("nav.clubs")}</Link>} />
            <HomeListFeedback state={clubsState} error={clubsQuery.error} emptyTitle={t("leaderboard.empty")} />
            {clubsState === "ready" ? (
              <RankList>
                {(clubsQuery.data || []).map((club, index) => (
                  <RankRow
                    key={club.tag}
                    rank={index + 1}
                    icon={<img src={clubBadgeUrl(club.badgeId)} alt="" className="size-10 object-contain" />}
                    name={<Link to="/clubs" search={{ tag: club.tag }} className="hover:text-primary">{club.name || club.tag}</Link>}
                    detail={club.tag}
                    value={trophies(club.trophies)}
                  />
                ))}
              </RankList>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionHeader({ id, title, link }: { id: string; title: string; link?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 id={id} className="section-title">{title}</h2>
      {link ? <div className="shrink-0">{link}</div> : null}
    </div>
  );
}

/** An event slot styled after the in-game one: mode-coloured banner over the map preview. */
function EventSlot({ item }: { item: EventItem }) {
  const { t } = useI18n();
  const mode = item.event?.mode || "unknown";
  const mapId = item.event?.id;
  const color = eventModeColor(mode);

  return (
    <Link
      to={mapId ? "/maps/$mapId" : "/maps"}
      params={mapId ? { mapId: String(mapId) } : undefined}
      className="group block overflow-hidden rounded-[var(--radius-xl)] border-2 border-[var(--ink)] bg-card shadow-[0_4px_0_var(--ink)] transition-transform hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-2.5 border-b-2 border-[var(--ink)] px-3 py-2" style={{ background: color }}>
        <img src={gameModeImageUrl(eventModeId(mode))} alt="" className="size-8 drop-shadow-[0_2px_0_rgba(5,12,34,0.6)]" />
        <span className="event-slot-mode font-display text-xl text-white">{readableMode(mode)}</span>
      </div>
      <div className="flex items-center gap-3 p-3">
        {mapId ? (
          <img
            src={mapImageUrl(mapId)}
            alt=""
            loading="lazy"
            className="h-20 w-14 shrink-0 rounded-md border-2 border-[var(--ink)] bg-muted object-cover object-top"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg leading-tight">{item.event?.map || t("home.mapUnavailable")}</p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground tabular-nums">
            <Clock className="size-3.5" aria-hidden />
            {relativeEnd(item.endTime)}
          </p>
        </div>
      </div>
    </Link>
  );
}

function RankList({ children }: { children: ReactNode }) {
  return <ol className="data-surface divide-y divide-[var(--border)] overflow-hidden">{children}</ol>;
}

function RankRow({ rank, icon, name, detail, value }: {
  rank: number;
  icon: ReactNode;
  name: ReactNode;
  detail: string;
  value: string;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className={rank === 1 ? "game-rank w-6 text-xl text-primary" : "game-rank w-6 text-lg text-muted-foreground"}>{rank}</span>
      {icon}
      <div className="min-w-0 flex-1">
        <p className="game-label truncate text-lg leading-tight">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <span className="game-stat inline-flex shrink-0 items-center gap-1.5 text-lg text-primary">
        <Trophy className="size-4" aria-hidden />
        {value}
      </span>
    </li>
  );
}

function HomeListFeedback({ state, error, emptyTitle, emptyDetail }: {
  state: ListState;
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
