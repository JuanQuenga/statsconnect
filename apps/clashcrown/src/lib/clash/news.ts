import type { Locale } from "@/lib/i18n";

export type OfficialNewsArticle = {
  title: string;
  url: string;
  publishedAt: string;
  imageUrl: string | null;
  category: string;
};

export type OfficialNewsPayload = {
  articles: OfficialNewsArticle[];
  fetchedAt: number;
  stale: boolean;
  locale: Locale;
  sourceUrl: string;
};

export const officialArchiveUrl: Record<Locale, string> = {
  en: "https://supercell.com/en/games/clashroyale/blog/",
  es: "https://supercell.com/en/games/clashroyale/es/blog/",
};

/**
 * A small, dated safety net for deployments without Convex. These are links,
 * titles, and dates from Supercell's archive checked on 5 August 2026—not a
 * pretend live feed and not copied article text.
 */
export const datedOfficialNews: OfficialNewsArticle[] = [
  {
    title: "Merge Tactics Mid-Season 10 Balance Changes",
    url: "https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-mid-season-10-balance-changes/",
    publishedAt: "2026-08-05T10:00:00.000+03:00",
    imageUrl: null,
    category: "Release notes",
  },
  {
    title: "Final August Balance Changes",
    url: "https://supercell.com/en/games/clashroyale/blog/news/final-august-balance-changes-826/",
    publishedAt: "2026-08-04T11:00:00.000+03:00",
    imageUrl: null,
    category: "News",
  },
  {
    title: "New Season: K.H.A.O.S",
    url: "https://supercell.com/en/games/clashroyale/blog/news/new-season-k-h-a-o-s/",
    publishedAt: "2026-08-03T08:53:00.820Z",
    imageUrl: null,
    category: "News",
  },
];
