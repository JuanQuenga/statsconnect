import { spawnSync } from "node:child_process";
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

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

export const publicOrigin = "https://stats.juanquenga.com";

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
    outputDirectory: "dist/brawlstars",
    packageName: "brawlstats.io",
    routePrefix: "/brawlstars",
    workspaceDirectory: "apps/brawlstats",
  },
  {
    clearsUnifiedOutput: false,
    id: "clashcrown",
    outputDirectory: "dist/clashroyale",
    packageName: "clash-crown",
    routePrefix: "/clashroyale",
    workspaceDirectory: "apps/clashcrown",
  },
] as const satisfies readonly DeliveryApp[];

export function deliveryApp(id: DeliveryAppId): DeliveryApp {
  const app = deliveryApps.find((candidate) => candidate.id === id);
  if (!app) throw new Error(`Unknown delivery app: ${id}`);
  return app;
}

export function publicAppOrigin(app: DeliveryApp): string {
  return app.routePrefix === "/" ? publicOrigin : `${publicOrigin}${app.routePrefix}`;
}

export const unifiedPublicEnvironment = {
  VITE_BRAWLSTATS_ORIGIN: publicAppOrigin(deliveryApp("brawlstats")),
  VITE_CLASHCROWN_ORIGIN: publicAppOrigin(deliveryApp("clashcrown")),
  VITE_STATSCONNECT_ORIGIN: publicAppOrigin(deliveryApp("statsconnect")),
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
