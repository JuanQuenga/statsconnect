import type {
  BrawlerCatalogItem,
  BrawlerMapStat,
  MapListItem,
  PlayerProfile,
} from "@/lib/types";

export type TrophyBucket = "all" | "0-499" | "500-999" | "1000+";

export type AggregatedMetaRow = {
  key: string;
  label: string;
  brawlerId?: number;
  mapId?: number;
  wins: number;
  losses: number;
  picks: number;
  starPlayer: number;
  winRate: number;
  useRate: number;
  starRate: number;
};

export function aggregateMeta(
  stats: BrawlerMapStat[],
  grouping: "brawler" | "map" | "mode",
  catalog: Map<number, BrawlerCatalogItem>,
  maps: Map<number, MapListItem>,
): AggregatedMetaRow[] {
  const rows = new Map<string, Omit<AggregatedMetaRow, "winRate" | "useRate" | "starRate">>();
  for (const stat of stats) {
    const map = maps.get(stat.mapId);
    const key = grouping === "brawler" ? String(stat.brawlerId) : grouping === "map" ? String(stat.mapId) : String(map?.gameMode?.id || "unknown");
    const label = grouping === "brawler"
      ? catalog.get(stat.brawlerId)?.name || `Brawler ${stat.brawlerId}`
      : grouping === "map"
        ? map?.name || `Map ${stat.mapId}`
        : map?.gameMode?.name || "Unknown mode";
    const row = rows.get(key) || {
      key,
      label,
      brawlerId: grouping === "brawler" ? stat.brawlerId : undefined,
      mapId: grouping === "map" ? stat.mapId : undefined,
      wins: 0,
      losses: 0,
      picks: 0,
      starPlayer: 0,
    };
    row.wins += stat.wins;
    row.losses += stat.losses;
    row.picks += stat.picks;
    row.starPlayer += stat.starPlayer;
    rows.set(key, row);
  }
  const sample = [...rows.values()].reduce((sum, row) => sum + row.picks, 0);
  return [...rows.values()].map((row) => {
    const decided = row.wins + row.losses;
    return {
      ...row,
      winRate: decided ? (row.wins / decided) * 100 : 0,
      useRate: sample ? (row.picks / sample) * 100 : 0,
      starRate: row.picks ? (row.starPlayer / row.picks) * 100 : 0,
    };
  });
}

const POWER_COSTS = [
  { power: 2, points: 20, coins: 20 },
  { power: 3, points: 30, coins: 35 },
  { power: 4, points: 50, coins: 75 },
  { power: 5, points: 80, coins: 140 },
  { power: 6, points: 130, coins: 290 },
  { power: 7, points: 210, coins: 480 },
  { power: 8, points: 340, coins: 800 },
  { power: 9, points: 550, coins: 1_250 },
  { power: 10, points: 890, coins: 1_875 },
  { power: 11, points: 1_440, coins: 2_800 },
] as const;

export type ProgressionRow = {
  id: number;
  name: string;
  power: number;
  trophies: number;
  unlocked: boolean;
  pointsRemaining: number;
  powerCoinsRemaining: number;
  loadoutCoinsRemaining: number;
  coreCompletion: number;
  priorityScore: number;
  recommendation: string;
};

export function buildProgression(
  player: PlayerProfile,
  catalog: BrawlerCatalogItem[],
  metaRows: AggregatedMetaRow[],
): ProgressionRow[] {
  const owned = new Map((player.brawlers || []).map((item) => [item.id, item]));
  const meta = new Map(metaRows.filter((row) => row.brawlerId).map((row) => [row.brawlerId!, row]));
  const totalPoints = POWER_COSTS.reduce((sum, step) => sum + step.points, 0);
  return catalog.map((item) => {
    const brawler = owned.get(item.id);
    const power = brawler?.power || 1;
    const remainingSteps = POWER_COSTS.filter((step) => step.power > power);
    const pointsRemaining = remainingSteps.reduce((sum, step) => sum + step.points, 0);
    const powerCoinsRemaining = remainingSteps.reduce((sum, step) => sum + step.coins, 0);
    const gadgetTarget = power >= 7 ? Math.max(0, 1 - (brawler?.gadgets?.length || 0)) : 1;
    const starTarget = power >= 9 ? Math.max(0, 1 - (brawler?.starPowers?.length || 0)) : 1;
    const gearTarget = power >= 8 ? Math.max(0, 2 - (brawler?.gears?.length || 0)) : 2;
    const loadoutCoinsRemaining = gadgetTarget * 1_000 + starTarget * 2_000 + gearTarget * 1_000;
    const performance = meta.get(item.id);
    const metaScore = performance && performance.picks >= 25
      ? Math.max(0, performance.winRate - 45) * 5 + Math.min(performance.useRate, 10) * 2
      : 0;
    const nearMaxBonus = brawler ? power * 2 : -20;
    const priorityScore = metaScore + nearMaxBonus + Math.min(brawler?.trophies || 0, 1_000) / 100;
    return {
      id: item.id,
      name: item.name,
      power,
      trophies: brawler?.trophies || 0,
      unlocked: Boolean(brawler),
      pointsRemaining,
      powerCoinsRemaining,
      loadoutCoinsRemaining,
      coreCompletion: ((totalPoints - pointsRemaining) / totalPoints) * 100,
      priorityScore,
      recommendation: !brawler
        ? "Unlock first"
        : power < 7
          ? "Reach Power 7 for a gadget"
          : power < 9
            ? "Reach Power 9 for a Star Power"
            : power < 11
              ? "Finish the Power 11 upgrade"
              : loadoutCoinsRemaining
                ? "Complete a competitive loadout"
                : "Core competitive loadout complete",
    };
  });
}
