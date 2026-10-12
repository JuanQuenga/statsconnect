import { next, rewrite } from "@vercel/functions/middleware";
import { siteOrigin } from "./shared/site-routes.ts";

/**
 * Vercel serves `/` straight from the static `dist/index.html`, so the host
 * redirects and Game Site home rewrites in vercel.json never reach the bare
 * root. Routing Middleware runs before the filesystem and cache, so it owns
 * just that one path: compatibility hosts redirect to the apex, and Game Site
 * homes get their own crawler document instead of the Hub's canonical.
 */
export const config = { matcher: "/" };

const apexRedirectHosts = new Set(["www.statsconnect.app", "stats.juanquenga.com"]);

const gameSiteHosts: Readonly<Record<string, "bs" | "cr">> = {
  [new URL(siteOrigin("bs")).host]: "bs",
  [new URL(siteOrigin("cr")).host]: "cr",
};

export default function middleware(request: Request): Response {
  const url = new URL(request.url);
  if (apexRedirectHosts.has(url.hostname)) return Response.redirect(`${siteOrigin("hub")}/${url.search}`, 308);
  const game = gameSiteHosts[url.hostname];
  if (game) return rewrite(new URL(`/api/site-shell?game=${game}&route=%2F`, url));
  return next();
}
