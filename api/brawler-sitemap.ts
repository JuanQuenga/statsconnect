import { brawlerSitemapXml, loadBrawlerCatalog } from "../server/brawler-pages.ts";
import { siteCacheControl } from "../server/site-pages.ts";

/** Every released brawler page, from the live catalog so new brawlers appear without a rebuild. */
export async function GET(): Promise<Response> {
  try {
    const xml = brawlerSitemapXml(await loadBrawlerCatalog());
    return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": siteCacheControl } });
  } catch {
    return new Response("Sitemap is temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
