import { spawnSync } from "node:child_process";

const checks = [
  "pnpm typecheck",
  "pnpm test",
] as const satisfies readonly `${"pnpm"} ${string}`[];

for (const check of checks) {
  const [command, ...args] = check.split(" ");
  const result = spawnSync(command ?? "", args, {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
