import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_ALIAS = "statsconnect-phone.vercel.app";
const DEFAULT_ORG_ID = "team_Mirov75riY8BJ2GfBHSoTDDz";
const DEFAULT_PROJECT_ID = "prj_jpclsnlfMxN1vKk3E1evvomloQK4";
const DEFAULT_SCOPE = "juanquengas-projects";
const PHONE_PREVIEW_ROUTES: readonly string[] = ["/", "/bs/", "/cr/", "/cr/leaderboards"];

export function deploymentUrlFromOutput(output: string): string {
  const matches = output.match(/https:\/\/[a-z0-9][a-z0-9.-]*\.vercel\.app(?:\/[^\s]*)?/gi);
  const candidate = matches?.at(-1);
  if (!candidate) {
    throw new Error("Vercel completed without printing a deployment URL.");
  }

  const url = new URL(candidate);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app")) {
    throw new Error(`Vercel printed an unexpected deployment URL: ${candidate}`);
  }
  return url.origin;
}

function environmentValue(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function runVercel(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["dlx", "vercel@59.5.0", ...args], {
      env: {
        ...process.env,
        VERCEL_ORG_ID: environmentValue("STATSCONNECT_VERCEL_ORG_ID", DEFAULT_ORG_ID),
        VERCEL_PROJECT_ID: environmentValue("STATSCONNECT_VERCEL_PROJECT_ID", DEFAULT_PROJECT_ID),
      },
      stdio: ["inherit", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.once("error", (error) => {
      reject(new Error(`Could not start pnpm for the Vercel CLI: ${error.message}`));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      const reason = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
      reject(new Error(`Vercel failed with ${reason}.`));
    });
  });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function requestPublicRoute(origin: string, route: string): Promise<void> {
  let url = new URL(route, origin);
  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    const response = await fetch(url, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(`${route} returned ${response.status} without a redirect location.`);
      }
      const redirectUrl = new URL(location, url);
      if (redirectUrl.origin !== origin) {
        throw new Error(`${route} redirected outside the phone preview to ${redirectUrl.origin}.`);
      }
      url = redirectUrl;
      continue;
    }
    if (response.status !== 200) {
      throw new Error(`${route} returned HTTP ${response.status}.`);
    }
    return;
  }
  throw new Error(`${route} exceeded the redirect limit.`);
}

async function verifyPublicPreview(origin: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await Promise.all(PHONE_PREVIEW_ROUTES.map((route) => requestPublicRoute(origin, route)));
      return;
    } catch (error: unknown) {
      lastError = error;
      if (attempt < 5) await wait(1_000);
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`The phone preview is not publicly reachable: ${detail}`);
}

async function main(): Promise<void> {
  const alias = environmentValue("STATSCONNECT_PHONE_PREVIEW_ALIAS", DEFAULT_ALIAS);
  const scope = environmentValue("STATSCONNECT_VERCEL_SCOPE", DEFAULT_SCOPE);

  console.log("Deploying the current checkout to the StatsConnect preview environment...");
  const deployOutput = await runVercel([
    "deploy",
    "--yes",
    "--target=preview",
    "--scope",
    scope,
  ]);
  const deploymentUrl = deploymentUrlFromOutput(deployOutput);

  console.log(`Moving ${alias} to ${deploymentUrl}...`);
  await runVercel(["alias", "set", deploymentUrl, alias, "--scope", scope]);
  const phonePreviewUrl = `https://${alias}`;
  console.log(`Verifying ${phonePreviewUrl}...`);
  await verifyPublicPreview(phonePreviewUrl);

  console.log(`\nPhone preview: ${phonePreviewUrl}`);
  console.log(`Immutable deployment: ${deploymentUrl}`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
