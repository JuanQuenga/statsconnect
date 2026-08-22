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

function readOptionalText(relativePath: string): string | null {
  const filePath = path.join(workspaceRoot, relativePath);
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}

test("developer tools point Convex commands at packages/backend", () => {
  // .codex/environments/environment.toml is optional tooling configuration;
  // when present, its dev actions must not target app-local Convex backends.
  const codexEnvironment = readOptionalText(".codex/environments/environment.toml");
  if (codexEnvironment !== null) {
    assert.doesNotMatch(
      codexEnvironment,
      /--filter (?:statsconnect|brawlstats\.io|clash-crown) (?:dev:backend|convex:dev)/,
    );
  }
  assert.doesNotMatch(readText(".gitignore"), /apps\/\*\/convex/);

  for (const environmentFile of [
    "apps/brawlstats/.env.example",
    "apps/clashcrown/.env-example",
  ]) {
    const contents =
      readOptionalText(environmentFile) ??
      readOptionalText(environmentFile.replace(/\.env\.example$/, ".env-example"));
    assert.notEqual(contents, null, `${environmentFile} must exist`);
    assert.doesNotMatch(
      contents ?? "",
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

test("release gates use the complete workspace verification", () => {
  const rootPackage = readJson<{ packageManager?: string; scripts?: Record<string, string> }>(
    "package.json",
  );
  const expectedPackageManager = /^pnpm@(?<version>\d+\.\d+\.\d+)$/.exec(
    rootPackage.packageManager ?? "",
  )?.groups?.version;

  assert.equal(
    rootPackage.scripts?.verify,
    "node scripts/release-gate.ts",
    "the release gate must be executable from the root",
  );

  for (const workflowPath of [
    ".github/workflows/ci.yml",
    ".github/workflows/convex-production.yml",
  ]) {
    const workflow = readText(workflowPath);
    assert.equal(
      workflow.includes("run: pnpm verify"),
      true,
      `${workflowPath} must run the shared release gate`,
    );
    assert.equal(
      /(?:^|\n)\s*- name: [^\n]+\n\s*run: pnpm (typecheck|test)\n/.test(workflow),
      false,
      `${workflowPath} must not bypass the shared gate`,
    );
    assert.equal(
      /(?:^|\n)\s*version: (\d+\.\d+\.\d+)\n/.exec(workflow)?.[1],
      expectedPackageManager,
      `${workflowPath} must pin the project package manager version`,
    );
  }
});
