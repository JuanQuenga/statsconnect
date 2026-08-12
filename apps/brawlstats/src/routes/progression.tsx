import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { apiFetch, brawlerBorderUrl, collection, profileIconUrl } from "@/lib/api";
import { normalizeCatalog } from "@/lib/brawlers";
import { formatPercent, normalizeTag, trophies } from "@/lib/format";
import { aggregateMeta, buildProgression } from "@/lib/meta";
import { appPath } from "@/lib/paths";
import type { EventItem, MapListItem, MetaResearchResponse, PlayerProfile } from "@/lib/types";

type ProgressionSearch = { tag?: string };

export const Route = createFileRoute("/progression")({
  validateSearch: (search: Record<string, unknown>): ProgressionSearch => ({ tag: typeof search.tag === "string" ? search.tag : undefined }),
  component: ProgressionPage,
});

function ProgressionPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tag = search.tag ? normalizeTag(search.tag) : null;
  const [draft, setDraft] = useState(search.tag || "");
  const [showLocked, setShowLocked] = useState(false);
  const catalogQuery = useQuery({ queryKey: ["brawlers"], queryFn: () => apiFetch("/api/brawlers").then(normalizeCatalog) });
  const mapsQuery = useQuery({ queryKey: ["maps"], queryFn: () => apiFetch("/api/maps").then((payload) => collection<MapListItem>(payload)) });
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: () => apiFetch("/api/events").then((payload) => collection<EventItem>(payload)) });
  const metaQuery = useQuery({ queryKey: ["meta", "all"], queryFn: () => apiFetch<MetaResearchResponse>("/api/meta?trophyBucket=all") });
  const playerQuery = useQuery({
    queryKey: ["progression-player", tag],
    enabled: Boolean(tag),
    queryFn: () => apiFetch<{ player: PlayerProfile }>(`/api/player?tag=${encodeURIComponent(tag!)}`).then((payload) => payload.player),
  });
  const catalogMap = useMemo(() => new Map((catalogQuery.data || []).map((item) => [item.id, item])), [catalogQuery.data]);
  const mapMap = useMemo(() => new Map((mapsQuery.data || []).map((item) => [item.id, item])), [mapsQuery.data]);
  const activeMapIds = useMemo(() => new Set((eventsQuery.data || []).map((event) => event.event?.id).filter((id): id is number => typeof id === "number")), [eventsQuery.data]);
  const metaRows = useMemo(() => {
    const allStats = metaQuery.data?.stats || [];
    const liveStats = activeMapIds.size ? allStats.filter((stat) => activeMapIds.has(stat.mapId)) : [];
    return aggregateMeta(liveStats.length ? liveStats : allStats, "brawler", catalogMap, mapMap);
  }, [activeMapIds, catalogMap, mapMap, metaQuery.data]);
  const progression = useMemo(() => playerQuery.data ? buildProgression(playerQuery.data, catalogQuery.data || [], metaRows) : [], [catalogQuery.data, metaRows, playerQuery.data]);
  const owned = progression.filter((row) => row.unlocked);
  const totals = progression.reduce((result, row) => ({ points: result.points + row.pointsRemaining, powerCoins: result.powerCoins + row.powerCoinsRemaining, loadoutCoins: result.loadoutCoins + row.loadoutCoinsRemaining, completion: result.completion + row.coreCompletion }), { points: 0, powerCoins: 0, loadoutCoins: 0, completion: 0 });
  const readiness = accountReadiness(progression);
  const priorities = [...owned].filter((row) => row.pointsRemaining || row.loadoutCoinsRemaining).sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 12);
  const tableRows = [...progression].filter((row) => showLocked || row.unlocked).sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.priorityScore - a.priorityScore);
  const player = playerQuery.data;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeTag(draft);
    if (normalized) void navigate({ search: { tag: normalized } });
  };

  return (
    <div className="page-shell">
      <header>
        <p className="eyebrow">Account progression planner</p>
        <h1 className="font-display text-4xl md:text-5xl">Plan the shortest path to a stronger roster</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">Enter a player tag to estimate remaining Power Points and coins, measure collection completion, and prioritize upgrades using observed live-map performance.</p>
        <form onSubmit={submit} className="mt-5 flex max-w-xl gap-2"><Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="#PLAYER_TAG" aria-label="Player tag" /><Button type="submit">Build plan</Button></form>
      </header>

      {!tag ? <EmptyState title="Enter a player tag to build a plan" detail="The official profile exposes power levels and owned gadgets, Star Powers, and gears. It does not expose your coin or Power Point balance." /> : null}
      {tag && (playerQuery.isLoading || catalogQuery.isLoading || metaQuery.isLoading || eventsQuery.isLoading) ? <PageStatus tone="loading">Loading account, live rotation, catalog, and meta…</PageStatus> : null}
      {playerQuery.error ? <PageStatus tone="error">{playerQuery.error instanceof Error ? playerQuery.error.message : "Could not load that account."}</PageStatus> : null}

      {player ? (
        <>
          <Card className="grid items-center gap-5 p-6 py-6 md:grid-cols-[auto_1fr_auto]">
            <img src={profileIconUrl(player.icon?.id)} alt="" className="size-24 rounded-xl border border-border" />
            <div><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Live official profile</p><h2 className="font-display text-4xl">{player.name}</h2><p className="text-muted-foreground">{player.tag} · {trophies(player.trophies)} trophies</p></div>
            <div className="text-left md:text-right"><p className="font-display text-3xl text-primary">{owned.length}/{progression.length}</p><p className="text-xs text-muted-foreground">brawlers unlocked</p></div>
          </Card>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Summary label="Account readiness" value={`${readiness.grade} · ${readiness.score}`} detail="Collection, power, and core loadouts" />
            <Summary label="Core power completion" value={formatPercent(progression.length ? totals.completion / progression.length : 0)} detail="Across all released brawlers" />
            <Summary label="Power Points remaining" value={trophies(totals.points)} detail="Estimated to Power 11" />
            <Summary label="Power-up coins" value={trophies(totals.powerCoins)} detail="Estimated level upgrade cost" />
            <Summary label="Loadout coins" value={trophies(totals.loadoutCoins)} detail="1 gadget, 1 Star Power, 2 gears" />
          </section>

          <Card className="gap-0 border border-primary/40 p-5 py-5">
            <p className="font-medium text-primary">How these estimates work</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Power costs use the current level schedule (3,740 Power Points and 7,765 coins from Power 1 to 11). A competitive loadout target adds one gadget, one Star Power, and two standard gears. The readiness score weights collection coverage 40% and the average owned-brawler power/loadout completion 60%; grades are S (90+), A (80+), B (65+), C (50+), or D. It is an account-planning grade—not a fabricated player percentile. Locked brawlers are counted from Power 1. Hypercharge, Buffies, Mythic/Epic gear price differences, current balances, and random rewards are excluded because the official API does not expose enough ownership or economy data. These are planning estimates, not an inventory ledger.</p>
          </Card>

          <section>
            <div className="mb-4"><p className="eyebrow">Meta-aware order</p><h2 className="section-title">Recommended upgrades</h2><p className="mt-2 text-sm text-muted-foreground">Prioritized from observed performance on the current event rotation, current trophies, and how close each owned brawler is to key unlock levels. If live maps have no samples yet, the planner falls back to the full dataset. Samples below 25 picks receive no meta boost.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {priorities.map((row, index) => <a key={row.id} href={appPath(`/brawlers/${row.id}`)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/60"><span className="font-display text-xl text-muted-foreground">{index + 1}</span><img src={brawlerBorderUrl(row.id)} alt="" className="size-14 rounded-xl" /><span className="min-w-0 flex-1"><strong className="block">{row.name}</strong><span className="block text-xs text-muted-foreground">Power {row.power} · {row.recommendation}</span><span className="mt-1 block text-xs text-primary">{trophies(row.pointsRemaining)} PP · {trophies(row.powerCoinsRemaining + row.loadoutCoinsRemaining)} coins</span></span></a>)}
            </div>
            {!priorities.length ? <EmptyState title="Your competitive core is complete" detail="No owned brawler has a remaining core or standard-loadout estimate." /> : null}
          </section>

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Full account model</p><h2 className="section-title">Brawler-by-brawler costs</h2></div><Button size="sm" variant={showLocked ? "default" : "outline"} onClick={() => setShowLocked((value) => !value)}>{showLocked ? "Including locked" : "Owned only"}</Button></div>
            <div className="data-surface overflow-hidden">
              <Table><TableHeader><TableRow><TableHead>Brawler</TableHead><TableHead>Power</TableHead><TableHead className="text-right">Completion</TableHead><TableHead className="text-right">Power Points</TableHead><TableHead className="text-right">Power coins</TableHead><TableHead className="text-right">Loadout coins</TableHead></TableRow></TableHeader><TableBody>{tableRows.map((row) => <TableRow key={row.id}><TableCell><a href={appPath(`/brawlers/${row.id}`)} className="flex items-center gap-3 hover:text-primary"><img src={brawlerBorderUrl(row.id)} alt="" className="size-10 rounded-lg" /><span><strong className="block">{row.name}</strong><span className="text-xs text-muted-foreground">{row.unlocked ? `${trophies(row.trophies)} trophies` : "Not unlocked"}</span></span></a></TableCell><TableCell><Badge variant={row.power === 11 ? "default" : "secondary"}>{row.power}</Badge></TableCell><TableCell className="text-right">{formatPercent(row.coreCompletion)}</TableCell><TableCell className="text-right">{trophies(row.pointsRemaining)}</TableCell><TableCell className="text-right">{trophies(row.powerCoinsRemaining)}</TableCell><TableCell className="text-right">{trophies(row.loadoutCoinsRemaining)}</TableCell></TableRow>)}</TableBody></Table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value, detail }: { label: string; value: string; detail: string }) { return <Card className="gap-0 p-5 py-5"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-2 font-display text-3xl text-primary">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></Card>; }

function accountReadiness(rows: ReturnType<typeof buildProgression>) {
  if (!rows.length) return { score: 0, grade: "D" };
  const owned = rows.filter((row) => row.unlocked);
  const collectionScore = (owned.length / rows.length) * 100;
  const competitiveScore = owned.length
    ? owned.reduce((sum, row) => {
      const loadoutCompletion = Math.max(0, 100 - (row.loadoutCoinsRemaining / 5_000) * 100);
      return sum + row.coreCompletion * 0.7 + loadoutCompletion * 0.3;
    }, 0) / owned.length
    : 0;
  const score = Math.round(collectionScore * 0.4 + competitiveScore * 0.6);
  const grade = score >= 90 ? "S" : score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";
  return { score, grade };
}
