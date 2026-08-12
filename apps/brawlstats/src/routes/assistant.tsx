import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Ban, Check, FlaskConical, RefreshCw, Share2, ShieldCheck, Sparkles, Swords, UserRound } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { apiFetch, brawlerBorderUrl, collection, gameModeImageUrl, eventModeId } from "@/lib/api";
import { normalizeCatalog } from "@/lib/brawlers";
import { normalizeTag, readableMode, trophies } from "@/lib/format";
import { shareContent } from "@/lib/share";
import type { BrawlerCatalogItem, EventItem, MapDetailResponse, MapListItem, PlayerProfile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type AssistantSearch = { tag?: string; map?: string; bucket?: string };
type DraftSide = "ally" | "enemy" | "ban";
type MatchupStat = { brawlerId: number; opponentId: number; wins: number; losses: number; picks: number; winRate: number };
type DraftMapDetail = MapDetailResponse & { matchups?: MatchupStat[] };

export const Route = createFileRoute("/assistant")({
  validateSearch: (search: Record<string, unknown>): AssistantSearch => ({
    tag: typeof search.tag === "string" ? search.tag : undefined,
    map: typeof search.map === "string" ? search.map : undefined,
    bucket: typeof search.bucket === "string" ? search.bucket : undefined,
  }),
  component: AssistantPage,
  head: () => ({ meta: [{ title: "Draft Lab · BrawlStats.io" }] }),
});

function AssistantPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [draftTag, setDraftTag] = useState(search.tag || "");
  const tag = normalizeTag(search.tag || "");
  const bucket = ["all", "0-499", "500-999", "1000+"].includes(search.bucket || "") ? search.bucket! : "all";

  const catalogQuery = useQuery({ queryKey: ["brawlers"], queryFn: () => apiFetch("/api/brawlers").then(normalizeCatalog) });
  const mapsQuery = useQuery({ queryKey: ["maps"], queryFn: () => apiFetch("/api/maps").then((payload) => collection<MapListItem>(payload)) });
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: () => apiFetch("/api/events").then((payload) => collection<EventItem>(payload)) });
  const playerQuery = useQuery({
    queryKey: ["player", tag, "assistant"],
    enabled: Boolean(tag),
    queryFn: () => apiFetch<{ player: PlayerProfile }>(`/api/player?tag=${encodeURIComponent(tag!)}`).then((payload) => payload.player),
  });

  const liveEvents = (eventsQuery.data || []).filter((item) => item.event?.id).slice(0, 8);
  const liveDetailQueries = useQueries({
    queries: liveEvents.map((event) => ({
      queryKey: ["map", String(event.event?.id), bucket, "assistant"],
      queryFn: () => apiFetch<DraftMapDetail>(`/api/maps/${event.event!.id}${bucket === "all" ? "" : `?trophyBucket=${encodeURIComponent(bucket)}`}`),
      staleTime: 5 * 60_000,
    })),
  });

  function loadPlayer(event: FormEvent) {
    event.preventDefault();
    const next = normalizeTag(draftTag);
    if (!next) return;
    navigate({ search: (current) => ({ ...current, tag: next }) });
  }

  const selectedMap = search.map || String(liveEvents[0]?.event?.id || mapsQuery.data?.find((map) => !map.disabled)?.id || "");

  return (
    <div className="page-shell">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="eyebrow">{t("assistant.eyebrow")}</p>
          <h1 className="font-display text-4xl md:text-5xl">{t("assistant.title")}</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            {t("assistant.description")}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => shareContent({ title: `BrawlStats ${t("assistant.title")}`, text: t("assistant.shareText"), url: window.location.href })}
        >
          <Share2 /> {t("assistant.shareSetup")}
        </Button>
      </div>

      <Card className="p-5 py-5">
        <form onSubmit={loadPlayer} className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="min-w-0 flex-1 text-sm">
            <span className="mb-1.5 block text-muted-foreground">{t("assistant.playerTag")}</span>
            <Input value={draftTag} onChange={(event) => setDraftTag(event.target.value)} placeholder="#PLAYER_TAG" className="h-10" />
          </label>
          <Button type="submit" className="h-10"><UserRound /> {t("assistant.loadAccount")}</Button>
          <label className="text-sm">
            <span className="mb-1.5 block text-muted-foreground">{t("assistant.trophyRange")}</span>
            <Select value={bucket} onValueChange={(value) => navigate({ search: (current) => ({ ...current, bucket: value || "all" }) })}>
              <SelectTrigger className="h-10 min-w-40"><SelectValue>{bucket === "all" ? t("common.allTrophies") : t("common.trophyRange", { range: bucket })}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.allTrophies")}</SelectItem>
                <SelectItem value="0-499">{t("common.trophyRange", { range: "0–499" })}</SelectItem>
                <SelectItem value="500-999">{t("common.trophyRange", { range: "500–999" })}</SelectItem>
                <SelectItem value="1000+">{t("common.trophyRange", { range: "1000+" })}</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </form>
        {playerQuery.isLoading ? <p className="mt-3 text-sm text-muted-foreground">{t("assistant.loadingAccount")}</p> : null}
        {playerQuery.data ? (
          <p className="mt-3 text-sm text-accent">
            {t("assistant.personalizing", { name: playerQuery.data.name, count: playerQuery.data.brawlers?.length || 0 })}
          </p>
        ) : null}
        {playerQuery.error ? <p className="mt-3 text-sm text-destructive">{playerQuery.error instanceof Error ? playerQuery.error.message : t("assistant.lookupFailed")}</p> : null}
      </Card>

      <Tabs defaultValue="now">
        <TabsList>
          <TabsTrigger value="now"><Sparkles /> {t("assistant.playNow")}</TabsTrigger>
          <TabsTrigger value="draft"><Swords /> {t("assistant.liveDraft")}</TabsTrigger>
        </TabsList>
        <TabsContent value="now" className="mt-5">
          <PlayNow
            events={liveEvents}
            details={liveDetailQueries.map((query) => query.data)}
            catalog={catalogQuery.data || []}
            player={playerQuery.data}
            loading={eventsQuery.isLoading || liveDetailQueries.some((query) => query.isLoading)}
          />
        </TabsContent>
        <TabsContent value="draft" className="mt-5">
          <DraftAssistant
            maps={mapsQuery.data || []}
            selectedMap={selectedMap}
            bucket={bucket}
            catalog={catalogQuery.data || []}
            player={playerQuery.data}
            onMapChange={(map) => navigate({ search: (current) => ({ ...current, map }) })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlayNow({
  events,
  details,
  catalog,
  player,
  loading,
}: {
  events: EventItem[];
  details: Array<DraftMapDetail | undefined>;
  catalog: BrawlerCatalogItem[];
  player?: PlayerProfile;
  loading: boolean;
}) {
  const { t } = useI18n();
  const owned = useMemo(() => new Map((player?.brawlers || []).map((brawler) => [brawler.id, brawler])), [player]);
  const catalogMap = useMemo(() => new Map(catalog.map((brawler) => [brawler.id, brawler])), [catalog]);

  if (loading && !events.length) return <PageStatus tone="loading">{t("assistant.analyzing")}</PageStatus>;
  if (!events.length) return <EmptyState title={t("assistant.noEvents")} detail={t("assistant.noEventsDetail")} />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {events.map((event, index) => {
        const detail = details[index];
        const suggestions = (detail?.stats || [])
          .filter((stat) => !player || owned.has(stat.brawlerId))
          .filter((stat) => stat.picks >= (detail?.minPicks || 25))
          .map((stat) => {
            const account = owned.get(stat.brawlerId);
            const starRate = stat.picks ? (stat.starPlayer / stat.picks) * 100 : 0;
            const readiness = account ? (Math.min(11, account.power) / 11) * 8 + (Math.min(1000, account.trophies) / 1000) * 5 : 0;
            return { ...stat, account, starRate, score: stat.winRate * 0.75 + starRate * 0.12 + readiness };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        return (
          <Card key={`${event.event?.id}-${index}`} className="overflow-hidden p-0 py-0">
            <div className="flex items-center gap-3 border-b border-border bg-secondary/45 p-4">
              <img src={gameModeImageUrl(eventModeId(event.event?.mode))} alt="" className="size-12 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{readableMode(event.event?.mode)}</p>
                <p className="truncate text-sm text-muted-foreground">{event.event?.map || t("common.unknownMap")}</p>
              </div>
              {event.event?.id ? <Link to="/maps/$mapId" params={{ mapId: String(event.event.id) }} className="text-xs text-accent hover:underline">{t("assistant.mapStats")}</Link> : null}
            </div>
            <div className="space-y-3 p-4">
              {suggestions.map((suggestion, rank) => {
                const meta = catalogMap.get(suggestion.brawlerId);
                return (
                  <div key={suggestion.brawlerId} className="flex items-center gap-3 rounded-lg border border-border bg-background/35 p-3">
                    <span className="font-display text-xl text-primary">#{rank + 1}</span>
                    <img src={brawlerBorderUrl(suggestion.brawlerId)} alt={meta?.name || t("player.brawler")} className="size-12 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{meta?.name || `${t("player.brawler")} ${suggestion.brawlerId}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {suggestion.winRate.toFixed(1)}% WR · {suggestion.useRate.toFixed(1)}% use
                        {suggestion.account ? ` · ${t("assistant.power", { power: suggestion.account.power })}` : ""}
                      </p>
                    </div>
                    <Badge variant={rank === 0 ? "default" : "secondary"}>{t("assistant.fit", { score: Math.round(suggestion.score) })}</Badge>
                  </div>
                );
              })}
              {!suggestions.length ? <p className="text-sm text-muted-foreground">{t("assistant.noSamples")}</p> : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DraftAssistant({
  maps,
  selectedMap,
  bucket,
  catalog,
  player,
  onMapChange,
}: {
  maps: MapListItem[];
  selectedMap: string;
  bucket: string;
  catalog: BrawlerCatalogItem[];
  player?: PlayerProfile;
  onMapChange: (map: string) => void;
}) {
  const { t } = useI18n();
  const [side, setSide] = useState<DraftSide>("ally");
  const [allies, setAllies] = useState<number[]>([]);
  const [enemies, setEnemies] = useState<number[]>([]);
  const [bans, setBans] = useState<number[]>([]);
  const [filter, setFilter] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(Boolean(player));
  const detailQuery = useQuery({
    queryKey: ["map", selectedMap, bucket, "draft"],
    enabled: Boolean(selectedMap),
    queryFn: () => apiFetch<DraftMapDetail>(`/api/maps/${selectedMap}${bucket === "all" ? "" : `?trophyBucket=${encodeURIComponent(bucket)}`}`),
  });
  const owned = useMemo(() => new Map((player?.brawlers || []).map((brawler) => [brawler.id, brawler])), [player]);
  const catalogMap = useMemo(() => new Map(catalog.map((brawler) => [brawler.id, brawler])), [catalog]);
  const occupied = new Set([...allies, ...enemies, ...bans]);

  const recommendations = useMemo(() => {
    const detail = detailQuery.data;
    if (!detail) return [];
    return detail.stats
      .filter((stat) => stat.picks >= detail.minPicks && !occupied.has(stat.brawlerId))
      .filter((stat) => !ownedOnly || owned.has(stat.brawlerId))
      .map((stat) => {
        const account = owned.get(stat.brawlerId);
        const starRate = stat.picks ? (stat.starPlayer / stat.picks) * 100 : 0;
        const relevantTeams = detail.teams.filter((team) => team.brawlerIds.includes(stat.brawlerId) && allies.every((ally) => team.brawlerIds.includes(ally)));
        const synergySamples = relevantTeams.reduce((sum, team) => sum + team.picks, 0);
        const synergy = synergySamples
          ? relevantTeams.reduce((sum, team) => sum + (team.winRate - 50) * team.picks, 0) / synergySamples
          : 0;
        const matchups = (detail.matchups || []).filter((row) => row.brawlerId === stat.brawlerId && enemies.includes(row.opponentId));
        const matchupSamples = matchups.reduce((sum, row) => sum + row.picks, 0);
        const counter = matchupSamples
          ? matchups.reduce((sum, row) => sum + (row.winRate - 50) * row.picks, 0) / matchupSamples
          : 0;
        const readiness = account ? (account.power / 11) * 8 + (Math.min(account.trophies, 1000) / 1000) * 4 : 0;
        const score = stat.winRate * 0.65 + starRate * 0.08 + synergy * 0.65 + counter * 0.75 + readiness;
        return { ...stat, account, starRate, synergy, synergySamples, counter, matchupSamples, score };
      })
      .sort((a, b) => b.score - a.score || b.picks - a.picks)
      .slice(0, 12);
  }, [detailQuery.data, allies, enemies, bans, owned, ownedOnly]);

  function toggle(id: number) {
    const setter = side === "ally" ? setAllies : side === "enemy" ? setEnemies : setBans;
    const current = side === "ally" ? allies : side === "enemy" ? enemies : bans;
    const max = side === "ban" ? 6 : 3;
    setter(current.includes(id) ? current.filter((value) => value !== id) : [...current, id].slice(-max));
  }

  const visibleCatalog = catalog
    .filter((brawler) => !filter || brawler.name.toLowerCase().includes(filter.toLowerCase()))
    .filter((brawler) => !ownedOnly || owned.has(brawler.id))
    .slice(0, 60);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <Select value={selectedMap} onValueChange={(value) => value && onMapChange(value)}>
          <SelectTrigger className="h-10 w-full"><SelectValue>{detailQuery.data?.map.name || t("assistant.chooseMap")}</SelectValue></SelectTrigger>
          <SelectContent>
            {maps.filter((map) => !map.disabled).map((map) => <SelectItem key={map.id} value={String(map.id)}>{map.name} · {map.gameMode?.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={ownedOnly ? "secondary" : "outline"} onClick={() => setOwnedOnly((value) => !value)} disabled={!player}>
          <ShieldCheck /> {t("assistant.ownedOnly")}
        </Button>
        <Button variant="outline" onClick={() => { setAllies([]); setEnemies([]); setBans([]); }}><RefreshCw /> {t("assistant.reset")}</Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.7fr)]">
        <Card className="p-5 py-5">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={side === "ally" ? "default" : "outline"} onClick={() => setSide("ally")}><Check /> {t("assistant.yourTeam", { count: allies.length })}</Button>
            <Button size="sm" variant={side === "enemy" ? "default" : "outline"} onClick={() => setSide("enemy")}><Swords /> {t("assistant.opponents", { count: enemies.length })}</Button>
            <Button size="sm" variant={side === "ban" ? "default" : "outline"} onClick={() => setSide("ban")}><Ban /> {t("assistant.bans", { count: bans.length })}</Button>
          </div>
          <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t("assistant.filterBrawlers")} className="mt-4" />
          <div className="mt-4 grid max-h-[500px] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6 md:grid-cols-8">
            {visibleCatalog.map((brawler) => {
              const selected = occupied.has(brawler.id);
              return (
                <button
                  type="button"
                  key={brawler.id}
                  onClick={() => selected ? (setAllies(allies.filter((id) => id !== brawler.id)), setEnemies(enemies.filter((id) => id !== brawler.id)), setBans(bans.filter((id) => id !== brawler.id))) : toggle(brawler.id)}
                  className={cn("rounded-lg border p-1 text-center transition hover:border-primary", selected ? "border-primary bg-primary/10" : "border-border bg-background/35")}
                  title={brawler.name}
                >
                  <img src={brawlerBorderUrl(brawler.id)} alt="" className="aspect-square w-full rounded-md object-cover" />
                  <span className="mt-1 block truncate text-[10px]">{brawler.name}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">{t("assistant.liveRecommendation")}</p>
              <h2 className="font-display text-2xl">{t("assistant.bestRemaining")}</h2>
            </div>
            <p className="text-xs text-muted-foreground">{detailQuery.data?.sampleSize ? t("assistant.samples", { count: trophies(detailQuery.data.sampleSize) }) : ""}</p>
          </div>
          {detailQuery.isLoading ? <PageStatus tone="loading">{t("assistant.calculating")}</PageStatus> : null}
          <div className="space-y-2">
            {recommendations.map((row, index) => {
              const meta = catalogMap.get(row.brawlerId);
              return (
                <Card key={row.brawlerId} className="flex-row items-center gap-3 p-3 py-3">
                  <span className="w-6 text-center font-display text-lg text-primary">{index + 1}</span>
                  <img src={brawlerBorderUrl(row.brawlerId)} alt="" className="size-12 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{meta?.name || `${t("player.brawler")} ${row.brawlerId}`}</p>
                      {row.account ? <Badge variant="secondary">P{row.account.power}</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("assistant.mapWin", { rate: row.winRate.toFixed(1) })} · {row.synergySamples ? t("assistant.synergy", { score: `${row.synergy >= 0 ? "+" : ""}${row.synergy.toFixed(1)}` }) : t("assistant.newTeam")}
                      {enemies.length ? ` · ${row.matchupSamples ? t("assistant.counter", { score: `${row.counter >= 0 ? "+" : ""}${row.counter.toFixed(1)}` }) : t("assistant.matchupPending")}` : ""}
                    </p>
                  </div>
                  <Badge>{Math.round(row.score)}</Badge>
                </Card>
              );
            })}
            {!detailQuery.isLoading && !recommendations.length ? <EmptyState title={t("assistant.noEligible")} detail={t("assistant.noEligibleDetail")} /> : null}
          </div>
          {enemies.length && !detailQuery.data?.matchups?.length ? (
            <p className="mt-3 text-xs text-muted-foreground">{t("assistant.counterDetail")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
