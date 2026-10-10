import { brawlerPageCopy } from "../shared/brawl-page-content.ts";
import { siteOrigin } from "../shared/site-routes.ts";
import { configuredBackend } from "./profile-data.ts";
import { applicationShell, escapeHtml, injectDocumentHead } from "./profile-metadata.ts";
import { injectStaticBody, pageHeadTags, siteCacheControl, staticBodyStyles, type SitePageParts } from "./site-pages.ts";

export type CatalogBrawler = Readonly<{
  id: number;
  name: string;
  rarity: string;
  role: string;
  description: string;
  gadgets: readonly Ability[];
  starPowers: readonly Ability[];
}>;
type Ability = Readonly<{ name: string; description: string }>;

const catalogTtlMs = 60 * 60 * 1000;
let cached: { at: number; brawlers: readonly CatalogBrawler[] } | undefined;

/** The released brawler catalog, cached per instance; the edge caches the documents built from it. */
export async function loadBrawlerCatalog(fetcher: typeof fetch = fetch): Promise<readonly CatalogBrawler[]> {
  if (cached && Date.now() - cached.at < catalogTtlMs) return cached.brawlers;
  const { convexSiteUrl } = await configuredBackend();
  const response = await fetcher(new URL("/api/brawlers", convexSiteUrl), { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Brawler catalog failed with ${response.status}`);
  const brawlers = parseBrawlerCatalog(await response.json());
  if (!brawlers.length) throw new Error("Brawler catalog is empty");
  cached = { at: Date.now(), brawlers };
  return brawlers;
}

/** Mirrors the client's catalog normalization for the fields the page renders. */
export function parseBrawlerCatalog(payload: unknown): CatalogBrawler[] {
  const list = isRecord(payload) && Array.isArray(payload.list) ? payload.list : Array.isArray(payload) ? payload : [];
  return list.filter(isRecord).filter((item) => item.released !== false).flatMap((item) => {
    const id = Number(item.id);
    const name = text(item.name);
    if (!Number.isInteger(id) || id <= 0 || !name) return [];
    return [{
      id,
      name,
      rarity: text(isRecord(item.rarity) ? item.rarity.name : undefined) || "Unknown",
      role: text(isRecord(item.class) ? item.class.name : undefined) || "Brawler",
      description: clean(text(item.description)),
      gadgets: abilities(item.gadgets),
      starPowers: abilities(item.starPowers),
    }];
  });
}

export function brawlerPath(id: number): string {
  return `/brawlers/${id}`;
}

/** `/brawlers/16000000` → 16000000; anything else is not a brawler page. */
export function brawlerIdFromRoute(route: string | null): number | undefined {
  const match = /^\/?brawlers\/(\d{1,9})\/?$/.exec(route ?? "");
  return match ? Number(match[1]) : undefined;
}

export function brawlerPageParts(brawler: CatalogBrawler): SitePageParts {
  const { title, description } = brawlerPageCopy(brawler);
  const url = `${siteOrigin("bs")}${brawlerPath(brawler.id)}`;
  const list = (items: readonly Ability[]) => items.length
    ? `<ul>${items.map((item) => `<li><strong>${escapeHtml(item.name)}</strong> — ${escapeHtml(item.description)}</li>`).join("")}</ul>`
    : "";
  const body = `
<style>${staticBodyStyles}</style>
<main class="sc-static" lang="en">
  <p class="sc-static__eyebrow">${escapeHtml(brawler.rarity)} · ${escapeHtml(brawler.role)}</p>
  <h1>${escapeHtml(brawler.name)}</h1>
  ${brawler.description ? `<p class="sc-static__summary">${escapeHtml(brawler.description)}</p>` : ""}
  ${brawler.gadgets.length ? `<h2>Gadgets</h2>${list(brawler.gadgets)}` : ""}
  ${brawler.starPowers.length ? `<h2>Star Powers</h2>${list(brawler.starPowers)}` : ""}
  <nav aria-label="Continue researching brawlers"><a href="/meta">Brawl Stars tier list</a> <a href="/maps">Maps and brawler picks</a> <a href="/brawlers">All brawlers</a> <a href="/assistant">Draft Lab</a></nav>
  <p class="sc-static__note">${escapeHtml(brawler.name)}'s best maps, counters, teammates, and trends load with the interactive app from observed battle logs.</p>
</main>`;
  return { body, tags: pageHeadTags(title, description, url) };
}

/** Short edge cache for the plain shell served while the catalog is unreachable. */
export const fallbackCacheControl = "public, max-age=60, s-maxage=60";

/**
 * A brawler's crawler document, or undefined for an unknown brawler. If the
 * catalog is unreachable the plain application shell still serves the page.
 */
export async function brawlerPageDocument(
  id: number,
  load: () => Promise<readonly CatalogBrawler[]> = loadBrawlerCatalog,
): Promise<{ html: string; cacheControl: string } | undefined> {
  const shell = await applicationShell();
  let catalog: readonly CatalogBrawler[];
  try {
    catalog = await load();
  } catch {
    return { html: shell, cacheControl: fallbackCacheControl };
  }
  const brawler = catalog.find((candidate) => candidate.id === id);
  if (!brawler) return undefined;
  const parts = brawlerPageParts(brawler);
  return { html: injectStaticBody(injectDocumentHead(shell, parts.tags), parts.body ?? ""), cacheControl: siteCacheControl };
}

export function brawlerSitemapXml(brawlers: readonly CatalogBrawler[]): string {
  const origin = siteOrigin("bs");
  const entries = brawlers.map((brawler) => `  <url><loc>${origin}${brawlerPath(brawler.id)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function abilities(value: unknown): Ability[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).filter((item) => item.released !== false && Number(item.id) > 0)
    .map((item) => ({ name: text(item.name) || "Unknown ability", description: clean(text(item.description)) || "No description is available." }));
}

/** Same cleanup as the client: BrawlAPI marks scaling values as `<!…>`. */
function clean(value: string): string {
  return value.replace(/<![^>]+>/g, "a scaling amount").replace(/\s+/g, " ").trim();
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
