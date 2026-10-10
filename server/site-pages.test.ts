import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { GET as shellGet, HEAD as shellHead } from "../api/site-shell.ts";
import { player as fixturePlayer } from "../apps/clashcrown/src/lib/mock-data.ts";
import { profileMetadata } from "./profile-metadata.ts";
import {
  injectStaticBody,
  resolveSiteRoute,
  siteCacheControl,
  sitePageDocument,
  sitePageParts,
} from "./site-pages.ts";
import { siteRoutes } from "../shared/site-routes.ts";
import { brawlPageContent } from "../shared/brawl-page-content.ts";
import { escapeHtml } from "./profile-metadata.ts";
import { clashDeckContent } from "../shared/clash-deck-content.ts";

const repositoryRoot = process.cwd();
let fixtureRoot: string;
before(async () => {
  fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "statsconnect-site-pages-"));
  await mkdir(path.join(fixtureRoot, "dist"));
  await writeFile(path.join(fixtureRoot, "dist/index.html"), await readFile(path.join(repositoryRoot, "apps/statsconnect/index.html"), "utf8"));
  await symlink(path.join(repositoryRoot, "apps"), path.join(fixtureRoot, "apps"), "dir");
  process.chdir(fixtureRoot);
});
after(async () => {
  process.chdir(repositoryRoot);
  await rm(fixtureRoot, { recursive: true, force: true });
});

test("route resolution normalizes paths and rejects hub, unknown, and unlisted routes", () => {
  assert.equal(resolveSiteRoute("hub", "/"), undefined);
  assert.equal(resolveSiteRoute("cr", null)?.path, "/");
  assert.equal(resolveSiteRoute("cr", "leaderboards")?.path, "/leaderboards");
  assert.equal(resolveSiteRoute("bs", "/clubs/")?.path, "/clubs");
  assert.equal(resolveSiteRoute("xx", "/"), undefined);
  assert.equal(resolveSiteRoute("cr", "/decks/2v2"), undefined);
  assert.equal(resolveSiteRoute("cr", "/guides/cycle-decks"), undefined, "retired guides are not served");
});

test("known routes receive crawler metadata with inventory copy, canonical URLs, and social images", () => {
  const meta = sitePageParts("cr", "/meta");
  assert.ok(meta);
  assert.equal(meta.body, undefined);
  const route = siteRoutes("cr").find((candidate) => candidate.path === "/meta");
  if (!route) throw new Error("Missing /meta inventory entry");
  const tags = meta.tags.join("\n");
  assert.equal(tags.includes(`<title>${route.title}</title>`), true);
  assert.equal(tags.includes(`<meta name="description" content="${route.description}" />`), true);
  assert.equal(tags.includes('<link rel="canonical" href="https://cr.statsconnect.app/meta" />'), true);
  assert.equal(tags.includes('<meta property="og:image" content="https://statsconnect.app/og.png" />'), true);
  assert.equal(tags.includes('<meta name="twitter:card" content="summary_large_image" />'), true);
  // Ampersands in copy are escaped for raw HTML.
  assert.equal(sitePageParts("cr", "/decks")?.tags[0]?.includes("decks &amp; deck builder"), true);
  assert.equal(sitePageParts("hub", "/"), undefined);
});

test("routes without editorial copy keep the plain mounting point", async () => {
  const home = await sitePageDocument("bs", "/");
  assert.ok(home);
  assert.equal(home.includes('<div id="root"></div>'), true);
});

test("static bodies replace the single mounting point and fall back untouched", () => {
  const shell = '<html><body><div id="root"></div><script type="module" src="/assets/hub.js"></script></body></html>';
  assert.equal(
    injectStaticBody(shell, "<p>hi</p>"),
    '<html><body><div id="root"><p>hi</p></div><script type="module" src="/assets/hub.js"></script></body></html>',
  );
  assert.equal(injectStaticBody('<div id="root" data-boot></div>', "<p>hi</p>"), '<div id="root" data-boot></div>');
});

test("Brawl research pages serve the same explanations and follow-up links before JavaScript", async () => {
  for (const [page, content] of Object.entries(brawlPageContent)) {
    const route = siteRoutes("bs").find((entry) => entry.path === `/${page}`);
    assert.equal(route?.title, content.title, `${page} title matches the interactive page`);
    assert.equal(route?.description, content.description, `${page} description matches the interactive page`);
    const html = await sitePageDocument("bs", `/${page}`);
    assert.ok(html);
    assert.equal((html.match(/<div id="root">/g) ?? []).length, 1);
    assert.equal((html.match(/<h1>/g) ?? []).length, 1);
    assert.ok(html.includes(`<h1>${escapeHtml(content.heading)}</h1>`));
    for (const text of [content.intro, ...content.steps.map((step) => step.copy), ...content.questions.map((item) => item.answer)]) {
      assert.ok(html.includes(escapeHtml(text)), `${page} retains editorial copy`);
    }
    for (const link of content.links) {
      assert.ok(resolveSiteRoute("bs", link.path), `${link.path} is a public tool`);
      assert.ok(html.includes(`<a href="${link.path}">${escapeHtml(link.label)}</a>`));
    }
    assert.ok(html.includes(`<link rel="canonical" href="https://bs.statsconnect.app/${page}" />`));
    assert.ok(html.includes('href="https://statsconnect.app/data-methodology"'));
    assert.ok(html.includes("Live rotation, filters, and observed statistics load with the interactive app."));
  }
});

test("Clash deck discovery serves its shared explanation and tool links before JavaScript", async () => {
  const content = clashDeckContent;
  const route = siteRoutes("cr").find((entry) => entry.path === "/decks");
  assert.equal(route?.title, content.title);
  assert.equal(route?.description, content.description);
  const html = await sitePageDocument("cr", "/decks");
  assert.ok(html);
  assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  assert.ok(html.includes(`<h1>${escapeHtml(content.heading)}</h1>`));
  for (const copy of [content.intro, ...content.steps.map((step) => step.copy), ...content.questions.map((item) => item.answer)]) {
    assert.ok(html.includes(escapeHtml(copy)));
  }
  for (const link of content.links) {
    assert.ok(resolveSiteRoute("cr", link.path.split("?")[0] ?? link.path));
    assert.ok(html.includes(`<a href="${link.path}">${escapeHtml(link.label)}</a>`));
  }
  assert.ok(html.includes('<link rel="canonical" href="https://cr.statsconnect.app/decks" />'));
  assert.ok(html.includes("This explanation does not establish any current deck win rates."));
});

test("profile views are noindex while keeping their links crawlable", () => {
  const shell = '<html><head><title>Hub</title></head><body><div id="root"></div></body></html>';
  const html = profileMetadata(shell, { game: "cr", tag: "2PP" }, { game: "cr", player: { ...fixturePlayer, name: "Profiler" } });
  assert.equal(html.includes('<meta name="robots" content="noindex, follow" />'), true);
});

test("the site shell handler serves crawler documents with shared edge caching", async () => {
  const response = await shellGet(new Request("https://cr.statsconnect.app/api/site-shell?game=cr&route=%2Fdecks"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), siteCacheControl);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  const html = await response.text();
  assert.match(html, /How to choose a Clash Royale deck/);
  assert.match(html, /<main class="sc-static" lang="en">/);
  const head = await shellHead(new Request("https://cr.statsconnect.app/api/site-shell?game=cr&route=%2Fmeta"));
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("cache-control"), siteCacheControl);
  assert.equal(await head.text(), "");
});

test("unknown routes and unsupported games are a non-cacheable 404", async () => {
  for (const query of ["game=cr&route=%2Fnope", "game=hub&route=%2F", "route=%2F", ""]) {
    const response = await shellGet(new Request(`https://statsconnect.app/api/site-shell?${query}`));
    assert.equal(response.status, 404, query);
    assert.equal(response.headers.get("cache-control"), "no-store", query);
  }
  // A missing route parameter falls back to the game home.
  const home = await shellGet(new Request("https://statsconnect.app/api/site-shell?game=bs"));
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<title>Brawl Stars statistics · StatsConnect<\/title>/);
});
