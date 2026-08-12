import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PlayerSearch as PlayerSearchBox } from "@/components/PlayerSearch";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { apiFetch, brawlerBorderUrl, collection, profileIconUrl } from "@/lib/api";
import { normalizeCatalog } from "@/lib/brawlers";
import { normalizeTag, readableMode, trophies } from "@/lib/format";
import type { BattleLogItem, PlayerProfile, PlayerSearchResponse, PlayerSnapshot } from "@/lib/types";

type PlayerSearch = { tag?: string; q?: string };

export const Route = createFileRoute("/players")({
  validateSearch: (search: Record<string, unknown>): PlayerSearch => ({
    tag: typeof search.tag === "string" ? search.tag : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: PlayersPage,
});

function PlayersPage() {
  const { tag: rawTag, q: rawQuery } = Route.useSearch();
  const tag = rawTag ? normalizeTag(rawTag) : null;
  const nameQuery = rawQuery?.trim() || "";

  const playerQuery = useQuery({
    queryKey: ["player", tag],
    enabled: Boolean(tag),
    queryFn: async () => {
      const payload = await apiFetch<{ player: PlayerProfile; battleLog: { items?: BattleLogItem[] } }>(
        `/api/player?tag=${encodeURIComponent(tag!)}`,
      );
      return {
        player: payload.player,
        battles: collection<BattleLogItem>(payload.battleLog),
      };
    },
  });

  const directoryQuery = useQuery({
    queryKey: ["player-search-page", nameQuery],
    enabled: !tag && nameQuery.length >= 2,
    queryFn: () => apiFetch<PlayerSearchResponse>(`/api/player-search?q=${encodeURIComponent(nameQuery)}&limit=25`),
  });

  const historyQuery = useQuery({
    queryKey: ["player-history", tag, playerQuery.dataUpdatedAt],
    enabled: Boolean(tag && playerQuery.data),
    queryFn: () =>
      apiFetch<{ snapshots: PlayerSnapshot[] }>(`/api/player-history?tag=${encodeURIComponent(tag!)}`).then(
        (payload) => payload.snapshots,
      ),
  });

  const catalogQuery = useQuery({
    queryKey: ["brawlers"],
    queryFn: () => apiFetch("/api/brawlers").then(normalizeCatalog),
    enabled: Boolean(tag),
  });

  const player = playerQuery.data?.player;
  const battles = playerQuery.data?.battles || [];
  const history = [...(historyQuery.data || [])].sort((a, b) => a.day - b.day);
  const catalog = new Map((catalogQuery.data || []).map((item) => [item.id, item]));
  const brawlers = [...(player?.brawlers || [])].sort((a, b) => b.trophies - a.trophies);

  const modeCounts = new Map<string, number>();
  for (const item of battles) {
    const mode = readableMode(item.event?.mode || item.battle?.mode);
    modeCounts.set(mode, (modeCounts.get(mode) || 0) + 1);
  }
  const topModes = [...modeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const maxMode = topModes[0]?.[1] || 1;

  return (
    <div className="page-shell">
      <div>
        <p className="eyebrow">Player profile</p>
        <h1 className="font-display text-4xl">Find any tracked player</h1>
        <PlayerSearchBox initialValue={rawTag || nameQuery} className="mt-4 max-w-lg" buttonLabel="Find" />
      </div>

      {!tag && !nameQuery ? (
        <EmptyState title="Search by player name or tag" detail="Names come from rankings, club rosters, profiles, and crawled battles." />
      ) : null}
      {!tag && nameQuery && directoryQuery.isLoading ? <PageStatus tone="loading">Searching tracked players…</PageStatus> : null}
      {!tag && directoryQuery.error ? (
        <PageStatus tone="error">
          {directoryQuery.error instanceof Error ? directoryQuery.error.message : "Player search failed."}
        </PageStatus>
      ) : null}
      {!tag && directoryQuery.data ? <PlayerResults query={nameQuery} results={directoryQuery.data} /> : null}
      {tag && playerQuery.isLoading ? <PageStatus tone="loading">Loading player profile…</PageStatus> : null}
      {playerQuery.error ? (
        <PageStatus tone="error">{playerQuery.error instanceof Error ? playerQuery.error.message : "Failed to load player."}</PageStatus>
      ) : null}

      {player ? (
        <>
          <Card className="grid gap-6 p-6 py-6 md:grid-cols-[auto_1fr]">
            <img src={profileIconUrl(player.icon?.id)} alt="" className="size-24 rounded-xl border border-border" />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Live player profile</p>
              <h2 className="font-display text-4xl">{player.name}</h2>
              <p className="text-muted-foreground">{player.tag}</p>
              <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-4">
                {[
                  ["Trophies", trophies(player.trophies)],
                  ["Highest", trophies(player.highestTrophies)],
                  ["3v3 wins", trophies(player["3vs3Victories"] || 0)],
                  ["Solo wins", trophies(player.soloVictories || 0)],
                ].map(([label, value]) => (
                  <div key={label} className="border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-display text-2xl text-primary">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Level {player.expLevel} · {trophies(player.expPoints)} lifetime XP
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-accent" style={{ width: `${Math.min(100, player.expPoints % 100)}%` }} />
                </div>
              </div>
              {player.club?.tag ? (
                <Link
                  to="/clubs"
                  search={{ tag: player.club.tag }}
                  className="mt-4 inline-flex items-center gap-2 text-sm text-accent hover:underline"
                >
                  Club: {player.club.name || player.club.tag}
                </Link>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">Not in a club</p>
              )}
            </div>
          </Card>

          {history.length ? <PlayerHistory snapshots={history} /> : null}

          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 font-display text-2xl">Recent battles</h3>
              <div className="space-y-2">
                {battles.slice(0, 8).map((item, index) => {
                  const change = Number(item.battle?.trophyChange);
                  const changeLabel = Number.isFinite(change)
                    ? ` · ${change > 0 ? "+" : ""}${change} trophies`
                    : "";
                  return (
                    <div key={`${item.battleTime}-${index}`} className="data-surface px-4 py-3">
                      <p className="font-medium">{readableMode(item.event?.mode || item.battle?.mode)}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.event?.map || "Unknown map"} ·{" "}
                        {item.battle?.result ||
                          (item.battle?.rank ? `Rank ${item.battle.rank}` : item.battle?.type || "Completed")}
                        {changeLabel}
                      </p>
                    </div>
                  );
                })}
                {!battles.length ? <EmptyState title="No recent battles" /> : null}
              </div>
            </div>
            <div>
              <h3 className="mb-3 font-display text-2xl">Mode mix</h3>
              <div className="space-y-3">
                {topModes.map(([mode, count]) => (
                  <div key={mode}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{mode}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((count / maxMode) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                {!topModes.length ? <EmptyState title="No modes available" /> : null}
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-4 font-display text-2xl">Brawler roster</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {brawlers.map((item) => {
                const meta = catalog.get(item.id);
                return (
                  <Card key={item.id} className="gap-0 overflow-hidden py-0">
                    <div className="relative">
                      <img src={brawlerBorderUrl(item.id)} alt={item.name} className="aspect-square w-full object-cover" />
                      <Badge className="absolute top-2 right-2">{item.power}</Badge>
                    </div>
                    <div className="space-y-1 p-3">
                      <h4 className="font-display text-lg">{item.name}</h4>
                      <p className="text-xs text-muted-foreground">{meta?.rarity || "Brawler"}</p>
                      <p className="font-display text-sm text-primary">{trophies(item.trophies)} trophies</p>
                      <p className="text-xs text-muted-foreground">
                        Rank {item.rank} · Best {trophies(item.highestTrophies || item.trophies)}
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function PlayerResults({ query, results }: { query: string; results: PlayerSearchResponse }) {
  if (!results.players.length) {
    return (
      <EmptyState
        title={`No tracked players named “${query}”`}
        detail="Try an exact #tag. Every lookup is added to the directory for future name searches."
      />
    );
  }

  return (
    <section>
      <p className="text-xs uppercase tracking-[0.2em] text-accent">Tracked directory</p>
      <h2 className="font-display text-3xl">Players matching “{query}”</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {results.players.map((player) => (
          <Link
            key={player.tag}
            to="/players"
            search={{ tag: `#${player.tag}` }}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-accent/60"
          >
            <img src={profileIconUrl(player.iconId)} alt="" className="size-12 rounded-xl" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display">{player.name}</span>
              <span className="block text-xs text-muted-foreground">#{player.tag} · {player.clubName || "No tracked club"}</span>
            </span>
            {typeof player.trophies === "number" ? (
              <span className="font-display text-sm text-primary">{trophies(player.trophies)}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

function PlayerHistory({ snapshots }: { snapshots: PlayerSnapshot[] }) {
  const first = snapshots[0];
  const latest = snapshots[snapshots.length - 1];
  const min = Math.min(...snapshots.map((snapshot) => snapshot.trophies));
  const max = Math.max(...snapshots.map((snapshot) => snapshot.trophies));
  const range = Math.max(1, max - min);
  const change = latest.trophies - first.trophies;

  return (
    <Card className="gap-0 p-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent">Continuously tracked</p>
          <h3 className="font-display text-2xl">Trophy history</h3>
        </div>
        <p className={`font-display ${change >= 0 ? "text-primary" : "text-destructive"}`}>
          {change > 0 ? "+" : ""}{trophies(change)} since first snapshot
        </p>
      </div>
      <div className="mt-5 flex h-40 items-end gap-1 rounded-lg bg-secondary/60 p-4" aria-label="Daily trophy history">
        {snapshots.slice(-60).map((snapshot) => {
          const height = 18 + ((snapshot.trophies - min) / range) * 82;
          return (
            <div
              key={snapshot.day}
              title={`${snapshot.day}: ${trophies(snapshot.trophies)} trophies`}
              className="min-w-1 flex-1 rounded-t-sm bg-primary/75 transition hover:bg-primary"
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {[
          ["Tracked days", snapshots.length],
          ["Current trophies", trophies(latest.trophies)],
          ["Highest recorded", trophies(max)],
          ["Power 11 brawlers", latest.power11Count],
        ].map(([label, value]) => (
          <div key={label} className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-display text-xl text-primary">{value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
