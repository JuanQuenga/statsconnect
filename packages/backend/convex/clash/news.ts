import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, type ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireForceAuthorization } from "./forceAuthorization";
type OfficialNewsArticle = { title: string; url: string; publishedAt: string; imageUrl: string | null; category: string };
type OfficialNewsPayload = { articles: OfficialNewsArticle[]; fetchedAt: number; stale: boolean; locale: "en" | "es"; sourceUrl: string };

/** Supercell games whose official blog shares the same Next.js article index. */
export type NewsGame = "clashroyale" | "brawlstars";

const SUPERCELL_ORIGIN = "https://supercell.com";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ARTICLE_LIMIT = 8;

const localeValidator = v.union(v.literal("en"), v.literal("es"));
const articleValidator = v.object({
  title: v.string(),
  url: v.string(),
  publishedAt: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  category: v.string(),
});
export const payloadValidator = v.object({
  articles: v.array(articleValidator),
  fetchedAt: v.number(),
  stale: v.boolean(),
  locale: localeValidator,
  sourceUrl: v.string(),
});

type ArchiveArticle = {
  title?: unknown;
  linkUrl?: unknown;
  publishDate?: unknown;
  category?: unknown;
  thumbnail?: { imgUrl?: unknown } | null;
};

type NextData = {
  props?: {
    pageProps?: {
      articles?: unknown;
    };
  };
};

function sourceUrl(game: NewsGame, locale: "en" | "es") {
  // Only Clash Royale publishes a Spanish archive; Brawl Stars is English-only.
  return locale === "es" && game === "clashroyale"
    ? `${SUPERCELL_ORIGIN}/en/games/${game}/es/blog/`
    : `${SUPERCELL_ORIGIN}/en/games/${game}/blog/`;
}

const GAME_NAMES: Record<NewsGame, string> = { clashroyale: "Clash Royale", brawlstars: "Brawl Stars" };

function isAllowedImage(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname === "supercell.com" ||
      url.hostname.endsWith(".supercell.com")
    );
  } catch {
    return false;
  }
}

function toArticle(value: unknown, game: NewsGame): OfficialNewsArticle | null {
  if (!value || typeof value !== "object") return null;
  const item = value as ArchiveArticle;
  if (typeof item.title !== "string" || typeof item.linkUrl !== "string" || typeof item.publishDate !== "string") {
    return null;
  }
  if (!item.linkUrl.startsWith(`/en/games/${game}/`)) return null;

  const image = item.thumbnail?.imgUrl;
  return {
    title: item.title.trim().slice(0, 180),
    url: `${SUPERCELL_ORIGIN}${item.linkUrl.replace(/\/$/, "")}/`,
    publishedAt: item.publishDate,
    imageUrl: typeof image === "string" && isAllowedImage(image) ? image : null,
    category: typeof item.category === "string" ? item.category.trim().slice(0, 80) : GAME_NAMES[game],
  };
}

function parseArchive(html: string, game: NewsGame): OfficialNewsArticle[] {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error("Supercell's news archive did not include its article index.");

  const data = JSON.parse(match[1]) as NextData;
  const values = data.props?.pageProps?.articles;
  if (!Array.isArray(values)) throw new Error("Supercell's news archive returned an unexpected article index.");

  return values.map((value) => toArticle(value, game)).filter((item): item is OfficialNewsArticle => item !== null).slice(0, ARTICLE_LIMIT);
}

function isCachedArticle(value: unknown): value is OfficialNewsArticle {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<OfficialNewsArticle>;
  return typeof item.title === "string" && typeof item.url === "string" &&
    typeof item.publishedAt === "string" && (typeof item.imageUrl === "string" || item.imageUrl === null) &&
    typeof item.category === "string";
}

function readCached(document: Doc<"apiCache">, game: NewsGame, locale: "en" | "es", stale: boolean): OfficialNewsPayload | null {
  try {
    const value = JSON.parse(document.payload) as unknown;
    if (!Array.isArray(value) || !value.every(isCachedArticle)) return null;
    return {
      articles: value.slice(0, ARTICLE_LIMIT),
      fetchedAt: document.fetchedAt,
      stale,
      locale,
      sourceUrl: sourceUrl(game, locale),
    };
  } catch {
    return null;
  }
}

/**
 * Read-through cache of one game's official blog index. Shared by the Clash
 * Royale and Brawl Stars news actions; each game keeps its own cache key.
 */
export async function loadOfficialNews(
  ctx: ActionCtx,
  game: NewsGame,
  locale: "en" | "es",
  force: boolean,
): Promise<OfficialNewsPayload> {
  // Clash keeps its original key so the existing cache stays warm.
  const key = game === "clashroyale" ? `news:official:${locale}` : `news:official:${game}:${locale}`;
  const cached = await ctx.runQuery(internal.clash.cache.get, { key });
  const cachedPayload = cached ? readCached(cached, game, locale, false) : null;

  if (cached && cachedPayload && cached.expiresAt > Date.now() && !force) return cachedPayload;

  try {
    const archiveUrl = sourceUrl(game, locale);
    const response = await fetch(archiveUrl, {
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) throw new Error(`Supercell returned HTTP ${response.status}.`);

    const articles = parseArchive(await response.text(), game);
    if (!articles.length) throw new Error("Supercell's news archive returned no readable articles.");

    const fetchedAt = Date.now();
    await ctx.runMutation(internal.clash.cache.put, {
      key,
      kind: "news",
      payload: JSON.stringify(articles),
      fetchedAt,
      expiresAt: fetchedAt + CACHE_TTL_MS,
    });
    return { articles, fetchedAt, stale: false, locale, sourceUrl: archiveUrl };
  } catch (error) {
    const stalePayload = cached ? readCached(cached, game, locale, true) : null;
    if (stalePayload) return stalePayload;
    throw error;
  }
}

export const getOfficialNews = action({
  args: { locale: localeValidator, force: v.optional(v.boolean()), adminKey: v.optional(v.string()) },
  returns: payloadValidator,
  handler: async (ctx, args): Promise<OfficialNewsPayload> => {
    requireForceAuthorization(args);
    return loadOfficialNews(ctx, "clashroyale", args.locale, args.force === true);
  },
});
