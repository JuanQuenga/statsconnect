import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import {
  brawlerIdFromRoute,
  brawlerPageDocument,
  brawlerSitemapXml,
  fallbackCacheControl,
  parseBrawlerCatalog,
} from "./brawler-pages.ts";
import { siteCacheControl } from "./site-pages.ts";
import { buildRobotsTxt } from "../scripts/seo-files.ts";

const repositoryRoot = process.cwd();
let fixtureRoot: string;
before(async () => {
  fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "statsconnect-brawler-pages-"));
  await mkdir(path.join(fixtureRoot, "dist"));
  await writeFile(path.join(fixtureRoot, "dist/index.html"), await readFile(path.join(repositoryRoot, "apps/statsconnect/index.html"), "utf8"));
  process.chdir(fixtureRoot);
});
after(async () => {
  process.chdir(repositoryRoot);
  await rm(fixtureRoot, { recursive: true, force: true });
});

// Shaped like the live `/api/brawlers` response.
const payload = {
  list: [
    {
      id: 16000000, name: "Shelly", released: true,
      class: { id: 1, name: "Damage Dealer" }, rarity: { id: 1, name: "Starting Brawler" },
      description: "Shelly's spread-fire shotgun blasts the other team with buckshot.",
      gadgets: [{ id: 23000255, name: "Fast Forward", description: "Shelly dashes ahead, deals <!damage> damage.", released: true }],
      starPowers: [{ id: 23000076, name: "Shell Shock", description: "Super shells slow enemies.", released: true }, { id: 1, name: "Unreleased", description: "x", released: false }],
    },
    { id: 16000999, name: "Future", released: false },
    { id: 0, name: "Broken" },
  ],
};

test("the catalog parser keeps released brawlers and cleans scaling markers like the client", () => {
  const brawlers = parseBrawlerCatalog(payload);
  assert.deepEqual(brawlers.map((brawler) => brawler.name), ["Shelly"]);
  assert.equal(brawlers[0]?.role, "Damage Dealer");
  assert.equal(brawlers[0]?.gadgets[0]?.description, "Shelly dashes ahead, deals a scaling amount damage.");
  assert.equal(brawlers[0]?.starPowers.length, 1);
  assert.deepEqual(parseBrawlerCatalog({ nope: true }), []);
});

test("only numeric brawler paths are brawler pages", () => {
  assert.equal(brawlerIdFromRoute("/brawlers/16000000"), 16000000);
  assert.equal(brawlerIdFromRoute("/brawlers/16000000/"), 16000000);
  for (const route of ["/brawlers", "/brawlers/shelly", "/brawlers/1/x", null]) assert.equal(brawlerIdFromRoute(route), undefined);
});

test("a brawler document carries its own metadata and the page's catalog content before JavaScript", async () => {
  const page = await brawlerPageDocument(16000000, async () => parseBrawlerCatalog(payload));
  assert.ok(page);
  assert.equal(page.cacheControl, siteCacheControl);
  assert.match(page.html, /<title>Shelly: best maps, counters &amp; win rate · Brawl Stars · StatsConnect<\/title>/);
  assert.ok(page.html.includes('<link rel="canonical" href="https://bs.statsconnect.app/brawlers/16000000" />'));
  assert.equal((page.html.match(/<title>/g) ?? []).length, 1);
  assert.equal((page.html.match(/<meta name="description"/g) ?? []).length, 1);
  assert.equal((page.html.match(/<h1>/g) ?? []).length, 1);
  assert.ok(page.html.includes("<h1>Shelly</h1>"));
  assert.ok(page.html.includes("<strong>Fast Forward</strong>"));
  assert.ok(!page.html.includes("Unreleased"));
  assert.ok(page.html.includes('<a href="/meta">'));
});

test("unknown brawlers are not found, and an unreachable catalog still serves the app", async () => {
  assert.equal(await brawlerPageDocument(42, async () => parseBrawlerCatalog(payload)), undefined);
  const fallback = await brawlerPageDocument(16000000, async () => { throw new Error("down"); });
  assert.ok(fallback);
  assert.equal(fallback.cacheControl, fallbackCacheControl);
  assert.ok(fallback.html.includes('<div id="root"></div>'));
});

test("the brawler sitemap lists each brawler once and robots advertises it on the Brawl host only", () => {
  const xml = brawlerSitemapXml(parseBrawlerCatalog(payload));
  assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]), ["https://bs.statsconnect.app/brawlers/16000000"]);
  assert.ok(buildRobotsTxt("bs").includes("Sitemap: https://bs.statsconnect.app/sitemap-brawlers.xml\n"));
  assert.ok(!buildRobotsTxt("cr").includes("sitemap-brawlers"));
});
