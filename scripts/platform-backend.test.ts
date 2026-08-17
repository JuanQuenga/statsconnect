import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const appDirectories = ["statsconnect", "brawlstats", "clashcrown"] as const;

type PackageManifest = {
  dependencies?: Record<string, string>;
  exports?: Record<string, string>;
  scripts?: Record<string, string>;
};

type TypeScriptConfig = {
  include?: string[];
};

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    readFileSync(path.join(workspaceRoot, relativePath), "utf8"),
  ) as T;
}

function readText(relativePath: string): string {
  return readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

test("only packages/backend contains executable Convex code", () => {
  for (const app of appDirectories) {
    assert.equal(
      existsSync(path.join(workspaceRoot, "apps", app, "convex")),
      false,
      `apps/${app}/convex must not exist`,
    );
    assert.equal(
      existsSync(path.join(workspaceRoot, "apps", app, "convex.json")),
      false,
      `apps/${app}/convex.json must not exist`,
    );
  }
});

test("frontend package scripts do not invoke Convex", () => {
  for (const app of appDirectories) {
    const manifest = readJson<PackageManifest>(`apps/${app}/package.json`);
    for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
      assert.doesNotMatch(
        command,
        /\bconvex(?:\s|$|\/)/,
        `apps/${app} script ${name} must not invoke Convex`,
      );
    }
  }

  const clashConfig = readJson<TypeScriptConfig>("apps/clashcrown/tsconfig.json");
  assert.equal(
    clashConfig.include?.some((entry) => entry.startsWith("convex/")) ?? false,
    false,
  );
});

test("developer tools point Convex commands at packages/backend", () => {
  assert.doesNotMatch(
    readText(".codex/environments/environment.toml"),
    /--filter (?:statsconnect|brawlstats\.io|clash-crown) (?:dev:backend|convex:dev)/,
  );
  assert.doesNotMatch(readText(".gitignore"), /apps\/\*\/convex/);

  for (const environmentFile of [
    "apps/brawlstats/.env.example",
    "apps/clashcrown/.env-example",
  ]) {
    assert.doesNotMatch(
      readText(environmentFile),
      /^(?:BRAW_|CLASH_|BETTER_AUTH_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|SITE_URL)=/m,
      `${environmentFile} must contain browser variables only`,
    );
  }
});

test("packages/backend exports Convex configuration and data types", () => {
  const convexConfig = readJson<{ functions?: string }>(
    "packages/backend/convex.json",
  );
  const manifest = readJson<PackageManifest>("packages/backend/package.json");

  assert.equal(convexConfig.functions, "convex/");
  assert.match(manifest.scripts?.dev ?? "", /^convex dev/);
  assert.match(manifest.scripts?.deploy ?? "", /^convex deploy/);
  assert.match(manifest.scripts?.typecheck ?? "", /convex\/tsconfig\.json/);
  assert.equal(manifest.exports?.["./data-model"], "./data-model.ts");
  assert.match(
    readText("packages/backend/data-model.ts"),
    /from "\.\/convex\/_generated\/dataModel"/,
  );
  assert.equal(
    existsSync(
      path.join(
        workspaceRoot,
        "packages/backend/convex/_generated/ai/guidelines.md",
      ),
    ),
    true,
  );
});
