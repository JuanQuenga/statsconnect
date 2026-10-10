import { siteOrigin, siteRoutes, type SiteId, type StaticRoute } from "../shared/site-routes.ts";
import { applicationShell, escapeHtml, injectDocumentHead } from "./profile-metadata.ts";
import { brawlPageContent, type BrawlPageContent } from "../shared/brawl-page-content.ts";
import { clashDeckContent } from "../shared/clash-deck-content.ts";

/** Game-site shell documents stay valid at the edge for a day and refresh in the background. */
export const siteCacheControl = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

export type SitePageParts = Readonly<{
  body: string | undefined;
  tags: readonly string[];
}>;

export function resolveSiteRoute(
  game: string | null,
  route: string | null,
): { path: string; route: StaticRoute; site: SiteId } | undefined {
  if (game !== "cr" && game !== "bs") return undefined;
  const normalized = normalizeRoutePath(route ?? "/");
  const match = siteRoutes(game).find((candidate) => candidate.path === normalized);
  if (!match) return undefined;
  return { path: normalized, route: match, site: game };
}

/**
 * Head metadata for a known Game Site route, plus static body HTML for the
 * Brawl research pages and Clash deck discovery so readers see editorial
 * content before JavaScript loads. The mounted application replaces this content on hydration — it is the same
 * content the interactive page renders, never a different document.
 */
export function sitePageParts(game: string | null, route: string | null): SitePageParts | undefined {
  const resolved = resolveSiteRoute(game, route);
  if (!resolved) return undefined;

  const { path, route: staticRoute, site } = resolved;
  const url = `${siteOrigin(site)}${path}`;

  const tags = pageHeadTags(staticRoute.title, staticRoute.description, url);

  const brawlContent = site === "bs"
    ? path === "/maps" ? brawlPageContent.maps : path === "/meta" ? brawlPageContent.meta : undefined
    : undefined;
  const body = brawlContent ? researchStaticBody(brawlContent, "Brawl Stars")
    : site === "cr" && path === "/decks" ? researchStaticBody(clashDeckContent, "Clash Royale")
    : undefined;
  return { body, tags };
}

/** Title, description, canonical, and social tags shared by every crawler document. */
export function pageHeadTags(title: string, description: string, url: string): string[] {
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="StatsConnect" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="https://statsconnect.app/og.png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="https://statsconnect.app/og.png" />`,
  ];
}

export async function sitePageDocument(game: string | null, route: string | null): Promise<string | undefined> {
  const parts = sitePageParts(game, route);
  if (!parts) return undefined;
  const shell = await applicationShell();
  const document = injectDocumentHead(shell, parts.tags);
  return parts.body ? injectStaticBody(document, parts.body) : document;
}

export function injectStaticBody(shell: string, body: string): string {
  const root = '<div id="root"></div>';
  if (!shell.includes(root)) return shell;
  return shell.replace(root, `<div id="root">${body}</div>`);
}

function researchStaticBody(content: BrawlPageContent | typeof clashDeckContent, game: "Brawl Stars" | "Clash Royale"): string {
  const steps = content.steps.map((step) => `<li><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.copy)}</p></li>`).join("");
  const questions = content.questions.map((item) => `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`).join("");
  const links = content.links.map((link) => `<a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a>`).join(" ");
  return `
<style>${staticBodyStyles}</style>
<main class="sc-static" lang="en">
  <p class="sc-static__eyebrow">StatsConnect ${game}</p>
  <h1>${escapeHtml(content.heading)}</h1>
  <p class="sc-static__summary">${escapeHtml(content.intro)}</p>
  <h2>${escapeHtml(content.workflowTitle)}</h2>
  <ol>${steps}</ol>
  ${questions}
  <nav aria-label="Continue researching ${game === "Brawl Stars" ? "brawler picks" : "decks"}">${links} <a href="https://statsconnect.app/data-methodology">Data sources and methodology</a></nav>
  <p class="sc-static__note">${game === "Brawl Stars" ? "Live rotation, filters, and observed statistics load with the interactive app. This explanation does not establish any current picks or rates." : "Observed decks, filters, and the manual builder load with the interactive app. This explanation does not establish any current deck win rates."}</p>
</main>`;
}

export const staticBodyStyles = `
.sc-static{max-width:46rem;margin:0 auto;padding:3rem 1.25rem 4rem;color:#e8e6ef;font:16px/1.7 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.sc-static h1{font-size:2rem;line-height:1.2;margin:.25rem 0 1rem}
.sc-static h2{font-size:1.15rem;margin:2rem 0 .5rem;color:#fff}
.sc-static h3{font-size:1rem;margin:1.5rem 0 .5rem;color:#fff}
.sc-static a{color:#c4b5fd;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
.sc-static nav{display:flex;flex-wrap:wrap;gap:.75rem 1.25rem;margin-top:2rem}
.sc-static p,.sc-static li{color:#c9c5da}
.sc-static ul{padding-left:1.25rem}
.sc-static li+li{margin-top:.35rem}
.sc-static__eyebrow{color:#a78bfa;font-size:.8rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin:0}
.sc-static__summary{font-size:1.05rem}
.sc-static__note{margin-top:2.5rem;padding:1rem 1.25rem;border:1px solid #26223c;border-radius:12px;background:#131120;color:#a9a4c0;font-size:.9rem}
`;

function normalizeRoutePath(route: string): string {
  if (!route.startsWith("/")) return `/${route}`;
  if (route.length > 1 && route.endsWith("/")) return route.replace(/\/+$/, "");
  return route;
}
