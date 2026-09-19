import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type DeliveryAppId = "statsconnect" | "brawlstats" | "clashcrown";

export type DeliveryApp = Readonly<{
  clearsUnifiedOutput: boolean;
  id: DeliveryAppId;
  outputDirectory: string;
  packageName: string;
  routePrefix: `/${string}`;
  workspaceDirectory: string;
}>;

export type DeliveryCommand = Readonly<{
  args: readonly string[];
  command: "pnpm";
}>;

export type VercelReleasePlan = Readonly<{
  command: DeliveryCommand;
  mode: "frontend-preview" | "production-release";
}>;

type ViteManifestEntry = Readonly<{
  css?: readonly string[];
  file: string;
  imports?: readonly string[];
  isEntry?: boolean;
}>;

type ViteManifest = Readonly<Record<string, ViteManifestEntry>>;

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

export const publicOrigin = "https://statsconnect.app";

export const deliveryApps = [
  {
    clearsUnifiedOutput: true,
    id: "statsconnect",
    outputDirectory: "dist",
    packageName: "statsconnect",
    routePrefix: "/",
    workspaceDirectory: "apps/statsconnect",
  },
  {
    clearsUnifiedOutput: false,
    id: "brawlstats",
    outputDirectory: "dist/bs",
    packageName: "brawlstats.io",
    routePrefix: "/bs",
    workspaceDirectory: "apps/brawlstats",
  },
  {
    clearsUnifiedOutput: false,
    id: "clashcrown",
    outputDirectory: "dist/cr",
    packageName: "clash-crown",
    routePrefix: "/cr",
    workspaceDirectory: "apps/clashcrown",
  },
] as const satisfies readonly DeliveryApp[];

export function deliveryApp(id: DeliveryAppId): DeliveryApp {
  const app = deliveryApps.find((candidate) => candidate.id === id);
  if (!app) throw new Error(`Unknown delivery app: ${id}`);
  return app;
}

export function publicAppOrigin(app: DeliveryApp): string {
  if (app.id === "brawlstats") return "https://bs.statsconnect.app";
  if (app.id === "clashcrown") return "https://cr.statsconnect.app";
  return publicOrigin;
}

export const unifiedPublicEnvironment = {
  VITE_STATSCONNECT_ORIGIN: publicAppOrigin(deliveryApp("statsconnect")),
} as const;

export const applicationShellManifestPath = "dist/application-shell-manifest.json";
export const standaloneApplicationDocumentPaths = deliveryApps
  .slice(1)
  .map((app) => path.join(app.outputDirectory, "index.html"));

const applicationShellMetadata = {
  brawlstats: {
    shellId: "brawl-stars",
    themeColor: "#0a101a",
    title: "StatsConnect · Brawl Stars statistics",
  },
  clashcrown: {
    shellId: "clash-royale",
    themeColor: "#15102a",
    title: "StatsConnect · Clash Royale statistics",
  },
} as const;

export function viteBasePath(id: DeliveryAppId): string {
  const prefix = deliveryApp(id).routePrefix;
  return prefix === "/" ? prefix : `${prefix}/`;
}

export function viteOutputDirectory(id: DeliveryAppId): string {
  const app = deliveryApp(id);
  return path.relative(
    path.join(repositoryRoot, app.workspaceDirectory),
    path.join(repositoryRoot, app.outputDirectory),
  );
}

export function planVercelRelease(vercelEnvironment: string | undefined): VercelReleasePlan {
  if (vercelEnvironment === "production") {
    return {
      command: {
        command: "pnpm",
        args: ["--filter", "@statsconnect/backend", "deploy:with-frontend"],
      },
      mode: "production-release",
    };
  }

  return {
    command: {
      command: "pnpm",
      args: ["build:unified"],
    },
    mode: "frontend-preview",
  };
}

function runCommand(command: DeliveryCommand, environment: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command.command, command.args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const outcome = result.signal ? `signal ${result.signal}` : `exit code ${result.status ?? "unknown"}`;
    throw new Error(`${command.command} ${command.args.join(" ")} failed with ${outcome}`);
  }
}

export function runUnifiedBuild(): void {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    ...unifiedPublicEnvironment,
    STATSCONNECT_UNIFIED_BUILD: "1",
  };

  for (const app of deliveryApps) {
    runCommand({ command: "pnpm", args: ["--filter", app.packageName, "build"] }, environment);
  }

  writeApplicationShellManifest();
  removeStandaloneApplicationDocuments();
}

export function removeStandaloneApplicationDocuments(rootDirectory = repositoryRoot): void {
  for (const documentPath of standaloneApplicationDocumentPaths) {
    rmSync(path.join(rootDirectory, documentPath), { force: true });
  }
}

function publicAssetPath(app: DeliveryApp, file: string): string {
  return `${app.routePrefix}/${file.replace(/^\/+/, "")}`;
}

function entryStyles(viteManifest: ViteManifest, key: string): string[] {
  const styles = new Set<string>();
  const visited = new Set<string>();

  function visit(entryKey: string): void {
    if (visited.has(entryKey)) return;
    visited.add(entryKey);
    const entry = viteManifest[entryKey];
    if (!entry) return;
    for (const style of entry.css ?? []) styles.add(style);
    for (const imported of entry.imports ?? []) visit(imported);
  }

  visit(key);
  return [...styles];
}

export function writeApplicationShellManifest(): void {
  const applications = Object.fromEntries(
    deliveryApps.slice(1).map((app) => {
      const metadata = applicationShellMetadata[app.id as keyof typeof applicationShellMetadata];
      const manifestPath = path.join(repositoryRoot, app.outputDirectory, ".vite/manifest.json");
      const viteManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ViteManifest;
      const entry = viteManifest["index.html"];
      if (!entry?.isEntry) throw new Error(`Missing Vite entry manifest for ${app.id}.`);

      return [
        metadata.shellId,
        {
          entry: publicAssetPath(app, entry.file),
          styles: entryStyles(viteManifest, "index.html").map((file) => publicAssetPath(app, file)),
          themeColor: metadata.themeColor,
          title: metadata.title,
        },
      ];
    }),
  );

  writeFileSync(
    path.join(repositoryRoot, applicationShellManifestPath),
    `${JSON.stringify({ version: 1, applications }, null, 2)}\n`,
    "utf8",
  );
}

function usage(): never {
  throw new Error("Usage: node scripts/production-delivery.ts <build|deploy|vercel>");
}

function main(argument: string | undefined): void {
  if (argument === "build") {
    runUnifiedBuild();
    return;
  }

  if (argument === "deploy") {
    runCommand(planVercelRelease("production").command);
    return;
  }

  if (argument === "vercel") {
    runCommand(planVercelRelease(process.env.VERCEL_ENV).command);
    return;
  }

  usage();
}

const invokedPath = process.argv[1];
if (invokedPath && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv[2]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
