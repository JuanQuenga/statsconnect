import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { brawlerBorderUrl } from "@/lib/artwork";
import { brawlData } from "@/lib/game-data";
import { formatPercent, trophies } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { aggregateMeta, type TrophyBucket } from "@/lib/meta";
import { appPath } from "@/lib/paths";

type BrawlersSearch = {
  q?: string;
  role?: string;
  rarity?: string;
  trophy?: TrophyBucket;
  sort?: "name" | "win" | "use" | "picks";
};
const brawlerPageSize = 48;

export const Route = createFileRoute("/brawlers/")({
  validateSearch: (search: Record<string, unknown>): BrawlersSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    role: typeof search.role === "string" ? search.role : undefined,
    rarity: typeof search.rarity === "string" ? search.rarity : undefined,
    trophy: isTrophyBucket(search.trophy) ? search.trophy : undefined,
    sort: search.sort === "win" || search.sort === "use" || search.sort === "picks" || search.sort === "name" ? search.sort : undefined,
  }),
  component: BrawlersPage,
});

function BrawlersPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const trophyBucket = search.trophy || "all";
  const [visibleCount, setVisibleCount] = useState(brawlerPageSize);
  const catalogQuery = useQuery(brawlData.brawlers());
  const metaQuery = useQuery(brawlData.meta(trophyBucket));

  const roles = useMemo(() => [...new Set((catalogQuery.data || []).map((item) => item.role))].sort(), [catalogQuery.data]);
  const rarities = useMemo(() => [...new Set((catalogQuery.data || []).map((item) => item.rarity))].sort(), [catalogQuery.data]);
  const stats = useMemo(() => {
    const catalog = new Map((catalogQuery.data || []).map((item) => [item.id, item]));
    return new Map(aggregateMeta(metaQuery.data?.stats || [], "brawler", catalog, new Map()).map((item) => [item.brawlerId, item]));
  }, [catalogQuery.data, metaQuery.data]);
  const rows = useMemo(() => {
    const q = (search.q || "").trim().toLowerCase();
    const filtered = (catalogQuery.data || []).filter((item) => {
      if (q && !`${item.name} ${item.description}`.toLowerCase().includes(q)) return false;
      if (search.role && search.role !== "all" && item.role !== search.role) return false;
      if (search.rarity && search.rarity !== "all" && item.rarity !== search.rarity) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const aStat = stats.get(a.id);
      const bStat = stats.get(b.id);
      if (search.sort === "win") return (bStat?.winRate || 0) - (aStat?.winRate || 0) || a.name.localeCompare(b.name);
      if (search.sort === "use") return (bStat?.useRate || 0) - (aStat?.useRate || 0) || a.name.localeCompare(b.name);
      if (search.sort === "picks") return (bStat?.picks || 0) - (aStat?.picks || 0) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [catalogQuery.data, search, stats]);
  useEffect(
    () => setVisibleCount(brawlerPageSize),
    [search.q, search.rarity, search.role, search.sort, search.trophy],
  );
  const visibleRows = rows.slice(0, visibleCount);

  const update = (patch: Partial<BrawlersSearch>) => void navigate({ search: { ...search, ...patch }, replace: true });

  return (
    <div className="page-shell">
      <header className="page-intro">
        <h1 className="font-display text-4xl md:text-5xl">{t("brawlers.title")}</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          {t("brawlers.description")}
        </p>
      </header>

      <div className="data-surface grid gap-3 p-3 md:grid-cols-2 lg:grid-cols-5">
        <Input value={search.q || ""} onChange={(event) => update({ q: event.target.value || undefined })} placeholder={t("brawlers.search")} aria-label={t("brawlers.search")} className="lg:col-span-2" />
        <FilterSelect label={t("brawlers.allRoles")} value={search.role || "all"} options={roles} onChange={(role) => update({ role: role === "all" ? undefined : role })} />
        <FilterSelect label={t("brawlers.allRarities")} value={search.rarity || "all"} options={rarities} onChange={(rarity) => update({ rarity: rarity === "all" ? undefined : rarity })} />
        <FilterSelect label={t("brawlers.sortName")} value={search.sort || "name"} options={["win", "use", "picks"]} labels={{ win: t("brawlers.sortWin"), use: t("brawlers.sortUse"), picks: t("brawlers.sortSamples") }} onChange={(sort) => update({ sort: sort as BrawlersSearch["sort"] })} />
        <FilterSelect label={t("common.allTrophies")} value={trophyBucket} options={["0-499", "500-999", "1000+"]} labels={{ "0-499": t("common.trophyRange", { range: "0–499" }), "500-999": t("common.trophyRange", { range: "500–999" }), "1000+": t("common.trophyRange", { range: "1,000+" }) }} onChange={(trophy) => update({ trophy: trophy as TrophyBucket })} />
      </div>

      {catalogQuery.isLoading || metaQuery.isLoading ? <PageStatus tone="loading">{t("brawlers.loading")}</PageStatus> : null}
      {catalogQuery.error || metaQuery.error ? <PageStatus tone="error">{(catalogQuery.error || metaQuery.error) instanceof Error ? (catalogQuery.error || metaQuery.error)?.message : t("brawlers.loadFailed")}</PageStatus> : null}

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>{t("brawlers.released", { count: rows.length })}</p>
        <p>{t("brawlers.observed", { samples: trophies(metaQuery.data?.sampleSize || 0), minimum: metaQuery.data?.minPicks || 25 })}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {visibleRows.map((brawler) => {
          const stat = stats.get(brawler.id);
          const eligible = (stat?.picks || 0) >= (metaQuery.data?.minPicks || 25);
          return (
            <a key={brawler.id} href={appPath(`/brawlers/${brawler.id}`)} className="group block">
              <Card className="h-full gap-0 overflow-hidden py-0 transition group-hover:ring-primary/60">
                <div className="relative aspect-[4/3] overflow-hidden" style={{ background: `linear-gradient(145deg, ${brawler.color}55, #101926 72%)` }}>
                  <img src={brawler.imageUrl || brawlerBorderUrl(brawler.id)} alt={brawler.name} className="h-full w-full object-contain transition group-hover:scale-[1.03]" loading="lazy" />
                  <Badge className="absolute top-3 left-3" style={{ background: brawler.color, color: "#08101a" }}>{brawler.rarity}</Badge>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="font-display text-xl sm:text-2xl">{brawler.name}</h2><p className="text-xs text-muted-foreground">{brawler.role}</p></div>
                    {eligible ? <span className="text-right text-xs"><strong className="block text-primary">{formatPercent(stat?.winRate || 0)}</strong><span className="text-muted-foreground">{t("meta.winRate")}</span></span> : null}
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{brawler.description}</p>
                  <div className="mt-4 flex gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                    <span>{eligible ? t("brawlers.use", { rate: formatPercent(stat?.useRate || 0) }) : t("brawlers.earlySample")}</span>
                    <span>{t("brawlers.picks", { count: trophies(stat?.picks || 0) })}</span>
                  </div>
                </div>
              </Card>
            </a>
          );
        })}
      </div>
      {visibleRows.length < rows.length ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => setVisibleCount((count) => count + brawlerPageSize)}>
            {t("common.load")} {Math.min(brawlerPageSize, rows.length - visibleRows.length)} {t("common.brawlers").toLocaleLowerCase()}
          </Button>
        </div>
      ) : null}
      {!rows.length && !catalogQuery.isLoading ? <EmptyState title={t("brawlers.noMatches")} /> : null}
    </div>
  );
}

function FilterSelect({ label, value, options, labels = {}, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next || "all")}>
      <SelectTrigger className="h-9 w-full" aria-label={label}><SelectValue>{value === "all" || value === "name" ? label : labels[value] || value}</SelectValue></SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectItem value={value === "name" ? "name" : "all"}>{label}</SelectItem>
        {options.map((option) => <SelectItem key={option} value={option}>{labels[option] || option}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function isTrophyBucket(value: unknown): value is TrophyBucket {
  return value === "all" || value === "0-499" || value === "500-999" || value === "1000+";
}
