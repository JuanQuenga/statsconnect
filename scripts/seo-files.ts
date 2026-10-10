import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dynamicSitemapPaths, robotsExcludedPaths, siteOrigin, siteRoutes, type SiteId } from "../shared/site-routes.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

export const seoDirectory = "seo";

/**
 * Per-host crawl-control files. One dist serves every host, so each variant
 * lives under dist/seo and vercel.json maps /robots.txt and /sitemap.xml per
 * host — no static file may exist at dist/robots.txt or dist/sitemap.xml.
 */
export function buildRobotsTxt(site: SiteId): string {
  const sitemaps = ["/sitemap.xml", ...dynamicSitemapPaths[site]].map((path) => `Sitemap: ${siteOrigin(site)}${path}`);
  const lines = ["User-agent: *", "Allow: /", ...robotsExcludedPaths.map((path) => `Disallow: ${path}`), "", ...sitemaps, ""];
  return lines.join("\n");
}

export function buildSitemapXml(site: SiteId): string {
  const origin = siteOrigin(site);
  const entries = siteRoutes(site)
    .map((route) => `  <url><loc>${origin}${route.path}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function writeSeoFiles(rootDirectory = repositoryRoot): void {
  const target = path.join(rootDirectory, "dist", seoDirectory);
  mkdirSync(target, { recursive: true });
  for (const site of ["hub", "cr", "bs"] as const) {
    writeFileSync(path.join(target, `robots-${site}.txt`), buildRobotsTxt(site), "utf8");
    writeFileSync(path.join(target, `sitemap-${site}.xml`), buildSitemapXml(site), "utf8");
  }
}
