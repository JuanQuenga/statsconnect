import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { OfficialNewsArticle, OfficialNewsPayload } from "../src/lib/clash/news";

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
const payloadValidator = v.object({
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

function sourceUrl(locale: "en" | "es") {
  return locale === "es"
    ? `${SUPERCELL_ORIGIN}/en/games/clashroyale/es/blog/`
    : `${SUPERCELL_ORIGIN}/en/games/clashroyale/blog/`;
}

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

function toArticle(value: unknown): OfficialNewsArticle | null {
  if (!value || typeof value !== "object") return null;
  const item = value as ArchiveArticle;
  if (typeof item.title !== "string" || typeof item.linkUrl !== "string" || typeof item.publishDate !== "string") {
    return null;
  }
  if (!item.linkUrl.startsWith("/en/games/clashroyale/")) return null;

  const image = item.thumbnail?.imgUrl;
  return {
    title: item.title.trim().slice(0, 180),
    url: `${SUPERCELL_ORIGIN}${item.linkUrl.replace(/\/$/, "")}/`,
    publishedAt: item.publishDate,
    imageUrl: typeof image === "string" && isAllowedImage(image) ? image : null,
    category: typeof item.category === "string" ? item.category.trim().slice(0, 80) : "Clash Royale",
  };
}

function parseArchive(html: string): OfficialNewsArticle[] {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error("Supercell's news archive did not include its article index.");

  const data = JSON.parse(match[1]) as NextData;
  const values = data.props?.pageProps?.articles;
  if (!Array.isArray(values)) throw new Error("Supercell's news archive returned an unexpected article index.");

  return values.map(toArticle).filter((item): item is OfficialNewsArticle => item !== null).slice(0, ARTICLE_LIMIT);
}

function isCachedArticle(value: unknown): value is OfficialNewsArticle {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<OfficialNewsArticle>;
  return typeof item.title === "string" && typeof item.url === "string" &&
    typeof item.publishedAt === "string" && (typeof item.imageUrl === "string" || item.imageUrl === null) &&
    typeof item.category === "string";
}

function readCached(document: Doc<"apiCache">, locale: "en" | "es", stale: boolean): OfficialNewsPayload | null {
  try {
    const value = JSON.parse(document.payload) as unknown;
    if (!Array.isArray(value) || !value.every(isCachedArticle)) return null;
    return {
      articles: value.slice(0, ARTICLE_LIMIT),
      fetchedAt: document.fetchedAt,
      stale,
      locale,
      sourceUrl: sourceUrl(locale),
    };
  } catch {
    return null;
  }
}

export const getOfficialNews = action({
  args: { locale: localeValidator, force: v.optional(v.boolean()) },
  returns: payloadValidator,
  handler: async (ctx, args): Promise<OfficialNewsPayload> => {
    const key = `news:official:${args.locale}`;
    const cached = await ctx.runQuery(internal.cache.get, { key });
    const cachedPayload = cached ? readCached(cached, args.locale, false) : null;

    if (cached && cachedPayload && cached.expiresAt > Date.now() && !args.force) return cachedPayload;

    try {
      const archiveUrl = sourceUrl(args.locale);
      const response = await fetch(archiveUrl, {
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
      if (!response.ok) throw new Error(`Supercell returned HTTP ${response.status}.`);

      const articles = parseArchive(await response.text());
      if (!articles.length) throw new Error("Supercell's news archive returned no readable articles.");

      const fetchedAt = Date.now();
      await ctx.runMutation(internal.cache.put, {
        key,
        kind: "news",
        payload: JSON.stringify(articles),
        fetchedAt,
        expiresAt: fetchedAt + CACHE_TTL_MS,
      });
      return { articles, fetchedAt, stale: false, locale: args.locale, sourceUrl: archiveUrl };
    } catch (error) {
      const stalePayload = cached ? readCached(cached, args.locale, true) : null;
      if (stalePayload) return stalePayload;
      throw error;
    }
  },
});
