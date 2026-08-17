import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
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
  headers: Array<{ source: string }>;
  outputDirectory: string;
  rewrites: Array<{ destination: string; source: string }>;
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
  assert.equal(viteBasePath("brawlstats"), "/brawlstars/");
  assert.equal(viteBasePath("clashcrown"), "/clashroyale/");
  assert.equal(viteOutputDirectory("statsconnect"), "../../dist");
  assert.equal(viteOutputDirectory("brawlstats"), "../../dist/brawlstars");
  assert.equal(viteOutputDirectory("clashcrown"), "../../dist/clashroyale");
});

test("unified public origins are derived from the public route prefixes", () => {
  assert.equal(publicOrigin, "https://stats.juanquenga.com");
  assert.deepEqual(
    deliveryApps.map((app) => publicAppOrigin(app)),
    [
      "https://stats.juanquenga.com",
      "https://stats.juanquenga.com/brawlstars",
      "https://stats.juanquenga.com/clashroyale",
    ],
  );
  assert.deepEqual(unifiedPublicEnvironment, {
    VITE_BRAWLSTATS_ORIGIN: "https://stats.juanquenga.com/brawlstars",
    VITE_CLASHCROWN_ORIGIN: "https://stats.juanquenga.com/clashroyale",
    VITE_STATSCONNECT_ORIGIN: "https://stats.juanquenga.com",
  });

  assert.equal(
    new URL("players", `${unifiedPublicEnvironment.VITE_BRAWLSTATS_ORIGIN}/`).pathname,
    "/brawlstars/players",
  );
  assert.equal(
    new URL("players/CCDEMO", `${unifiedPublicEnvironment.VITE_CLASHCROWN_ORIGIN}/`).pathname,
    "/clashroyale/players/CCDEMO",
  );
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

  const expectedGameRewrites = deliveryApps.slice(1).flatMap((app) => [
    { source: app.routePrefix, destination: `/${app.outputDirectory}/index.html`.replace("/dist/", "/") },
    { source: `${app.routePrefix}/:path*`, destination: `/${app.outputDirectory}/index.html`.replace("/dist/", "/") },
  ]);
  assert.deepEqual(vercel.rewrites, [
    ...expectedGameRewrites,
    { source: "/:path*", destination: "/index.html" },
  ]);
  assert.deepEqual(
    vercel.headers.map((header) => header.source),
    deliveryApps.slice(1).map((app) => `${app.routePrefix}/beta`),
  );
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
