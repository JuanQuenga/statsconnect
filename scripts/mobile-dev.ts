import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { hostname as systemHostname, networkInterfaces } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import QRCode from "qrcode";

const gatewayPort = 5173;
const brawlPort = 5174;
const clashPort = 5175;

export function selectLanIpv4(
  interfaces: ReturnType<typeof networkInterfaces>,
): string {
  const preferred = interfaces.en0?.find((address) => address.family === "IPv4" && !address.internal);
  if (preferred) return preferred.address;

  for (const addresses of Object.values(interfaces)) {
    const address = addresses?.find((candidate) => candidate.family === "IPv4" && !candidate.internal);
    if (address) return address.address;
  }
  throw new Error("No non-loopback IPv4 address was found. Connect this Mac to the iPhone's network and retry.");
}

export function localHostname(rawHostname: string): string {
  const hostname = rawHostname.trim().replace(/\.local\.?$/i, "");
  if (!hostname) throw new Error("The Mac local hostname is empty.");
  return `${hostname.toLowerCase()}.local`;
}

function readMacLocalHostname(): string {
  const result = spawnSync("scutil", ["--get", "LocalHostName"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim()
    ? result.stdout.trim()
    : systemHostname().split(".")[0] ?? "statsconnect-dev";
}

function missingConvexAuthVariables(): string[] {
  const result = spawnSync(
    "pnpm",
    ["--dir", "packages/backend", "exec", "convex", "env", "list", "--names-only"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Could not read the Convex development environment variable names.");
  }
  const configured = new Set(result.stdout.split("\n").map((name) => name.trim()).filter(Boolean));
  return ["BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"].filter(
    (name) => !configured.has(name),
  );
}

function setConvexSiteUrl(value: string): void {
  execFileSync(
    "pnpm",
    ["--dir", "packages/backend", "exec", "convex", "env", "set", "SITE_URL", value],
    { stdio: "inherit" },
  );
}

function createCertificate(options: {
  certificatePath: string;
  hostname: string;
  ipAddress: string;
  keyPath: string;
}): void {
  execFileSync("mkcert", ["-install"], { stdio: "inherit" });
  execFileSync(
    "mkcert",
    [
      "-cert-file",
      options.certificatePath,
      "-key-file",
      options.keyPath,
      "localhost",
      "127.0.0.1",
      "::1",
      options.hostname,
      options.ipAddress,
    ],
    { stdio: "inherit" },
  );
}

type DevProcess = {
  args: string[];
  name: string;
};

function startProcess(processConfig: DevProcess, environment: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn("pnpm", processConfig.args, {
    env: environment,
    stdio: "inherit",
  });
  child.once("error", (error) => {
    console.error(`${processConfig.name} could not start:`, error);
  });
  return child;
}

async function main(): Promise<void> {
  const ipAddress = selectLanIpv4(networkInterfaces());
  const hostname = localHostname(readMacLocalHostname());
  const origin = `https://${hostname}:${gatewayPort}`;
  const ipOrigin = `https://${ipAddress}:${gatewayPort}`;
  const certificateDirectory = path.resolve(".dev-certs");
  const certificatePath = path.join(certificateDirectory, "statsconnect-mobile.pem");
  const keyPath = path.join(certificateDirectory, "statsconnect-mobile-key.pem");
  const qrPath = path.join(certificateDirectory, "statsconnect-mobile-qr.png");
  mkdirSync(certificateDirectory, { recursive: true });

  createCertificate({ certificatePath, hostname, ipAddress, keyPath });
  await QRCode.toFile(qrPath, origin, { margin: 2, width: 640 });
  const terminalQr = await QRCode.toString(origin, { small: true, type: "terminal" });

  setConvexSiteUrl(origin);
  console.log(`\nStatsConnect mobile dev: ${origin}`);
  console.log(`IP fallback: ${ipOrigin}`);
  console.log(`QR image: ${qrPath}`);
  console.log(terminalQr);
  console.log("The iPhone must trust the mkcert root CA before Google login will work.");
  console.log(`Root CA: ${execFileSync("mkcert", ["-CAROOT"], { encoding: "utf8" }).trim()}/rootCA.pem\n`);
  const missingAuthVariables = missingConvexAuthVariables();
  if (missingAuthVariables.length > 0) {
    console.warn(`Google login is disabled until the Convex dev deployment has: ${missingAuthVariables.join(", ")}.\n`);
  }

  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    STATSCONNECT_MOBILE_CERT: certificatePath,
    STATSCONNECT_MOBILE_DEV: "1",
    STATSCONNECT_MOBILE_KEY: keyPath,
    STATSCONNECT_BRAWL_DEV_ORIGIN: `http://127.0.0.1:${brawlPort}`,
    STATSCONNECT_CLASH_DEV_ORIGIN: `http://127.0.0.1:${clashPort}`,
    VITE_STATSCONNECT_MOBILE_DEV: "1",
    VITE_STATSCONNECT_ORIGIN: origin,
  };
  const processes: DevProcess[] = [
    { name: "Convex backend", args: ["--filter", "@statsconnect/backend", "dev", "--codegen", "disable"] },
    {
      name: "HTTPS gateway",
      args: ["--filter", "statsconnect", "dev", "--host", "0.0.0.0", "--port", String(gatewayPort), "--strictPort"],
    },
    {
      name: "Brawl Stars",
      args: ["--filter", "brawlstats.io", "dev", "--host", "127.0.0.1", "--port", String(brawlPort), "--strictPort", "--base", "/bs/"],
    },
    {
      name: "Clash Royale",
      args: ["--filter", "clash-crown", "dev", "--host", "127.0.0.1", "--port", String(clashPort), "--strictPort", "--base", "/cr/"],
    },
  ];
  const children = processes.map((processConfig) => startProcess(processConfig, environment));
  let stopping = false;
  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  const exit = await Promise.race(children.map((child, index) => new Promise<{
    code: number | null;
    index: number;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, index, signal }));
  })));
  if (!stopping) {
    console.error(`${processes[exit.index]?.name ?? "A dev process"} exited unexpectedly.`);
    stop("SIGTERM");
    process.exitCode = exit.code && exit.code !== 0 ? exit.code : 1;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
