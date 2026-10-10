/**
 * Canonical public routes for the Hub and each Game Site.
 *
 * Single source for per-host sitemap generation (`scripts/seo-files.ts`), the
 * crawler-facing shell document (`server/site-pages.ts`), and the vercel.json
 * rewrite audit (`scripts/seo-files.test.ts`). Keep this module import-free so
 * build tooling can load it without path aliases.
 */

export type SiteId = "bs" | "cr" | "hub";

export type StaticRoute = Readonly<{
  description: string;
  path: string;
  title: string;
}>;

export const siteOrigins = {
  bs: "https://bs.statsconnect.app",
  cr: "https://cr.statsconnect.app",
  hub: "https://statsconnect.app",
} as const satisfies Record<SiteId, `https://${string}`>;

export function siteOrigin(site: SiteId): string {
  return siteOrigins[site];
}

export const hubRoutes: readonly StaticRoute[] = [
  {
    path: "/",
    title: "StatsConnect — Clash Royale & Brawl Stars player statistics",
    description:
      "Player lookup, leaderboards, live meta reports, decks, and battle history for Clash Royale and Brawl Stars, together in one hub.",
  },
  {
    path: "/connect",
    title: "Connect a player profile · StatsConnect",
    description:
      "Link a Clash Royale or Brawl Stars player tag to bring your stats, battles, and progress into your StatsConnect home.",
  },
  {
    path: "/connect/clash-royale",
    title: "Connect a Clash Royale player · StatsConnect",
    description:
      "Enter your Clash Royale player tag to connect your profile and follow your trophies, deck, and battle log.",
  },
  {
    path: "/connect/brawl-stars",
    title: "Connect a Brawl Stars player · StatsConnect",
    description:
      "Enter your Brawl Stars player tag to connect your profile and follow your trophies and brawler roster.",
  },
  {
    path: "/games/clash-royale",
    title: "Clash Royale statistics · StatsConnect",
    description:
      "Clash Royale leaderboards, the live meta report, decks, cards, clans, and news.",
  },
  {
    path: "/games/brawl-stars",
    title: "Brawl Stars statistics · StatsConnect",
    description:
      "Brawl Stars player and club lookup, leaderboards, maps and events, and your saved profiles.",
  },
  {
    path: "/privacy",
    title: "Privacy · StatsConnect",
    description: "What StatsConnect collects, what it stores, and the outside services it uses.",
  },
  {
    path: "/about",
    title: "About StatsConnect",
    description:
      "Who builds StatsConnect, where the statistics come from, and how the project is supported.",
  },
  {
    path: "/data-methodology",
    title: "Data & methodology · StatsConnect",
    description:
      "Where StatsConnect statistics come from: official game APIs, community data sources, and battle-log aggregation.",
  },
  {
    path: "/faq",
    title: "Frequently asked questions · StatsConnect",
    description:
      "Finding your player tags, how often statistics refresh, what accounts do, and how to remove your data.",
  },
  {
    path: "/contact",
    title: "Contact · StatsConnect",
    description: "Reach the StatsConnect developer for feedback, corrections, and data requests.",
  },
  {
    path: "/terms",
    title: "Terms of Service · StatsConnect",
    description: "The plain-language terms for using StatsConnect.",
  },
];

export const clashRoutes: readonly StaticRoute[] = [
  {
    path: "/",
    title: "Clash Royale statistics · StatsConnect",
    description:
      "Clash Royale leaderboards, the live meta report with win rates and sample sizes, deck tools, cards, clans, and news.",
  },
  {
    path: "/leaderboards",
    title: "Clash Royale leaderboards · StatsConnect",
    description:
      "Live global and regional Clash Royale rankings for players, clans, and clan wars, with real historical movement.",
  },
  {
    path: "/meta",
    title: "Clash Royale meta report · StatsConnect",
    description:
      "The current Clash Royale meta: top decks and cards by usage and win rate, aggregated from recent public battle logs with published sample sizes.",
  },
  {
    path: "/players",
    title: "Clash Royale player lookup · StatsConnect",
    description: "Look up any Clash Royale player by tag: trophies, current deck, battle log, and card levels.",
  },
  {
    path: "/cards",
    title: "Clash Royale card library · StatsConnect",
    description: "Browse every Clash Royale card with elixir cost, rarity, and arena details.",
  },
  {
    path: "/decks",
    title: "Best Clash Royale decks & deck builder · StatsConnect",
    description:
      "Find the best Clash Royale decks from observed battle logs, check them against your card levels, and build or copy an eight-card deck or war set.",
  },
  {
    path: "/tools",
    title: "Clash Royale tools · StatsConnect",
    description: "Small utilities for player tags, shared deck links, upgrade planning, and the chest queue.",
  },
  {
    path: "/clans/search",
    title: "Clan search · StatsConnect",
    description: "Search Clash Royale clans by name or tag and review clan levels, members, and requirements.",
  },
  {
    path: "/news",
    title: "Clash Royale news · StatsConnect",
    description: "Recent official Clash Royale headlines and release notes, linked directly to Supercell.",
  },
  {
    path: "/tournaments",
    title: "Clash Royale tournaments · StatsConnect",
    description: "Live Global Tournaments and open community tournaments in Clash Royale.",
  },
];

export const brawlRoutes: readonly StaticRoute[] = [
  {
    path: "/",
    title: "Brawl Stars statistics · StatsConnect",
    description:
      "Track players, clubs, event rotation, map meta, and official rankings — powered by the Brawl Stars API and first-party battle aggregation.",
  },
  {
    path: "/leaderboards",
    title: "Brawl Stars leaderboards · StatsConnect",
    description: "Current official Brawl Stars trophy rankings for players and clubs.",
  },
  {
    path: "/meta",
    title: "Brawl Stars tier list & brawler meta · StatsConnect",
    description:
      "Brawl Stars tier list from observed battle logs: compare brawler win rates, use rates and tiers by mode, trophy range and date window, with sample sizes.",
  },
  {
    path: "/players",
    title: "Brawl Stars player lookup · StatsConnect",
    description: "Look up any Brawl Stars player by tag: trophies, brawler roster, and recent battles.",
  },
  {
    path: "/brawlers",
    title: "All Brawl Stars brawlers: best maps & counters · StatsConnect",
    description: "Browse every Brawl Stars brawler, then open one for its best and worst maps, counters, teammates, gadgets, and Star Powers from observed battle logs.",
  },
  {
    path: "/maps",
    title: "Brawl Stars maps, rotation & brawler picks · StatsConnect",
    description: "Find Brawl Stars maps in the current rotation and compare observed brawler picks by trophy range. Learn how to read win rates and sample sizes.",
  },
  {
    path: "/clubs",
    title: "Brawl Stars club search · StatsConnect",
    description: "Search Brawl Stars clubs by tag or name and review members, trophies, and activity.",
  },
  {
    path: "/progression",
    title: "Brawl Stars progression planner · StatsConnect",
    description:
      "Enter a player tag to estimate remaining Power Points and coins, measure collection completion, and prioritize upgrades.",
  },
  {
    path: "/assistant",
    title: "Brawl Stars map assistant · StatsConnect",
    description:
      "Turn live map data into picks you can actually play, combining map performance, synergies, and your brawler levels.",
  },
];

export function siteRoutes(site: SiteId): readonly StaticRoute[] {
  if (site === "cr") return clashRoutes;
  if (site === "bs") return brawlRoutes;
  return hubRoutes;
}

/** Sitemaps served live by a function (catalog-driven pages), advertised in robots.txt. */
export const dynamicSitemapPaths: Readonly<Record<SiteId, readonly string[]>> = {
  bs: ["/sitemap-brawlers.xml"],
  cr: [],
  hub: [],
};

/** Paths kept out of search indexes and sitemaps on every host. */
export const robotsExcludedPaths: readonly string[] = ["/api", "/beta", "/settings"];
