#!/usr/bin/env node
// Reconcile identities from an atomic capture snapshot without network or asset writes.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadMvSourceTables, pageToInventoryEntry, parseCatalogEntries, routeSlug } from "./import-mv-brawl-assets.mjs";
import { verifiedBytes } from "./mv-download-cache.mjs";
import { linkReferenceBrawler, preserveReferenceVariants } from "./mv-skin-identity.mjs";

const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) options.set(process.argv[index], process.argv[index + 1]);
const capture = path.resolve(options.get("--capture") ?? ".generated/brawl-3d-full/capture");
const output = options.get("--output");
const mirror = options.get("--mirror");
if (!output || !mirror) throw new Error("--mirror and a separate --output are required");
if (path.resolve(output).startsWith(`${capture}${path.sep}`)) throw new Error("reconciliation output must be outside the live capture directory");
const commit = options.get("--commit") ?? "e39b51ecd3dc7be45ac7d2b1f0210bc4cea054f0";
const version = options.get("--version") ?? "68.250";
const historyVersions = String(options.get("--history-versions") ?? "67.264,CN-55.3.1").split(",").filter(Boolean);
const tables = await loadMvSourceTables({ mirror, commit, version, historyVersions });
const publicBrawlers = options.has("--api-catalog") ? JSON.parse(await readFile(options.get("--api-catalog"), "utf8")) : [];
if (!Array.isArray(publicBrawlers)) throw new Error("API catalog must be an array");
const state = JSON.parse(await readFile(path.join(capture, ".mv-import-state.json"), "utf8"));
const enabled = parseCatalogEntries(await readFile(path.join(capture, "inventory.html"), "utf8"));
const routes = [];
const errors = [];
for (const value of Object.values(state.routes)) {
  if (!value.entry) continue;
  const entry = value.entry;
  try {
    if (!value.pageCapture?.path) throw new Error("page was not captured");
    const page = await verifiedBytes(value.pageCapture.path, value.pageCapture.sha256);
    if (!page) throw new Error("page capture hash does not match");
    const fresh = pageToInventoryEntry({ ...tables, html: page.toString("utf8"), route: entry.route, displayName: entry.displayName, cdnOrigin: "https://cdn.brawlbox.com.cn" });
    const reconciled = { ...entry, brawlerId: fresh.brawlerId, character: fresh.character, skinId: fresh.skinId, identity: fresh.identity };
    routes.push(linkReferenceBrawler(reconciled, { publicBrawlers, characters: tables.characters }));
  } catch (error) {
    routes.push(entry);
    errors.push({ route: entry.route, reason: String(error) });
  }
}
routes.splice(0, routes.length, ...preserveReferenceVariants(routes));
const inventory = { schemaVersion: 1, kind: "mv-reference-inventory", source: { inventoryUrl: state.inventoryUrl, metadata: { commit, version, historyVersions } },
  inventoryCounts: { enabledRows: enabled.length, uniqueEnabledRoutes: new Set(enabled.map((entry) => routeSlug(entry.displayName))).size, selectedRoutes: routes.length }, routes, reconciliationErrors: errors };
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(output, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(JSON.stringify({ routes: routes.length, mapped: routes.filter((entry) => entry.identity?.kind === "matched").length, referenceLinked: routes.filter((entry) => entry.identity?.kind === "reference-only").length, historical: routes.filter((entry) => entry.identity?.sourceVersion).length, unresolved: routes.filter((entry) => !["matched", "reference-only"].includes(entry.identity?.kind)).map((entry) => ({ route: entry.route, reason: entry.identity?.reason })), errors }));
