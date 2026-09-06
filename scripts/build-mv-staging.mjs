#!/usr/bin/env node
// Offline staging only. Never replaces the active verified local catalog.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReferenceBridge } from "./build-reference-asset-bridge.mjs";
import { readCsvFromGit } from "./import-mv-brawl-assets.mjs";
import { auditMvInventory } from "./audit-mv-inventory.mjs";

const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) options.set(process.argv[index], process.argv[index + 1]);
const capture = path.resolve(options.get("--capture") ?? ".generated/brawl-3d-full/capture");
const output = path.resolve(options.get("--output") ?? ".generated/brawl-3d-full/staging");
const mirror = options.get("--mirror");
if (!mirror) throw new Error("--mirror is required");
const commit = options.get("--commit") ?? "e39b51ecd3dc7be45ac7d2b1f0210bc4cea054f0";
const version = options.get("--version") ?? "68.250";
const state = options.has("--inventory") ? null : JSON.parse(await readFile(path.join(capture, ".mv-import-state.json"), "utf8"));
const inventory = options.has("--inventory") ? JSON.parse(await readFile(options.get("--inventory"), "utf8"))
  : { schemaVersion: 1, kind: "mv-reference-inventory", routes: Object.values(state.routes).flatMap((row) => row.entry ? [row.entry] : []) };
await mkdir(output, { recursive: true });
const charactersRows = await readCsvFromGit(mirror, commit, `${version}/csv_logic/characters.csv`);
const packageDirectory = path.join(output, "package");
const bridge = await buildReferenceBridge({ inventory, charactersRows, outputDir: packageDirectory,
  publicPrefix: "/assets/brawlers/3d", storagePrefix: "reference-bridge", contentAddressed: true, deduplicateAssets: true,
  auditOutput: path.join(output, "bridge.audit.json") });
const bridgePath = path.join(output, "bridge.json");
await writeFile(bridgePath, `${JSON.stringify(bridge, null, 2)}\n`);
const builder = fileURLToPath(new URL("./build-brawl-asset-manifest.mjs", import.meta.url));
const args = [builder, "--mirror", mirror, "--commit", commit, "--version", version, "--reference-bridge", bridgePath,
  "--allow-diagnostic-reference-assets", "--quarantine-reference-failures", "--converted-dir", packageDirectory,
  "--output", path.join(packageDirectory, "catalog.json"), "--shards-dir", path.join(packageDirectory, "catalog"),
  "--audit-output", path.join(output, "catalog.build.json")];
if (options.has("--api-catalog")) args.push("--api-catalog", options.get("--api-catalog"));
execFileSync(process.execPath, args, { stdio: "inherit" });
const audit = await auditMvInventory(inventory);
await writeFile(path.join(output, "capture-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ capturedRoutes: inventory.routes.length, bridgeCovered: bridge.coverage.coveredRoutes,
  bridgeUnavailable: bridge.coverage.unavailableRoutes, packageDirectory, sourceObjects: audit.objects.files, sourceBytes: audit.objects.bytes }));
