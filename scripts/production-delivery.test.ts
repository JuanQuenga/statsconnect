import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applicationShellManifestPath,
  deliveryApps,
  planVercelRelease,
  publicAppOrigin,
  publicOrigin,
  unifiedPublicEnvironment,
  viteBasePath,
  viteOutputDirectory,
} from "./production-delivery.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

type VercelConfiguration = {
  buildCommand: string;
  headers: Array<{ headers: Array<{ key: string; value: string }>; source: string }>;
  outputDirectory: string;
  redirects: Array<{ destination: string; permanent: boolean; source: string }>;
  rewrites: Array<{ destination: string; source: string }>;
  trailingSlash: boolean;
};

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

test("unified public origins are derived from the public route prefixes", () => {
  assert.equal(publicOrigin, "https://stats.juanquenga.com");
  assert.deepEqual(
    deliveryApps.map((app) => publicAppOrigin(app)),
    [
      "https://stats.juanquenga.com",
      "https://stats.juanquenga.com/bs",
      "https://stats.juanquenga.com/cr",
    ],
  );
  assert.deepEqual(unifiedPublicEnvironment, {
    VITE_STATSCONNECT_ORIGIN: "https://stats.juanquenga.com",
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

  assert.deepEqual(vercel.redirects, [
    { source: "/brawlstars", destination: "/bs", permanent: true },
    { source: "/brawlstars/:path*", destination: "/bs/:path*", permanent: true },
    { source: "/clashroyale", destination: "/cr", permanent: true },
    { source: "/clashroyale/:path*", destination: "/cr/:path*", permanent: true },
  ]);
  for (const redirect of vercel.redirects) {
    assert.equal(redirect.permanent, true);
    // Vercel forwards the incoming query when the destination does not define one.
    assert.equal(redirect.destination.includes("?"), false);
    if (redirect.source.endsWith("/:path*")) {
      assert.equal(redirect.destination.endsWith("/:path*"), true);
    }
  }

  const expectedGameRewrites = deliveryApps.slice(1).flatMap((app) => [
    { source: app.routePrefix, destination: "/index.html" },
    { source: `${app.routePrefix}/:path*`, destination: "/index.html" },
  ]);
  const expectedBrawlerAssetRewrites = [
    { source: "/bs/assets/brawlers/3d/:path*", destination: "/api/brawlers-3d/:path*" },
    { source: "/assets/brawlers/3d/:path*", destination: "/api/brawlers-3d/:path*" },
  ];
  assert.deepEqual(vercel.rewrites, [
    ...expectedBrawlerAssetRewrites,
    ...expectedGameRewrites,
    { source: "/:path*", destination: "/index.html" },
  ]);
  assert.deepEqual(vercel.headers.map((header) => header.source), [
    "/index.html",
    "/application-shell-manifest.json",
    ...deliveryApps.slice(1).map((app) => `${app.routePrefix}/beta`),
  ]);
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
