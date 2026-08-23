#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function args() {
  const values = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=", 2);
    values.set(key, inline ?? process.argv[++index]);
  }
  return values;
}

function directoryStats(root) {
  if (!root || !existsSync(root)) return { files: 0, bytes: 0 };
  const walk = (directory) => readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return add(total, walk(file));
    if (entry.name.endsWith(".json")) return total;
    return add(total, { files: 1, bytes: statSync(file).size });
  }, { files: 0, bytes: 0 });
  return walk(root);
}

function add(left, right) {
  return { files: left.files + right.files, bytes: left.bytes + right.bytes };
}

function readyUrls(value, urls = []) {
  if (!value || typeof value !== "object") return urls;
  if (Array.isArray(value)) return value.flatMap((item) => readyUrls(item, urls));
  for (const [key, child] of Object.entries(value)) {
    if (key === "url" && typeof child === "string") urls.push(child);
    else readyUrls(child, urls);
  }
  return urls;
}

function sameOrigin(url) {
  return /^\/[^\\/][^\\]*$/.test(url) && !url.startsWith("//");
}

function entryByPublicName(entries, name) {
  return entries.find((entry) => entry.publicCharacter === name || entry.character === name);
}

const options = args();
const manifestPath = options.get("manifest");
if (!manifestPath) throw new Error("--manifest is required");
const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(manifestPath, "utf8"));
const entries = Array.isArray(manifest.skins) ? manifest.skins : (Array.isArray(manifest.releasedSkins) ? manifest.releasedSkins : []);
const readyEntries = entries.filter((entry) => entry.sourceReadiness?.readyForConversion === true);
const releasedEntries = entries.filter((entry) => entry.released === true);
const samplePackage = options.get("sample-package");
const sample = directoryStats(samplePackage);
const sampleSkinCount = Math.max(1, Number(options.get("sample-skins")) || 1);
const projected = {
  skins: readyEntries.length,
  files: Math.ceil(sample.files / sampleSkinCount * readyEntries.length),
  bytes: Math.ceil(sample.bytes / sampleSkinCount * readyEntries.length),
  mebibytes: Number((sample.bytes / sampleSkinCount * readyEntries.length / 1048576).toFixed(2)),
};
const urls = readyUrls(manifest);
const runtimeIndexPath = options.get("runtime-index");
const runtimeShardsDir = options.get("shards-dir");
const runtimeIndex = runtimeIndexPath ? JSON.parse(await (await import("node:fs/promises")).readFile(runtimeIndexPath, "utf8")) : null;
const runtimeShardPaths = runtimeShardsDir && runtimeIndex && Array.isArray(runtimeIndex.brawlers)
  ? runtimeIndex.brawlers.map((entry) => typeof entry?.shard === "string" ? path.join(runtimeShardsDir, path.basename(entry.shard)) : null).filter((file) => file !== null && existsSync(file))
  : [];
const runtimeShardValues = await Promise.all(runtimeShardPaths.map(async (file) => JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8"))));
const runtimeUrls = [...(runtimeIndex ? readyUrls(runtimeIndex) : []), ...runtimeShardValues.flatMap((value) => readyUrls(value))];
const allUrls = [...urls, ...runtimeUrls];
const invalidUrls = allUrls.filter((url) => !sameOrigin(url));
const sampleMatrix = [
  ["humanoid-held-weapon", entryByPublicName(releasedEntries, "Crow")],
  ["non-humanoid", entryByPublicName(releasedEntries, "Tick")],
  ["model-authored-face", releasedEntries.find((entry) => Object.values(entry.faces ?? {}).every((face) => !face.symbol))],
  ["external-face", releasedEntries.find((entry) => Object.values(entry.faces ?? {}).some((face) => face.symbol))],
  ["composite-model", releasedEntries.find((entry) => entry.source?.compositeModel === true)],
].map(([kind, entry]) => ({
  kind,
  skinId: entry?.skinId ?? null,
  brawlerId: entry?.brawlerId ?? null,
  publicCharacter: entry?.publicCharacter ?? entry?.character ?? null,
  sourceReady: entry?.sourceReadiness?.readyForConversion === true,
  plannedModel: Boolean(entry?.conversionPlan?.model),
  plannedIdle: Boolean(entry?.conversionPlan?.animations?.IdleAnim),
  unavailableReasons: entry?.unavailableReasons ?? ["representative-not-found"],
}));
const report = {
  method: sample.files > 0
    ? "single-skin empirical extrapolation from --sample-package; actual output varies by geometry, animation, texture, and face atlas reuse"
    : "no sample package supplied; byte estimate unavailable",
  sourceReadySkins: readyEntries.length,
  releasedSourceReadySkins: entries.filter((entry) => entry.released === true && entry.sourceReadiness?.readyForConversion === true).length,
  sample,
  projected,
  range: sample.bytes > 0 ? {
    lowBytes: Math.ceil(projected.bytes * 0.5),
    highBytes: Math.ceil(projected.bytes * 2),
    lowMebibytes: Number((projected.bytes * 0.5 / 1048576).toFixed(2)),
    highMebibytes: Number((projected.bytes * 2 / 1048576).toFixed(2)),
    basis: "0.5x-2x sample size sensitivity band; not a conversion result",
  } : null,
  sameOrigin: { checkedUrls: allUrls.length, invalidUrls },
  sampleMatrix,
};
if (options.get("converted-dir")) {
  const root = options.get("converted-dir");
  const missingFiles = allUrls.filter((url) => !existsSync(path.join(root, url.replace(/^\/assets\/brawlers\/3d\//, ""))));
  report.convertedDir = { root, checkedReadyUrls: allUrls.length, missingFiles };
}
if (runtimeIndexPath) {
  const shardSizes = runtimeShardPaths.map((file) => statSync(file).size).sort((left, right) => left - right);
  const percentile = (fraction) => shardSizes.length === 0 ? 0 : shardSizes[Math.min(shardSizes.length - 1, Math.ceil(shardSizes.length * fraction) - 1)];
  report.runtimeCatalog = {
    indexBytes: statSync(runtimeIndexPath).size,
    shardCount: shardSizes.length,
    totalBytes: shardSizes.reduce((total, bytes) => total + bytes, 0),
    maxShardBytes: shardSizes.at(-1) ?? 0,
    p95ShardBytes: percentile(0.95),
    checkedReadyUrls: runtimeUrls.length,
  };
}
console.log(JSON.stringify(report, null, 2));
