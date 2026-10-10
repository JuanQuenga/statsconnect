import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { BoardRow, BoardSortKey, SortDirection } from "@/lib/meta-board";
import { cn } from "@/lib/utils";
import { BrawlerPortrait, brawlerName, signed, TierBadge, type MetaLookups } from "./shared";

const PAGE = 100;

type Column = { key: BoardSortKey; label: string; className?: string };

export function MetaLeaderboard({ rows, lookups, sort, dir, query, selected, onSort, onQuery, onSelect }: {
  rows: BoardRow[];
  lookups: MetaLookups;
  sort: BoardSortKey;
  dir: SortDirection;
  query: string;
  selected?: number;
  onSort: (key: BoardSortKey) => void;
  onQuery: (value: string) => void;
  onSelect: (id: number) => void;
}) {
  const { t, number } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const needle = query.trim().toLowerCase();
  const filtered = needle ? rows.filter((row) => brawlerName(lookups, row.brawlerId).toLowerCase().includes(needle)) : rows;
  const visible = expanded ? filtered : filtered.slice(0, PAGE);
  const maxScore = Math.max(1, ...rows.map((row) => row.score));
  const maxUse = Math.max(0.01, ...rows.map((row) => row.useRate));
  const columns: Column[] = [
    { key: "score", label: t("meta.score") },
    { key: "win", label: t("meta.winRate") },
    { key: "use", label: t("meta.useRate"), className: "hidden sm:table-cell" },
    { key: "delta", label: t("meta.useDelta"), className: "hidden sm:table-cell" },
    { key: "star", label: t("meta.starShort"), className: "hidden md:table-cell" },
    { key: "picks", label: t("meta.picks"), className: "hidden md:table-cell" },
  ];
  // Rank always reflects score order, whatever the visible sort.
  const rank = new Map([...rows].sort((a, b) => b.score - a.score).map((row, index) => [row.brawlerId, index + 1]));

  return (
    <div>
      <label className="relative mb-3 block max-w-xs">
        <span className="sr-only">{t("meta.searchBrawlers")}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t("meta.searchBrawlers")} className="h-10 pl-9" />
      </label>
      <div className="overflow-hidden rounded-xl border border-border bg-background/40">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead>{t("meta.brawler")}</TableHead>
              {columns.map((column) => {
                const active = sort === column.key;
                const Icon = !active ? ArrowUpDown : dir === "desc" ? ArrowDown : ArrowUp;
                return (
                  <TableHead key={column.key} aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : "none"} className={cn("text-right", column.className)}>
                    <button
                      type="button"
                      onClick={() => onSort(column.key)}
                      aria-label={t("meta.sortBy", { column: column.label })}
                      className={cn("ml-auto inline-flex items-center gap-1 rounded px-1 py-0.5 text-right font-semibold outline-none max-sm:leading-tight sm:whitespace-nowrap hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", active ? "text-primary" : "text-muted-foreground")}
                    >
                      {column.label}
                      <Icon className={cn("size-3.5", !active && "opacity-50")} aria-hidden />
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const name = brawlerName(lookups, row.brawlerId);
              return (
                <TableRow
                  key={row.brawlerId}
                  onClick={() => onSelect(row.brawlerId)}
                  data-state={selected === row.brawlerId ? "selected" : undefined}
                  className={cn("cursor-pointer", !row.qualified && "opacity-55")}
                >
                  <TableCell className="game-rank text-center text-muted-foreground">{rank.get(row.brawlerId)}</TableCell>
                  <TableCell className="max-sm:whitespace-normal">
                    <button type="button" onClick={(event) => { event.stopPropagation(); onSelect(row.brawlerId); }} className="flex items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3">
                      <BrawlerPortrait id={row.brawlerId} name="" className="size-9" />
                      <span className="min-w-0">
                        <span className="block font-semibold max-sm:leading-tight sm:truncate">{name}</span>
                        {!row.qualified ? <span className="block text-[0.6875rem] text-muted-foreground">{t("meta.lowSample")}</span> : null}
                      </span>
                      <TierBadge tier={row.tier} className="ml-1 hidden sm:inline-grid" />
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="game-stat text-primary">{row.score.toFixed(1)}</span>
                    <Bar value={row.score / maxScore} className="bg-primary" />
                  </TableCell>
                  <TableCell className={cn("game-stat text-right", row.winRate >= 50 ? "text-foreground" : "text-muted-foreground")}>{formatPercent(row.winRate)}</TableCell>
                  <TableCell className="hidden text-right sm:table-cell">
                    <span className="game-stat">{formatPercent(row.useRate, 2)}</span>
                    <Bar value={row.useRate / maxUse} className="bg-chart-3" />
                  </TableCell>
                  <TableCell className={cn("game-stat hidden text-right sm:table-cell", row.useDelta === null ? "text-muted-foreground" : row.useDelta >= 0 ? "text-accent" : "text-destructive")}>
                    {row.useDelta === null ? "—" : signed(row.useDelta)}
                  </TableCell>
                  <TableCell className="game-stat hidden text-right md:table-cell">{formatPercent(row.starRate)}</TableCell>
                  <TableCell className="game-stat hidden text-right md:table-cell">{number(row.picks)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!visible.length ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("meta.noMatches", { query })}</p> : null}
      </div>
      {filtered.length > PAGE ? (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" size="lg" onClick={() => setExpanded((value) => !value)}>
            {expanded ? t("meta.showTop", { count: PAGE }) : t("meta.showAll", { count: filtered.length })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Bar({ value, className }: { value: number; className: string }) {
  return (
    <span aria-hidden className="mt-1 ml-auto block h-1 w-12 overflow-hidden rounded-full bg-secondary sm:w-20">
      <span className={cn("block h-full rounded-full", className)} style={{ width: `${Math.max(3, Math.min(1, value) * 100)}%` }} />
    </span>
  );
}

export function MetaLeaderboardSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-64" />
      {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}
    </div>
  );
}
