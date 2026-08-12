import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { apiFetch, brawlerBorderUrl } from "@/lib/api";
import { normalizeCatalog } from "@/lib/brawlers";
import { formatPercent, trophies } from "@/lib/format";
import { aggregateMeta, type TrophyBucket } from "@/lib/meta";
import { appPath } from "@/lib/paths";
import type { MapListItem, MetaResearchResponse } from "@/lib/types";

type BrawlersSearch = {
  q?: string;
  role?: string;
  rarity?: string;
  trophy?: TrophyBucket;
  sort?: "name" | "win" | "use" | "picks";
};

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
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const trophyBucket = search.trophy || "all";
  const catalogQuery = useQuery({ queryKey: ["brawlers"], queryFn: () => apiFetch("/api/brawlers").then(normalizeCatalog) });
  const metaQuery = useQuery({
    queryKey: ["meta", trophyBucket],
    queryFn: () => apiFetch<MetaResearchResponse>(`/api/meta?trophyBucket=${encodeURIComponent(trophyBucket)}`),
  });

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

  const update = (patch: Partial<BrawlersSearch>) => void navigate({ search: { ...search, ...patch }, replace: true });

  return (
    <div className="page-shell">
      <header>
        <p className="eyebrow">Live catalog and observed meta</p>
        <h1 className="font-display text-4xl md:text-5xl">Brawler directory</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Explore every released brawler, their complete catalog loadout, and first-party performance from sampled official battle logs.
        </p>
      </header>

      <div className="data-surface grid gap-3 p-3 md:grid-cols-2 lg:grid-cols-5">
        <Input value={search.q || ""} onChange={(event) => update({ q: event.target.value || undefined })} placeholder="Search brawlers" className="lg:col-span-2" />
        <FilterSelect label="All roles" value={search.role || "all"} options={roles} onChange={(role) => update({ role: role === "all" ? undefined : role })} />
        <FilterSelect label="All rarities" value={search.rarity || "all"} options={rarities} onChange={(rarity) => update({ rarity: rarity === "all" ? undefined : rarity })} />
        <FilterSelect label="Sort: name" value={search.sort || "name"} options={["win", "use", "picks"]} labels={{ win: "Sort: win rate", use: "Sort: use rate", picks: "Sort: samples" }} onChange={(sort) => update({ sort: sort as BrawlersSearch["sort"] })} />
        <FilterSelect label="All trophies" value={trophyBucket} options={["0-499", "500-999", "1000+"]} labels={{ "0-499": "0–499 trophies", "500-999": "500–999 trophies", "1000+": "1,000+ trophies" }} onChange={(trophy) => update({ trophy: trophy as TrophyBucket })} />
      </div>

      {catalogQuery.isLoading || metaQuery.isLoading ? <PageStatus tone="loading">Loading brawler catalog and meta…</PageStatus> : null}
      {catalogQuery.error || metaQuery.error ? <PageStatus tone="error">{String((catalogQuery.error || metaQuery.error) instanceof Error ? (catalogQuery.error || metaQuery.error)?.message : "Unable to load brawlers.")}</PageStatus> : null}

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>{rows.length} released brawlers</p>
        <p>{trophies(metaQuery.data?.sampleSize || 0)} observed picks · min 25 per published rate</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((brawler) => {
          const stat = stats.get(brawler.id);
          const eligible = (stat?.picks || 0) >= (metaQuery.data?.minPicks || 25);
          return (
            <a key={brawler.id} href={appPath(`/brawlers/${brawler.id}`)} className="group block">
              <Card className="h-full gap-0 overflow-hidden py-0 transition group-hover:ring-primary/60">
                <div className="relative aspect-[4/3] overflow-hidden" style={{ background: `linear-gradient(145deg, ${brawler.color}55, #101926 72%)` }}>
                  <img src={brawler.imageUrl || brawlerBorderUrl(brawler.id)} alt={brawler.name} className="h-full w-full object-contain transition group-hover:scale-[1.03]" loading="lazy" />
                  <Badge className="absolute top-3 left-3" style={{ background: brawler.color, color: "#08101a" }}>{brawler.rarity}</Badge>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="font-display text-2xl">{brawler.name}</h2><p className="text-xs text-muted-foreground">{brawler.role}</p></div>
                    {eligible ? <span className="text-right text-xs"><strong className="block text-primary">{formatPercent(stat?.winRate || 0)}</strong><span className="text-muted-foreground">win rate</span></span> : null}
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{brawler.description}</p>
                  <div className="mt-4 flex gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                    <span>{eligible ? `${formatPercent(stat?.useRate || 0)} use` : "Early sample"}</span>
                    <span>{trophies(stat?.picks || 0)} picks</span>
                  </div>
                </div>
              </Card>
            </a>
          );
        })}
      </div>
      {!rows.length && !catalogQuery.isLoading ? <EmptyState title="No brawlers match these filters" /> : null}
    </div>
  );
}

function FilterSelect({ label, value, options, labels = {}, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next || "all")}>
      <SelectTrigger className="h-9 w-full"><SelectValue>{value === "all" || value === "name" ? label : labels[value] || value}</SelectValue></SelectTrigger>
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
