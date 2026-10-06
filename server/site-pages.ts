import { findGuide, guideText, strategyGuides, type StrategyGuide } from "../apps/clashcrown/src/content/guides.ts";
import { siteOrigin, siteRoutes, type SiteId, type StaticRoute } from "../shared/site-routes.ts";
import { applicationShell, escapeHtml, injectDocumentHead } from "./profile-metadata.ts";

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
 * Head metadata for a known Game Site route, plus static body HTML for guide
 * pages so crawlers see the editorial content before JavaScript loads. The
 * mounted application replaces this content on hydration — it is the same
 * content the interactive page renders, never a different document.
 */
export function sitePageParts(game: string | null, route: string | null): SitePageParts | undefined {
  const resolved = resolveSiteRoute(game, route);
  if (!resolved) return undefined;

  const { path, route: staticRoute, site } = resolved;
  const guide = site === "cr" && path.startsWith("/guides/") ? findGuide(path.slice("/guides/".length)) : undefined;
  const url = `${siteOrigin(site)}${path}`;

  const tags = [
    `<title>${escapeHtml(staticRoute.title)}</title>`,
    `<meta name="description" content="${escapeHtml(staticRoute.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="StatsConnect" />`,
    `<meta property="og:title" content="${escapeHtml(staticRoute.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(staticRoute.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="https://statsconnect.app/og.png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(staticRoute.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(staticRoute.description)}" />`,
    `<meta name="twitter:image" content="https://statsconnect.app/og.png" />`,
  ];

  return { body: guide ? guideStaticBody(guide) : undefined, tags };
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

function guideStaticBody(guide: StrategyGuide): string {
  const text = guideText;
  const list = (values: readonly string[]) => `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
  const phases = guide.phases
    .map((phase) => `<h2>${escapeHtml(text(phase.title, "en"))}</h2><p>${escapeHtml(text(phase.copy, "en"))}</p>`)
    .join("");
  return `
<style>${staticBodyStyles}</style>
<main class="sc-static">
  <p class="sc-static__eyebrow">${escapeHtml(text(guide.archetype, "en"))} guide</p>
  <h1>${escapeHtml(text(guide.title, "en"))}</h1>
  <p class="sc-static__summary">${escapeHtml(text(guide.summary, "en"))}</p>
  <h2>Principles</h2>
  ${list(guide.principles.map((principle) => text(principle, "en")))}
  ${phases}
  <h2>Common mistakes</h2>
  ${list(guide.mistakes.map((mistake) => text(mistake, "en")))}
  <p class="sc-static__note">The interactive StatsConnect Clash Royale tools take over this page automatically. Card images, live meta links, and deck suggestions load with the app.</p>
</main>`;
}

const staticBodyStyles = `
.sc-static{max-width:46rem;margin:0 auto;padding:3rem 1.25rem 4rem;color:#e8e6ef;font:16px/1.7 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.sc-static h1{font-size:2rem;line-height:1.2;margin:.25rem 0 1rem}
.sc-static h2{font-size:1.15rem;margin:2rem 0 .5rem;color:#fff}
.sc-static p,.sc-static li{color:#c9c5da}
.sc-static ul{padding-left:1.25rem}
.sc-static li+li{margin-top:.35rem}
.sc-static__eyebrow{color:#a78bfa;font-size:.8rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin:0}
.sc-static__summary{font-size:1.05rem}
.sc-static__note{margin-top:2.5rem;padding:1rem 1.25rem;border:1px solid #26223c;border-radius:12px;background:#131120;color:#a9a4c0;font-size:.9rem}
`;

/**
 * Guide slugs and their published English titles must stay in sync with the
 * route inventory that drives sitemaps and crawler-facing metadata.
 */
export function guideInventoryDrift(): string[] {
  const inventoryPaths = siteRoutes("cr").map((route) => route.path);
  const problems: string[] = [];
  for (const guide of strategyGuides) {
    const path = `/guides/${guide.slug}`;
    const entry = siteRoutes("cr").find((route) => route.path === path);
    if (!entry) {
      problems.push(`${path} is missing from clashRoutes (guide exists in content)`);
      continue;
    }
    const expectedTitle = `${guideText(guide.title, "en")} · Clash Royale guide`;
    if (entry.title !== expectedTitle) {
      problems.push(`${path} title drift: inventory "${entry.title}" vs content "${expectedTitle}"`);
    }
    if (entry.description !== guideText(guide.summary, "en")) problems.push(`${path} description drift`);
  }
  for (const path of inventoryPaths.filter((candidate) => candidate.startsWith("/guides/"))) {
    if (!findGuide(path.slice("/guides/".length))) problems.push(`${path} has no matching guide in content`);
  }
  return problems;
}

function normalizeRoutePath(route: string): string {
  if (!route.startsWith("/")) return `/${route}`;
  if (route.length > 1 && route.endsWith("/")) return route.replace(/\/+$/, "");
  return route;
}
