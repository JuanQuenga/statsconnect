import { brawlerIdFromRoute, brawlerPageDocument } from "../server/brawler-pages.ts";
import { siteCacheControl, sitePageDocument } from "../server/site-pages.ts";

/** Serve Game Site routes with crawler-visible titles, descriptions, and editorial copy. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const brawlerId = url.searchParams.get("game") === "bs" ? brawlerIdFromRoute(url.searchParams.get("route")) : undefined;
  if (brawlerId !== undefined) return brawlerResponse(brawlerId);
  let document: string | undefined;
  try {
    document = await sitePageDocument(url.searchParams.get("game"), url.searchParams.get("route"));
  } catch {
    return new Response("Page is temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!document) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(document, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": siteCacheControl },
  });
}

async function brawlerResponse(id: number): Promise<Response> {
  let page: Awaited<ReturnType<typeof brawlerPageDocument>>;
  try {
    page = await brawlerPageDocument(id);
  } catch {
    return new Response("Page is temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!page) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(page.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": page.cacheControl } });
}

export async function HEAD(request: Request): Promise<Response> {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
