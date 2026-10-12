import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildRobotsTxt, buildSitemapXml, seoDirectory, writeSeoFiles } from "./seo-files.ts";
import { hubDocumentPaths, hubRoutes, robotsExcludedPaths, siteOrigin, siteRoutes, siteShellRoutes, type SiteId } from "../shared/site-routes.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

type VercelRewrite = {
  destination: string;
  has?: Array<{ type: string; key?: string; value?: string }>;
  source: string;
};

type VercelConfiguration = {
  cleanUrls: boolean;
  redirects: Array<{ source: string }>;
  rewrites: VercelRewrite[];
};

async function readVercelConfiguration(): Promise<VercelConfiguration> {
  return JSON.parse(await readFile(path.join(repositoryRoot, "vercel.json"), "utf8")) as VercelConfiguration;
}

/** Minimal escaping matching the head tags hand-written into the document pages. */
const asHtmlText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

test("robots files allow crawling except the shared exclusions and advertise the per-host sitemap", () => {
  for (const site of ["hub", "cr", "bs"] as const) {
    const robots = buildRobotsTxt(site);
    assert.equal(robots.startsWith("User-agent: *\nAllow: /\n"), true, site);
    for (const excluded of robotsExcludedPaths) {
      assert.equal(robots.includes(`Disallow: ${excluded}\n`), true, `${site} ${excluded}`);
    }
    assert.equal(robots.includes(`\nSitemap: ${siteOrigin(site)}/sitemap.xml\n`), true, site);
  }
});

test("sitemaps list every inventory route exactly once and omit retired guides", () => {
  for (const site of ["hub", "cr", "bs"] as const) {
    const sitemap = buildSitemapXml(site);
    assert.equal(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset'), true, site);
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "");
    assert.deepEqual(locations, siteRoutes(site).map((route) => `${siteOrigin(site)}${route.path}`), site);
    assert.equal(new Set(locations).size, locations.length, site);
  }
  assert.equal(buildSitemapXml("cr").includes("/guides"), false);
});

test("sitemap URLs are final URLs: no trailing slash, .html, client launcher, or vercel.json redirect", async () => {
  const redirectSources = new Set((await readVercelConfiguration()).redirects.map((redirect) => redirect.source));
  for (const site of ["hub", "cr", "bs"] as const) {
    for (const { path: routePath } of siteRoutes(site)) {
      assert.equal(routePath !== "/" && routePath.endsWith("/"), false, `${site}${routePath} trailing slash`);
      assert.equal(routePath.endsWith(".html"), false, `${site}${routePath} .html`);
      assert.equal(/^\/(?:games|launch|cr|bs)(?:\/|$)/.test(routePath), false, `${site}${routePath} redirects`);
      assert.equal(redirectSources.has(routePath), false, `${site}${routePath} is a redirect source`);
    }
  }
});

test("the unified build writes one robots and sitemap variant per host and no shadowing files", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "statsconnect-seo-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  writeSeoFiles(root);
  for (const site of ["hub", "cr", "bs"] as const) {
    assert.equal(
      await readFile(path.join(root, "dist", seoDirectory, `robots-${site}.txt`), "utf8"),
      buildRobotsTxt(site),
    );
    assert.equal(
      await readFile(path.join(root, "dist", seoDirectory, `sitemap-${site}.xml`), "utf8"),
      buildSitemapXml(site),
    );
  }
  // A static file at either path would shadow the host-conditioned rewrites.
  await assert.rejects(access(path.join(root, "dist", "robots.txt")));
  await assert.rejects(access(path.join(root, "dist", "sitemap.xml")));
});

test("vercel.json serves every inventory route through the cached site shell per host", async () => {
  const vercel = await readVercelConfiguration();
  assert.equal(vercel.cleanUrls, true);
  // Every Hub route is the shell home, a static document page, or a site-shell route.
  assert.deepEqual(
    hubRoutes.map((route) => route.path).filter((routePath) => routePath !== "/" && !hubDocumentPaths.includes(routePath)),
    siteShellRoutes("hub").map((route) => route.path),
  );
  for (const site of ["cr", "bs", "hub"] as const) {
    for (const route of siteShellRoutes(site)) {
      const match = vercel.rewrites.find((rewrite) =>
        rewrite.source === route.path
        && rewrite.destination === `/api/site-shell?game=${site}&route=${encodeURIComponent(route.path)}`
        && rewrite.has?.some((condition) => condition.type === "host" && condition.value === new URL(siteOrigin(site)).host),
      );
      assert.ok(match, `${site}${route.path} is missing its site-shell rewrite`);
    }
  }
  // The tagged Brawl profile rewrite must precede the site-shell rewrite for the same path.
  const indexOfTaggedProfiles = vercel.rewrites.findIndex((rewrite) =>
    rewrite.destination === "/api/profile-preview?game=bs&tag=:playerTag"
    && rewrite.has?.some((condition) => condition.type === "host"));
  const indexOfShellProfiles = vercel.rewrites.findIndex((rewrite) =>
    rewrite.source === "/players" && rewrite.destination === "/api/site-shell?game=bs&route=%2Fplayers");
  assert.ok(indexOfTaggedProfiles >= 0 && indexOfShellProfiles > indexOfTaggedProfiles);
});

test("per-host robots and sitemap rewrites point at the generated variants with a hub fallback", async () => {
  const vercel = await readVercelConfiguration();
  const rewriteFor = (source: string, site: SiteId) => {
    const file = source.slice(1).replace(".", `-${site}.`);
    const match = vercel.rewrites.find((rewrite) => rewrite.source === source && rewrite.destination === `/seo/${file}`);
    assert.ok(match, `${source} → /seo/${file}`);
    if (site === "hub") {
      assert.equal(match.has, undefined, `${source} hub variant must be the unconditional fallback`);
    } else {
      assert.equal(
        match.has?.some((condition) => condition.type === "host" && condition.value === `${site}.statsconnect.app`),
        true,
        `${source} ${site}`,
      );
    }
  };
  for (const source of ["/robots.txt", "/sitemap.xml"]) {
    for (const site of ["hub", "cr", "bs"] as const) rewriteFor(source, site);
  }
});

const hubDocumentPages = hubDocumentPaths.map((documentPath) => ({ file: `${documentPath.slice(1)}.html`, path: documentPath }));

test("hub document pages carry the exact inventory titles, descriptions, and canonical URLs", async () => {
  for (const page of hubDocumentPages) {
    const route = hubRoutes.find((candidate) => candidate.path === page.path);
    assert.ok(route, page.file);
    const html = await readFile(path.join(repositoryRoot, "apps/statsconnect/public", page.file), "utf8");
    assert.equal(html.includes(`<title>${asHtmlText(route.title)}</title>`), true, `${page.file} title`);
    assert.equal(
      html.includes(`<meta name="description" content="${asHtmlText(route.description)}" />`),
      true,
      `${page.file} description`,
    );
    assert.equal(html.includes(`<link rel="canonical" href="${siteOrigin("hub")}${route.path}" />`), true, `${page.file} canonical`);
    for (const other of hubDocumentPages.filter((candidate) => candidate.path !== page.path)) {
      assert.equal(html.includes(`href="${other.path}"`), true, `${page.file} links to ${other.path}`);
    }
  }
});
