#!/usr/bin/env node
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function collectAssets(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (typeof value.path === "string" && /^[a-f0-9]{64}$/.test(value.sha256 ?? "")) result.push(value);
  else for (const child of Object.values(value)) collectAssets(child, result);
  return result;
}
const objectKey = (asset) => `${asset.sha256}${path.extname(asset.path)}`;
function firstLoadAssets(entry, preferIdle = false) {
  const assets = entry.assets ?? {};
  const animationKey = preferIdle && assets.animations?.idle ? "idle" : Object.keys(assets.animations ?? {})[0];
  const animation = assets.animations?.[animationKey];
  const faceKey = entry.animationMetadata?.[animationKey]?.face;
  const face = faceKey === "face" ? assets.face : assets.faces?.[faceKey];
  const requested = [assets.geometry, assets.texture, animation];
  if (face) requested.push(face, assets.faceAtlases?.[face.faceAtlasKey] ?? assets.faceAtlas);
  for (const slot of entry.materialSlots ?? []) for (const key of ["diffuseTexture", "diffuseLightmap", "specularLightmap", "stencilTexture"]) {
    const reference = slot[key];
    if (reference === "texture") requested.push(assets.texture);
    else if (typeof reference === "string" && reference.startsWith("material:")) requested.push(assets.materials?.[reference.slice(9)]);
  }
  return [...new Map(requested.flatMap((asset) => collectAssets(asset)).map((asset) => [objectKey(asset), asset])).values()];
}
const percentile = (sorted, fraction) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] : 0;

/** Measure captured bytes, never estimates extrapolated from one example skin. */
export async function auditMvInventory(document) {
  const stateRows = !Array.isArray(document.routes) ? Object.entries(document.routes ?? {}).map(([route, value]) => ({ route, ...value })) : null;
  const routes = stateRows ? stateRows.flatMap((value) => value.entry ? [value.entry] : []) : document.routes;
  const assets = new Map();
  let logicalBytes = 0;
  let logicalReferences = 0;
  const routeReports = [];
  const missingFiles = [];
  for (const entry of routes) {
    const references = collectAssets(entry.assets);
    for (const asset of references) {
      const key = objectKey(asset);
      if (!assets.has(key)) {
        try { assets.set(key, { ...asset, bytes: (await stat(asset.path)).size }); }
        catch { missingFiles.push(asset.path); assets.set(key, { ...asset, bytes: 0 }); }
      }
      logicalBytes += assets.get(key).bytes;
      logicalReferences++;
    }
    const startup = firstLoadAssets(entry);
    const idle = firstLoadAssets(entry, true);
    routeReports.push({ route: entry.route, displayName: entry.displayName, skinId: entry.skinId, brawlerId: entry.brawlerId,
      entityKind: entry.identity?.entityKind ?? null, identity: entry.identity?.kind ?? "unknown",
      captured: !entry.reason, reason: entry.reason ?? null,
      assetReferences: references.length, startupRequests: startup.length,
      startupBytes: startup.reduce((sum, asset) => sum + (assets.get(objectKey(asset))?.bytes ?? 0), 0),
      idleViewBytes: idle.reduce((sum, asset) => sum + (assets.get(objectKey(asset))?.bytes ?? 0), 0),
      animationChoices: Object.keys(entry.assets?.animations ?? {}).length,
    });
  }
  const objects = [...assets.values()];
  const storedBytes = objects.reduce((sum, asset) => sum + asset.bytes, 0);
  const largest = [...objects].sort((a, b) => b.bytes - a.bytes).slice(0, 15).map(({ path, sourceUrl, bytes, sha256 }) => ({ path, sourceUrl, bytes, sha256 }));
  const startupBytes = routeReports.filter((entry) => entry.captured).map((entry) => entry.startupBytes).sort((a, b) => a - b);
  const startupRequests = routeReports.filter((entry) => entry.captured).map((entry) => entry.startupRequests).sort((a, b) => a - b);
  const idleBytes = routeReports.filter((entry) => entry.captured).map((entry) => entry.idleViewBytes).sort((a, b) => a - b);
  const byExtension = {};
  for (const asset of objects) {
    const extension = path.extname(asset.path);
    byExtension[extension] ??= { files: 0, bytes: 0 };
    byExtension[extension].files++; byExtension[extension].bytes += asset.bytes;
  }
  return { measuredAt: new Date().toISOString(), inventoryCounts: document.inventoryCounts ?? null,
    visitedRoutes: routes.length, inProgressRoutes: stateRows?.filter((row) => !row.entry).length ?? 0,
    capturedRoutes: routeReports.filter((entry) => entry.captured).length,
    mappedRoutes: routeReports.filter((entry) => entry.identity === "matched").length,
    referenceLinkedRoutes: routeReports.filter((entry) => entry.identity === "reference-only").length,
    ambiguousRoutes: routeReports.filter((entry) => entry.identity === "ambiguous").length,
    unmappedRoutes: routeReports.filter((entry) => entry.identity === "unmapped" || entry.identity === "unknown").length,
    defaultRoutes: routeReports.filter((entry) => /\(Default\)$/.test(entry.displayName ?? "")).length,
    petRoutes: routeReports.filter((entry) => /\(Pet\)$/i.test(entry.displayName ?? "")).length,
    objects: { files: objects.length, bytes: storedBytes, logicalReferences, logicalBytes, savedBytes: logicalBytes - storedBytes, byExtension, largest },
    firstLoad: { definition: "Geometry, primary texture, first declared animation, its face pair, and viewer-used material textures; unique URLs only. Excludes catalog metadata, app JavaScript and other page data.",
      bytes: { p50: percentile(startupBytes, 0.5), p95: percentile(startupBytes, 0.95), max: startupBytes.at(-1) ?? 0 },
      requests: { p50: percentile(startupRequests, 0.5), p95: percentile(startupRequests, 0.95), max: startupRequests.at(-1) ?? 0 } },
    idleFirstAlternative: { bytes: { p50: percentile(idleBytes, 0.5), p95: percentile(idleBytes, 0.95), max: idleBytes.at(-1) ?? 0 } },
    hosting: { cloudflareStaticObjectLimit: 20000, cloudflareStaticFileLimit: 25 * 1024 * 1024,
      oversizedStaticObjects: objects.filter((asset) => asset.bytes > 25 * 1024 * 1024).map(({ path, bytes }) => ({ path, bytes })),
      staticObjectCountFitsBeforeCatalogMetadata: objects.length <= 20000,
      singleReleaseWithinR2FreeStorage: storedBytes <= 10 * 1000 * 1000 * 1000,
      caveat: "Object counts exclude catalog metadata. R2 storage allowance is shared with other stored data; operations and retained releases also affect billing." },
    missingFiles, routes: routeReports,
    completeness: "Captured and mapped are not equivalent to verified runtime assembly or visual parity." };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: node scripts/audit-mv-inventory.mjs <inventory-or-state.json> [report.json]");
  const report = await auditMvInventory(JSON.parse(await readFile(input, "utf8")));
  if (process.argv[3]) { await mkdir(path.dirname(path.resolve(process.argv[3])), { recursive: true }); await writeFile(process.argv[3], `${JSON.stringify(report, null, 2)}\n`); }
  const { routes, ...summary } = report;
  console.log(JSON.stringify(summary, null, 2));
  if (report.missingFiles.length) process.exitCode = 1;
}
