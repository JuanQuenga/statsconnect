import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test, { before, after } from "node:test";
import { GET as imageHandler } from "../api/profile-image.ts";
import { GET as previewHandler } from "../api/profile-preview.ts";
import { player as fixturePlayer } from "../apps/clashcrown/src/lib/mock-data.ts";
import { profileMetadata } from "./profile-metadata.ts";
import { loadProfile, profileIdentity, profileUrl } from "./profile-data.ts";

const repositoryRoot = process.cwd();
let fixtureRoot: string;
before(async () => {
  fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "statsconnect-profile-handlers-"));
  await mkdir(path.join(fixtureRoot, "dist"));
  await writeFile(path.join(fixtureRoot, "dist/index.html"), await readFile(path.join(repositoryRoot, "apps/statsconnect/index.html"), "utf8"));
  await symlink(path.join(repositoryRoot, "apps"), path.join(fixtureRoot, "apps"), "dir");
  process.chdir(fixtureRoot);
});
after(async () => {
  process.chdir(repositoryRoot);
  await rm(fixtureRoot, { recursive: true, force: true });
});

test("profile names are escaped and dollar replacement syntax remains literal in crawler HTML", () => {
  const name = '$& $$ $` $\' <script>name</script> & "quoted"';
  const shell = '<html><head><title>Hub</title><meta property="og:image" content="old"><meta name="twitter:title" content="old"></head><body><div id="root"></div><script type="module" src="/assets/hub.js"></script></body></html>';
  const html = profileMetadata(shell, { game: "cr", tag: "2PP" }, { game: "cr", player: { ...fixturePlayer, name } });
  assert.equal((html.match(/<\/head>/g) ?? []).length, 1);
  assert.equal((html.match(/property="og:image"/g) ?? []).length, 1);
  assert.equal(html.includes('$&amp; $$ $` $&#39; &lt;script&gt;name&lt;/script&gt; &amp; &quot;quoted&quot;'), true);
  assert.equal(html.includes('<script>name</script>'), false);
  assert.equal(html.includes('<script type="module" src="/assets/hub.js"></script>'), true);
});

test("encoded and unprefixed query tags resolve to canonical game identities", () => {
  for (const game of ["cr", "bs"] as const) {
    for (const tag of ["2pp", "#2PP", "%232PP"]) {
      const identity = profileIdentity(new URL(`https://statsconnect.app/api/profile-preview?game=${game}&tag=${tag}`));
      // A raw # starts a fragment. Share links and rewrite parameters encode it.
      if (tag === "#2PP") { assert.equal(identity, undefined); continue; }
      assert.deepEqual(identity, { game, tag: "2PP" });
    }
  }
  assert.equal(profileUrl({ game: "cr", tag: "2PP" }), "https://cr.statsconnect.app/players/2PP");
  assert.equal(profileUrl({ game: "bs", tag: "2PP" }), "https://bs.statsconnect.app/players?tag=%232PP");
  assert.equal(profileIdentity(new URL("https://statsconnect.app/api/profile-image?game=bs&tag=https://localhost/secret")), undefined);
});

test("actual crawler handlers preserve the shell and emit a PNG without browser JavaScript", async (context) => {
  const previous = process.env.VITE_CONVEX_URL;
  process.env.VITE_CONVEX_URL = "https://example.convex.cloud";
  context.after(() => { if (previous === undefined) delete process.env.VITE_CONVEX_URL; else process.env.VITE_CONVEX_URL = previous; });
  const originalFetch = globalThis.fetch;
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname === "example.convex.cloud") {
      return Response.json({ status: "success", value: {
        player: { data: { tag: "#2PP", name: "Crawler <King> $&", expLevel: 50, trophies: 12345, bestTrophies: 13000, currentDeck: [] }, fetchedAt: 1780000000000, stale: false },
        battles: { data: [], fetchedAt: 1780000000000, stale: false },
        chests: { data: { items: [] }, fetchedAt: 1780000000000, stale: false },
      }, logLines: [] });
    }
    return originalFetch(input, init);
  });
  const request = new Request("https://statsconnect.app/api/profile-preview?game=cr&tag=2PP", { headers: { "User-Agent": "Discordbot/2.0" } });
  const response = await previewHandler(request);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Crawler &lt;King&gt; \$&amp;/);
  assert.match(html, /og:image" content="https:\/\/statsconnect.app\/api\/profile-image\?game=cr&amp;tag=2PP/);
  const originalShell = await readFile("dist/index.html", "utf8");
  assert.equal(html.split("<body>")[1], originalShell.split("<body>")[1]);
  const image = await imageHandler(new Request("https://statsconnect.app/api/profile-image?game=cr&tag=2PP"));
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  const png = Buffer.from(await image.arrayBuffer());
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1600);
  assert.equal(png.readUInt32BE(20), 1000);
});

test("non-tag player paths such as /players/compare get the app shell, not an error", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => new Response("unexpected", { status: 500 }));
  for (const tag of ["compare", "not-a-tag", ""]) {
    const response = await previewHandler(new Request(`https://statsconnect.app/api/profile-preview?game=cr&tag=${tag}`));
    assert.equal(response.status, 200, tag);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const html = await response.text();
    const originalShell = await readFile("dist/index.html", "utf8");
    assert.equal(html, originalShell);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("upstream failure retains usable HTML and never caches an error or fabricated player image", async (context) => {
  const previous = process.env.VITE_CONVEX_URL;
  process.env.VITE_CONVEX_URL = "https://example.convex.cloud";
  context.after(() => { if (previous === undefined) delete process.env.VITE_CONVEX_URL; else process.env.VITE_CONVEX_URL = previous; });
  context.mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 503 }));
  const response = await previewHandler(new Request("https://statsconnect.app/api/profile-preview?game=bs&tag=2PP"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  assert.match(html, /Brawl Stars player #2PP/);
  assert.match(html, /content="https:\/\/statsconnect.app\/og.png"/);
  const image = await imageHandler(new Request("https://statsconnect.app/api/profile-image?game=bs&tag=2PP"));
  assert.equal(image.status, 503);
  assert.equal(image.headers.get("cache-control"), "no-store");
});


test("Brawl crawler PNG uses tracked summaries and the backend generated by the frontend build", async (context) => {
  const saved = new Map(["CONVEX_URL", "VITE_CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL", "CONVEX_SITE_URL", "VITE_CONVEX_SITE_URL"].map((key) => [key, process.env[key]]));
  for (const key of saved.keys()) delete process.env[key];
  context.after(() => { for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  await writeFile("dist/profile-preview-config.json", JSON.stringify({convexUrl:"https://built.convex.cloud",convexSiteUrl:"https://built.convex.site"}));
  const player = {tag:"#2PP",name:"Brawl crawler",trophies:12345,highestTrophies:12500,expLevel:120,expPoints:100000,brawlers:[{id:16000109,name:"LOCAL ART",power:11,rank:35,trophies:1200,highestTrophies:1250}]};
  const summary = {days:30,battles:22,wins:17,losses:5};
  const requests: string[] = [];
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    requests.push(url.toString());
    if (url.hostname !== "built.convex.site") return new Response("Missing artwork",{status:404});
    assert.equal(url.searchParams.get("tag"), "#2PP");
    return Response.json(url.pathname === "/api/player" ? {player} : {summaries:[summary]});
  });
  const profile = await loadProfile({game:"bs",tag:"2PP"});
  assert.equal(profile.game, "bs");
  if (profile.game !== "bs") throw new Error("Wrong game");
  assert.deepEqual(profile.analytics?.summaries, [summary]);
  const response = await previewHandler(new Request("https://statsconnect.app/api/profile-preview?game=bs&tag=%232PP"));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Brawl crawler · Brawl Stars/);
  const image = await imageHandler(new Request("https://statsconnect.app/api/profile-image?game=bs&tag=%232PP"));
  assert.equal(image.status, 200);
  const png = Buffer.from(await image.arrayBuffer());
  assert.equal(png.subarray(0,8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(requests.some((url) => url.startsWith("https://built.convex.site/api/player?")), true);
  assert.equal(requests.some((url) => url.startsWith("https://built.convex.site/api/player-analytics?")), true);
});
