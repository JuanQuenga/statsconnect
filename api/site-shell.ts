import { siteCacheControl, sitePageDocument } from "../server/site-pages.ts";

/** Serve Game Site routes with crawler-visible titles, descriptions, and editorial copy. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
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

export async function HEAD(request: Request): Promise<Response> {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
