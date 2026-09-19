import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { routePath } from "@/lib/paths";
import { brawlerBorderUrl, clubBadgeUrl, profileIconUrl } from "@/lib/artwork";
import { brawlData } from "@/lib/game-data";
import { trophies } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

const regions = [
  ["Global", "global"],
  ["US", "us"],
  ["GB", "gb"],
  ["DE", "de"],
  ["FR", "fr"],
  ["BR", "br"],
  ["JP", "jp"],
  ["KR", "kr"],
] as const;

export const Route = createFileRoute("/leaderboards")({
  component: LeaderboardsPage,
});

function LeaderboardsPage() {
  const { t } = useI18n();
  const [region, setRegion] = useState("global");
  const [selectedBrawlerId, setSelectedBrawlerId] = useState<number | null>(null);

  const catalogQuery = useQuery(brawlData.brawlers());

  const brawlerId = selectedBrawlerId ?? catalogQuery.data?.[0]?.id ?? null;

  const playersQuery = useQuery(brawlData.rankingPlayers(region, 50));
  const clubsQuery = useQuery(brawlData.rankingClubs(region, 50));
  const brawlerRankingsQuery = useQuery({
    ...brawlData.rankingBrawlers(region, brawlerId, 50),
    enabled: Boolean(brawlerId),
  });

  const selectedBrawler = useMemo(
    () => catalogQuery.data?.find((item) => item.id === brawlerId),
    [catalogQuery.data, brawlerId],
  );

  const error = playersQuery.error || clubsQuery.error || catalogQuery.error;

  return (
    <div className="page-shell">
      <div className="page-intro">
        <h1 className="font-display text-4xl">{t("leaderboard.title")}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {t("leaderboard.description")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {regions.map(([label, code]) => (
          <Button
            key={code}
            size="sm"
            variant={region === code ? "default" : "outline"}
            onClick={() => setRegion(code)}
          >
            {label}
          </Button>
        ))}
      </div>

      {error ? (
        <PageStatus tone="error">{error instanceof Error ? error.message : t("leaderboard.loadFailed")}</PageStatus>
      ) : null}

      <Tabs defaultValue="players">
        <TabsList>
          <TabsTrigger value="players">{t("common.players")} ({playersQuery.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="clubs">{t("common.clubs")} ({clubsQuery.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="brawlers">{t("common.brawlers")}</TabsTrigger>
        </TabsList>

        <TabsContent value="players" className="mt-4">
          {playersQuery.isLoading ? <PageStatus tone="loading">{t("leaderboard.loadingPlayers")}</PageStatus> : null}
          <RankingTable
            rows={(playersQuery.data || []).map((player, index) => ({
              key: player.tag,
              rank: index + 1,
              icon: profileIconUrl(player.icon?.id),
              title: player.name,
              subtitle: player.club?.name || t("common.noClub"),
              href: `/players?tag=${encodeURIComponent(player.tag)}`,
              score: trophies(player.trophies),
            }))}
          />
        </TabsContent>

        <TabsContent value="clubs" className="mt-4">
          {clubsQuery.isLoading ? <PageStatus tone="loading">{t("leaderboard.loadingClubs")}</PageStatus> : null}
          <RankingTable
            rows={(clubsQuery.data || []).map((club, index) => ({
              key: club.tag,
              rank: index + 1,
              icon: clubBadgeUrl(club.badgeId),
              title: club.name,
              subtitle: `${club.tag} · ${club.memberCount || 0}/30`,
              href: `/clubs?tag=${encodeURIComponent(club.tag)}`,
              score: trophies(club.trophies),
            }))}
          />
        </TabsContent>

        <TabsContent value="brawlers" className="mt-4 space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(catalogQuery.data || []).slice(0, 40).map((brawler) => (
              <Button
                key={brawler.id}
                size="sm"
                variant={brawlerId === brawler.id ? "secondary" : "outline"}
                onClick={() => setSelectedBrawlerId(brawler.id)}
                className="shrink-0 gap-2"
              >
                <img src={brawlerBorderUrl(brawler.id)} alt="" className="size-7 rounded-md" />
                {brawler.name}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedBrawler ? `${selectedBrawler.name} · ${selectedBrawler.rarity}` : t("leaderboard.selectBrawler")}
          </p>
          {brawlerRankingsQuery.isLoading ? <PageStatus tone="loading">{t("leaderboard.loadingBrawler")}</PageStatus> : null}
          <RankingTable
            rows={(brawlerRankingsQuery.data || []).map((player, index) => ({
              key: `${player.tag}-${index}`,
              rank: index + 1,
              icon: profileIconUrl(player.icon?.id),
              title: player.name,
              subtitle: player.tag,
              href: `/players?tag=${encodeURIComponent(player.tag)}`,
              score: trophies(player.trophies),
            }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RankingTable({
  rows,
}: {
  rows: Array<{ key: string; rank: number; icon: string; title: string; subtitle: string; href: string; score: string }>;
}) {
  const { t } = useI18n();
  if (!rows.length) return <EmptyState title={t("leaderboard.empty")} />;
  return (
    <div className="data-surface overflow-hidden">
      <Table>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="game-rank w-10 px-3 text-muted-foreground">{row.rank}</TableCell>
              <TableCell className="w-12 px-0">
                <img src={row.icon} alt="" className="size-8 rounded-full object-cover" />
              </TableCell>
              <TableCell className="max-w-40 overflow-hidden sm:max-w-none">
                <a href={routePath(row.href)} className="game-label block truncate hover:text-primary">
                  {row.title}
                </a>
                <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
              </TableCell>
              <TableCell className="game-stat px-3 text-right text-primary">{row.score}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
