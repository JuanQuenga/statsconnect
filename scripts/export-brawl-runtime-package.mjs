#!/usr/bin/env node
import { readFile, readdir, mkdir, copyFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function filesBelow(directory, prefix = "") {
  let entries;
  try { entries = await readdir(path.join(directory, prefix), { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(directory, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`package contains a non-regular file: ${relative}`);
  }
  return files;
}

/** Export only the current index's reachable assets, not stale staging/cache files. */
export async function exportRuntimePackage({ source, output, legacyDirectory }) {
  source = path.resolve(source); output = path.resolve(output);
  if (source === output || output.startsWith(`${source}${path.sep}`)) throw new Error("release output must be separate from staging input");
  const wanted = new Map([["catalog.json", path.join(source, "catalog.json")]]);
  const local = (url) => {
    const relative = url.replace(/^\/(?:bs\/)?assets\/brawlers\/3d\//, "");
    if (relative === url) throw new Error(`not a brawler asset URL: ${url}`);
    const file = path.resolve(source, decodeURIComponent(relative));
    if (!file.startsWith(`${source}${path.sep}`)) throw new Error(`asset escapes source package: ${url}`);
    return [path.relative(source, file), file];
  };
  const collect = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.kind === "ready" && typeof value.url === "string") wanted.set(...local(value.url));
    for (const child of Object.values(value)) collect(child);
  };
  const index = JSON.parse(await readFile(wanted.get("catalog.json"), "utf8"));
  if (index.kind !== "index" || !Array.isArray(index.brawlers)) throw new Error("expected a sharded runtime catalog");
  for (const brawler of index.brawlers) {
    const [relative, file] = local(brawler.shard);
    wanted.set(relative, file);
    collect(JSON.parse(await readFile(file, "utf8")));
  }
  if (legacyDirectory) {
    for (const file of await filesBelow(legacyDirectory)) {
      if (/^\d+\.(glb|webp|png)$/.test(file)) {
        if (wanted.has(file)) throw new Error(`legacy fallback collides with runtime asset: ${file}`);
        wanted.set(file, path.join(legacyDirectory, file));
      }
    }
  }
  const extras = (await filesBelow(output)).filter((file) => !wanted.has(file));
  if (extras.length) throw new Error(`release output has unrelated files; use a fresh directory: ${extras.slice(0, 5).join(", ")}`);
  const directories = new Set();
  const files = [];
  for (const [relative, file] of wanted) {
    const destination = path.join(output, relative);
    const directory = path.dirname(destination);
    if (!directories.has(directory)) { await mkdir(directory, { recursive: true }); directories.add(directory); }
    await copyFile(file, destination);
    const bytes = (await stat(destination)).size;
    files.push({ relative, bytes });
  }
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const oversized = files.filter((file) => file.bytes > 25 * 1024 * 1024);
  return { output, files: files.length, bytes, maxFileBytes: Math.max(0, ...files.map((file) => file.bytes)),
    cloudflareStaticFits: files.length <= 20000 && oversized.length === 0, oversized,
    singleReleaseWithinR2FreeStorage: bytes <= 10 * 1000 * 1000 * 1000,
    note: "Local candidate package only. CPU verification and provenance/visual review remain separate from publication." };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = new Map();
  for (let index = 2; index < process.argv.length; index += 2) options.set(process.argv[index], process.argv[index + 1]);
  if (!options.has("--source") || !options.has("--output")) throw new Error("--source and --output are required");
  const report = await exportRuntimePackage({ source: options.get("--source"), output: options.get("--output"), legacyDirectory: options.get("--legacy-dir") });
  if (options.has("--report")) await writeFile(options.get("--report"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
