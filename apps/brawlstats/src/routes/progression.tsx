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
import { useI18n, type Translator } from "@/lib/i18n";
import { aggregateMeta, buildProgression } from "@/lib/meta";
import { appPath } from "@/lib/paths";
import type { EventItem, MapListItem, MetaResearchResponse, PlayerProfile } from "@/lib/types";

type ProgressionSearch = { tag?: string };

export const Route = createFileRoute("/progression")({
  validateSearch: (search: Record<string, unknown>): ProgressionSearch => ({ tag: typeof search.tag === "string" ? search.tag : undefined }),
  component: ProgressionPage,
});

function ProgressionPage() {
  const { t } = useI18n();
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
        <p className="eyebrow">{t("progression.eyebrow")}</p>
        <h1 className="font-display text-4xl md:text-5xl">{t("progression.title")}</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">{t("progression.description")}</p>
        <form onSubmit={submit} className="mt-5 flex max-w-xl gap-2"><Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="#PLAYER_TAG" aria-label={t("progression.playerTag")} /><Button type="submit">{t("progression.buildPlan")}</Button></form>
      </header>

      {!tag ? <EmptyState title={t("progression.empty")} detail={t("progression.emptyDetail")} /> : null}
      {tag && (playerQuery.isLoading || catalogQuery.isLoading || metaQuery.isLoading || eventsQuery.isLoading) ? <PageStatus tone="loading">{t("progression.loading")}</PageStatus> : null}
      {playerQuery.error ? <PageStatus tone="error">{playerQuery.error instanceof Error ? playerQuery.error.message : t("progression.loadFailed")}</PageStatus> : null}

      {player ? (
        <>
          <Card className="grid items-center gap-5 p-6 py-6 md:grid-cols-[auto_1fr_auto]">
            <img src={profileIconUrl(player.icon?.id)} alt="" className="size-24 rounded-xl border border-border" />
            <div><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("player.liveProfile")}</p><h2 className="font-display text-4xl">{player.name}</h2><p className="text-muted-foreground">{player.tag} · {t("progression.trophies", { count: trophies(player.trophies) })}</p></div>
            <div className="text-left md:text-right"><p className="font-display text-3xl text-primary">{owned.length}/{progression.length}</p><p className="text-xs text-muted-foreground">{t("progression.unlocked")}</p></div>
          </Card>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Summary label={t("progression.readiness")} value={`${readiness.grade} · ${readiness.score}`} detail={t("progression.readinessDetail")} />
            <Summary label={t("progression.coreCompletion")} value={formatPercent(progression.length ? totals.completion / progression.length : 0)} detail={t("progression.acrossReleased")} />
            <Summary label={t("progression.pointsRemaining")} value={trophies(totals.points)} detail={t("progression.estimatedPower11")} />
            <Summary label={t("progression.powerCoins")} value={trophies(totals.powerCoins)} detail={t("progression.estimatedLevelCost")} />
            <Summary label={t("progression.loadoutCoins")} value={trophies(totals.loadoutCoins)} detail={t("progression.loadoutTarget")} />
          </section>

          <Card className="gap-0 border border-primary/40 p-5 py-5">
            <p className="font-medium text-primary">{t("progression.estimatesTitle")}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("progression.estimatesDetail")}</p>
          </Card>

          <section>
            <div className="mb-4"><p className="eyebrow">{t("progression.metaAware")}</p><h2 className="section-title">{t("progression.recommended")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("progression.recommendedDetail")}</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {priorities.map((row, index) => <a key={row.id} href={appPath(`/brawlers/${row.id}`)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/60"><span className="game-rank text-xl text-muted-foreground">{index + 1}</span><img src={brawlerBorderUrl(row.id)} alt="" className="size-14 rounded-xl" /><span className="min-w-0 flex-1"><strong className="game-label block">{row.name}</strong><span className="block text-xs text-muted-foreground">{t("progression.powerRecommendation", { power: row.power, recommendation: recommendationLabel(row.recommendation, t) })}</span><span className="game-stat mt-1 block text-xs text-primary">{t("progression.resources", { points: trophies(row.pointsRemaining), coins: trophies(row.powerCoinsRemaining + row.loadoutCoinsRemaining) })}</span></span></a>)}
            </div>
            {!priorities.length ? <EmptyState title={t("progression.complete")} detail={t("progression.completeDetail")} /> : null}
          </section>

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">{t("progression.fullModel")}</p><h2 className="section-title">{t("progression.costs")}</h2></div><Button size="sm" variant={showLocked ? "default" : "outline"} onClick={() => setShowLocked((value) => !value)}>{showLocked ? t("progression.includingLocked") : t("progression.ownedOnly")}</Button></div>
            <div className="data-surface overflow-hidden">
              <Table><TableHeader><TableRow><TableHead>{t("common.brawlers")}</TableHead><TableHead>{t("progression.power")}</TableHead><TableHead className="text-right">{t("progression.completion")}</TableHead><TableHead className="text-right">{t("progression.powerPoints")}</TableHead><TableHead className="text-right">{t("progression.powerCoins")}</TableHead><TableHead className="text-right">{t("progression.loadoutCoins")}</TableHead></TableRow></TableHeader><TableBody>{tableRows.map((row) => <TableRow key={row.id}><TableCell><a href={appPath(`/brawlers/${row.id}`)} className="flex items-center gap-3 hover:text-primary"><img src={brawlerBorderUrl(row.id)} alt="" className="size-10 rounded-lg" /><span><strong className="game-label block">{row.name}</strong><span className="text-xs text-muted-foreground">{row.unlocked ? t("progression.trophies", { count: trophies(row.trophies) }) : t("progression.notUnlocked")}</span></span></a></TableCell><TableCell><Badge className="game-stat" variant={row.power === 11 ? "default" : "secondary"}>{row.power}</Badge></TableCell><TableCell className="game-stat text-right">{formatPercent(row.coreCompletion)}</TableCell><TableCell className="game-stat text-right">{trophies(row.pointsRemaining)}</TableCell><TableCell className="game-stat text-right">{trophies(row.powerCoinsRemaining)}</TableCell><TableCell className="game-stat text-right">{trophies(row.loadoutCoinsRemaining)}</TableCell></TableRow>)}</TableBody></Table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value, detail }: { label: string; value: string; detail: string }) { return <Card className="gap-0 p-5 py-5"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-2 font-display text-3xl text-primary">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></Card>; }

function recommendationLabel(value: string, t: Translator): string {
  const keys: Record<string, Parameters<Translator>[0]> = {
    "Unlock first": "progression.recommendUnlock",
    "Reach Power 7 for a gadget": "progression.recommendPower7",
    "Reach Power 9 for a Star Power": "progression.recommendPower9",
    "Finish the Power 11 upgrade": "progression.recommendPower11",
    "Complete a competitive loadout": "progression.recommendLoadout",
    "Core competitive loadout complete": "progression.recommendComplete",
  };
  const key = keys[value];
  return key ? t(key) : t("progression.recommendUnknown");
}

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
