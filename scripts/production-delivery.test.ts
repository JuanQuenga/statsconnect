import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applicationShellManifestPath,
  deliveryApps,
  planVercelRelease,
  publicAppOrigin,
  publicOrigin,
  removeStandaloneApplicationDocuments,
  standaloneApplicationDocumentPaths,
  unifiedPublicEnvironment,
  viteBasePath,
  viteOutputDirectory,
  writeProfilePreviewConfiguration,
} from "./production-delivery.ts";
import { profilePreviewConfigPath } from "../shared/profile-preview-config.ts";
import { siteRoutes } from "../shared/site-routes.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

type VercelConfiguration = {
  buildCommand: string;
  cleanUrls: boolean;
  functions: Record<string, { includeFiles: string }>;
  headers: Array<{ headers: Array<{ key: string; value: string }>; source: string }>;
  outputDirectory: string;
  redirects: Array<{ destination: string; permanent: boolean; source: string }>;
  rewrites: Array<{ destination: string; source: string; has?: Array<{ type: string; key?: string; value?: string }> }>;
  trailingSlash: boolean;
};

test("function asset patterns fit Vercel's configuration limit", async () => {
  const vercel = await readJson<VercelConfiguration>("vercel.json");
  for (const [handler, configuration] of Object.entries(vercel.functions)) {
    assert.ok(configuration.includeFiles.length <= 256, handler);
  }
});

test("Brawl profile rewrites forward tags without hash encoding ambiguity", async () => {
  const vercel = await readJson<VercelConfiguration>("vercel.json");
  for (const rewrite of vercel.rewrites.filter((route) => route.destination.startsWith("/api/profile-preview?game=bs"))) {
    const capture = rewrite.has?.find((condition) => condition.type === "query" && condition.key === "tag")?.value;
    assert.ok(capture);
    for (const incoming of ["QVLRCJQ00", "#QVLRCJQ00", "%23QVLRCJQ00"]) {
      const tag: string | undefined = new RegExp(`^${capture}$`).exec(incoming)?.groups?.playerTag;
      assert.equal(tag, "QVLRCJQ00");
      assert.equal(rewrite.destination.replace(":playerTag", tag), "/api/profile-preview?game=bs&tag=QVLRCJQ00");
    }
  }
});

type RootPackage = {
  scripts: Record<string, string>;
};

async function readJson<T>(relativePath: string): Promise<T> {
  const contents = await readFile(path.join(repositoryRoot, relativePath), "utf8");
  return JSON.parse(contents) as T;
}

test("unified delivery orders apps in one collision-free output tree", () => {
  assert.deepEqual(deliveryApps.map((app) => app.id), ["statsconnect", "brawlstats", "clashcrown"]);
  assert.equal(deliveryApps[0]?.clearsUnifiedOutput, true);
  assert.equal(deliveryApps.filter((app) => app.clearsUnifiedOutput).length, 1);
  assert.equal(new Set(deliveryApps.map((app) => app.routePrefix)).size, deliveryApps.length);
  assert.equal(new Set(deliveryApps.map((app) => app.outputDirectory)).size, deliveryApps.length);

  for (const app of deliveryApps) {
    const resolvedOutput = path.resolve(repositoryRoot, app.outputDirectory);
    const relativeOutput = path.relative(path.resolve(repositoryRoot, "dist"), resolvedOutput);
    assert.equal(relativeOutput === "" || (!relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput)), true);
  }

  assert.equal(viteBasePath("statsconnect"), "/");
  assert.equal(viteBasePath("brawlstats"), "/bs/");
  assert.equal(viteBasePath("clashcrown"), "/cr/");
  assert.equal(viteOutputDirectory("statsconnect"), "../../dist");
  assert.equal(viteOutputDirectory("brawlstats"), "../../dist/bs");
  assert.equal(viteOutputDirectory("clashcrown"), "../../dist/cr");
});

test("public game origins use subdomains independently of build asset prefixes", () => {
  assert.equal(publicOrigin, "https://statsconnect.app");
  assert.deepEqual(
    deliveryApps.map((app) => publicAppOrigin(app)),
    [
      "https://statsconnect.app",
      "https://bs.statsconnect.app",
      "https://cr.statsconnect.app",
    ],
  );
  assert.deepEqual(unifiedPublicEnvironment, {
    VITE_STATSCONNECT_ORIGIN: "https://statsconnect.app",
    VITE_STATSCONNECT_SUPPORT_URL: "https://buy.stripe.com/bJedRaffk3lr7igdOG4AU00",
    VITE_STATSCONNECT_MONTHLY_SUPPORT_URL: "https://buy.stripe.com/28E28s8QW6xD9qobGy4AU01",
    VITE_STATSCONNECT_SUPPORT_PORTAL_URL: "https://billing.stripe.com/p/login/bJedRaffk3lr7igdOG4AU00",
    VITE_ADSENSE_CLIENT_ID: "ca-pub-4485799997262487",
    VITE_ADSENSE_BRAWL_HOME_SLOT: "1866622105",
    VITE_ADSENSE_CLASH_HOME_SLOT: "7993046756",
  });
});

test("the Vercel release plan deploys the Platform Backend only in production", () => {
  assert.deepEqual(planVercelRelease("production"), {
    command: {
      command: "pnpm",
      args: ["--filter", "@statsconnect/backend", "deploy:with-frontend"],
    },
    mode: "production-release",
  });

  for (const environment of [undefined, "preview", "development"]) {
    assert.deepEqual(planVercelRelease(environment), {
      command: { command: "pnpm", args: ["build:unified"] },
      mode: "frontend-preview",
    });
  }
});

test("the root Vercel Adapter matches the executable delivery topology", async () => {
  const vercel = await readJson<VercelConfiguration>("vercel.json");
  assert.equal(vercel.buildCommand, "pnpm build:vercel");
  assert.equal(vercel.outputDirectory, deliveryApps[0]?.outputDirectory);
  assert.equal(vercel.cleanUrls, true);
  assert.equal(vercel.functions["api/site-shell.ts"]?.includeFiles, "dist/index.html");

  assert.deepEqual(vercel.redirects, [
    ...["cr", "bs"].flatMap((game) => [
      {
        source: `/${game}`,
        has: [{ type: "host", value: "statsconnect.app" }],
        destination: `https://${game}.statsconnect.app/`,
        permanent: true,
      },
      {
        source: `/${game}/:path((?!assets/|images/|fonts/|.*\\.[^/]+$).*)`,
        has: [{ type: "host", value: "statsconnect.app" }],
        destination: `https://${game}.statsconnect.app/:path`,
        permanent: true,
      },
    ]),
    ...["stats.juanquenga.com", "www.statsconnect.app"].map((host) => ({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      destination: "https://statsconnect.app/:path*",
      permanent: true,
    })),
    ...["/bs/assets/brawlers/3d", "/assets/brawlers/3d", "/api/brawlers-3d"].map((prefix) => ({
      source: `${prefix}/:path*`,
      destination: "https://statsconnect-brawl-assets.juanquenga.workers.dev/:path*",
      permanent: false,
    })),
    { source: "/brawlstars", destination: "/bs", permanent: true },
    { source: "/brawlstars/:path*", destination: "/bs/:path*", permanent: true },
    { source: "/clashroyale", destination: "/cr", permanent: true },
    { source: "/clashroyale/:path*", destination: "/cr/:path*", permanent: true },
  ]);
  for (const redirect of vercel.redirects) {
    // Vercel forwards the incoming query when the destination does not define one.
    assert.equal(redirect.destination.includes("?"), false);
    if (redirect.source.endsWith("/:path*")) {
      assert.equal(redirect.destination.endsWith("/:path*"), true);
    }
  }

  const expectedGameRewrites = deliveryApps.slice(1).flatMap((app) => [
    { source: app.routePrefix, destination: "/" },
    { source: `${app.routePrefix}/:path*`, destination: "/" },
  ]);
  const seoFileRewrites = [
    { source: "/robots.txt", has: [{ type: "host", value: "cr.statsconnect.app" }], destination: "/seo/robots-cr.txt" },
    { source: "/robots.txt", has: [{ type: "host", value: "bs.statsconnect.app" }], destination: "/seo/robots-bs.txt" },
    { source: "/robots.txt", destination: "/seo/robots-hub.txt" },
    { source: "/sitemap.xml", has: [{ type: "host", value: "cr.statsconnect.app" }], destination: "/seo/sitemap-cr.xml" },
    { source: "/sitemap.xml", has: [{ type: "host", value: "bs.statsconnect.app" }], destination: "/seo/sitemap-bs.xml" },
    { source: "/sitemap.xml", destination: "/seo/sitemap-hub.xml" },
  ];
  // Derived from the shared route inventory; per-route coverage is audited in
  // seo-files.test.ts, this pins the exact position in the rewrite order.
  const siteShellRewrites = (["cr", "bs"] as const).flatMap((site) =>
    siteRoutes(site).map((route) => ({
      source: route.path,
      has: [{ type: "host", value: `${site}.statsconnect.app` }],
      destination: `/api/site-shell?game=${site}&route=${encodeURIComponent(route.path)}`,
    })),
  );
  assert.deepEqual(vercel.rewrites, [
    { source: "/api/profile-image", destination: "/api/profile-image" },
    { source: "/api/profile-preview", destination: "/api/profile-preview" },
    { source: "/players/:tag", has: [{ type: "host", value: "cr.statsconnect.app" }], destination: "/api/profile-preview?game=cr&tag=:tag" },
    { source: "/players", has: [{ type: "host", value: "bs.statsconnect.app" }, { type: "query", key: "tag", value: "(?:#|%23)?(?<playerTag>[0-9A-Za-z]{3,15})" }], destination: "/api/profile-preview?game=bs&tag=:playerTag" },
    { source: "/cr/players/:tag", destination: "/api/profile-preview?game=cr&tag=:tag" },
    { source: "/bs/players", has: [{ type: "query", key: "tag", value: "(?:#|%23)?(?<playerTag>[0-9A-Za-z]{3,15})" }], destination: "/api/profile-preview?game=bs&tag=:playerTag" },
    ...seoFileRewrites,
    ...siteShellRewrites,
    { source: "/service-worker.js", has: [{ type: "host", value: "bs.statsconnect.app" }], destination: "/bs/service-worker.js" },
    { source: "/manifest.webmanifest", has: [{ type: "host", value: "bs.statsconnect.app" }], destination: "/bs/subdomain.webmanifest" },
    ...expectedGameRewrites,
    // With cleanUrls on, "/index.html" is no longer a servable path; "/" is.
    { source: "/:path*", destination: "/" },
  ]);
  assert.deepEqual(vercel.headers.map((header) => header.source), [
    "/beta",
    "/beta",
    "/index.html",
    "/application-shell-manifest.json",
    ...deliveryApps.slice(1).map((app) => `${app.routePrefix}/beta`),
  ]);
});

test("profile preview runtime receives the public backend URL injected only during the frontend build", async (context) => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "statsconnect-preview-config-"));
  context.after(() => rm(fixtureRoot, { force: true, recursive: true }));
  await mkdir(path.join(fixtureRoot, "dist"));
  writeProfilePreviewConfiguration({
    VITE_CONVEX_URL: "https://example.convex.cloud",
    CONVEX_DEPLOY_KEY: "must-never-appear-in-public-output",
  }, fixtureRoot);
  const content = await readFile(path.join(fixtureRoot, profilePreviewConfigPath), "utf8");
  assert.deepEqual(JSON.parse(content), { convexUrl: "https://example.convex.cloud", convexSiteUrl: "https://example.convex.site" });
  assert.equal(content.includes("must-never"), false);
});

test("the root Vercel Adapter never caches the shell document or application manifest", async () => {
  const vercel = await readJson<VercelConfiguration>("vercel.json");
  assert.equal(vercel.trailingSlash, false);

  const noCacheSources = ["/index.html", "/application-shell-manifest.json"];
  for (const source of noCacheSources) {
    assert.deepEqual(vercel.headers.find((header) => header.source === source), {
      headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      source,
    });
  }
});

test("the unified build owns a generated application-shell manifest", () => {
  assert.equal(applicationShellManifestPath, "dist/application-shell-manifest.json");
});

test("the unified build leaves the root shell as the only application document", async (context) => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "statsconnect-delivery-"));
  context.after(async () => {
    await rm(fixtureRoot, { force: true, recursive: true });
  });

  const assetPaths = deliveryApps.slice(1).map((app) => path.join(app.outputDirectory, "assets", "entry.js"));
  for (const relativePath of [...standaloneApplicationDocumentPaths, ...assetPaths]) {
    const absolutePath = path.join(fixtureRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "fixture", "utf8");
  }

  removeStandaloneApplicationDocuments(fixtureRoot);

  for (const relativePath of standaloneApplicationDocumentPaths) {
    await assert.rejects(access(path.join(fixtureRoot, relativePath)));
  }
  for (const relativePath of assetPaths) {
    await access(path.join(fixtureRoot, relativePath));
  }
});

test("root scripts own the unified delivery entry points", async () => {
  const packageJson = await readJson<RootPackage>("package.json");
  assert.equal(packageJson.scripts["build:unified"], "node scripts/production-delivery.ts build");
  assert.equal(packageJson.scripts["build:vercel"], "node scripts/production-delivery.ts vercel");
  assert.equal(packageJson.scripts["deploy:unified"], "node scripts/production-delivery.ts deploy");

  for (const app of deliveryApps) {
    await assert.rejects(access(path.join(repositoryRoot, app.workspaceDirectory, "vercel.json")));
  }
});

test("game manifests resolve their icons inside their mounted subpaths", async () => {
  const clashManifest = await readJson<{ icons: Array<{ src: string }>; scope: string; start_url: string }>(
    "apps/clashcrown/public/site.webmanifest",
  );
  const brawlManifest = await readJson<{ icons: Array<{ src: string }>; scope: string; start_url: string }>(
    "apps/brawlstats/public/manifest.webmanifest",
  );

  for (const manifest of [brawlManifest, clashManifest]) {
    assert.equal(manifest.start_url, "./");
    assert.equal(manifest.scope, "./");
    assert.equal(manifest.icons.every((icon) => !icon.src.startsWith("/")), true);
  }
});
