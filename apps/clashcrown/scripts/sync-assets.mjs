import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const ASSET_SHA = "b4530a1043b213ee2baf9c50a3d0d7fae22c2313";
const DATA_BRANCH = "master";
const ASSET_REPOSITORY = "RoyaleAPI/cr-api-assets";
const DATA_REPOSITORY = "RoyaleAPI/cr-api-data";
const ASSET_BASE_URL = `https://raw.githubusercontent.com/${ASSET_REPOSITORY}/${ASSET_SHA}`;
const DATA_BASE_URL = `https://raw.githubusercontent.com/${DATA_REPOSITORY}/${DATA_BRANCH}`;
const TREE_URL = `https://api.github.com/repos/${ASSET_REPOSITORY}/git/trees/${ASSET_SHA}?recursive=1`;
const IMAGE_ROOT = path.resolve(process.cwd(), "public/images");
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CONCURRENCY = 12;
const RETAINED_GENERATED_ASSETS = new Set(["cards/unknown.png"]);

async function fetchBytes(url, description) {
  const response = await fetch(url);
  if (response.status !== 200) {
    throw new Error(`${description}: HTTP ${response.status} (${url})`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Error(`${description}: response is not a PNG (${url})`);
  }
  return bytes;
}

async function fetchJson(url, description) {
  const response = await fetch(url);
  if (response.status !== 200) {
    throw new Error(`${description}: HTTP ${response.status} (${url})`);
  }
  return response.json();
}

function assetPath(sourcePath) {
  return `${ASSET_BASE_URL}/${sourcePath}`;
}

function addManifestEntry(manifest, sourcePath, destinationPath, category) {
  if (manifest.some((entry) => entry.destinationPath === destinationPath)) {
    throw new Error(`Duplicate destination in manifest: ${destinationPath}`);
  }
  manifest.push({ sourcePath, destinationPath, category });
}

function sourceFiles(tree, prefix) {
  return tree
    .filter((sourcePath) => sourcePath.startsWith(prefix) && sourcePath.endsWith(".png"))
    .sort();
}

async function buildManifest(treePaths) {
  const manifest = [];
  const tree = new Set(treePaths);

  for (const sourcePath of sourceFiles(treePaths, "cards-150/")) {
    addManifestEntry(manifest, sourcePath, `cards/${path.basename(sourcePath)}`, "cards");
  }
  for (const sourcePath of sourceFiles(treePaths, "cards-150-gold/")) {
    addManifestEntry(manifest, sourcePath, `cards-gold/${path.basename(sourcePath)}`, "card-gold");
  }
  for (const sourcePath of sourceFiles(treePaths, "arenas/")) {
    addManifestEntry(manifest, sourcePath, sourcePath, "arenas");
  }
  for (const sourcePath of sourceFiles(treePaths, "chests/")) {
    addManifestEntry(manifest, sourcePath, sourcePath, "chests");
  }

  if (tree.has("cards/card-champion-unknown.png")) {
    addManifestEntry(manifest, "cards/card-champion-unknown.png", "rarities/Champion.png", "rarities");
  }
  if (!tree.has("badges/NoClan.png")) {
    throw new Error("Pinned asset tree does not contain badges/NoClan.png");
  }
  addManifestEntry(manifest, "badges/NoClan.png", "clan-badges/0.png", "clan-badges");

  const badges = await fetchJson(
    `${DATA_BASE_URL}/docs/json/alliance_badges.json`,
    "RoyaleAPI clan badge data"
  );
  if (!Array.isArray(badges)) throw new Error("RoyaleAPI clan badge data is not an array");
  for (const badge of badges) {
    if (typeof badge?.id !== "number" || typeof badge.name !== "string") {
      throw new Error("RoyaleAPI clan badge data contains an invalid entry");
    }
    const sourcePath = `badges/${badge.name}.png`;
    if (!tree.has(sourcePath)) {
      throw new Error(`Badge data points to a missing pinned asset: ${sourcePath}`);
    }
    addManifestEntry(manifest, sourcePath, `clan-badges/${badge.id}.png`, "clan-badges");
  }

  return manifest;
}

async function syncEntry(entry, counts) {
  const bytes = await fetchBytes(assetPath(entry.sourcePath), entry.sourcePath);
  const destination = path.join(IMAGE_ROOT, entry.destinationPath);
  await mkdir(path.dirname(destination), { recursive: true });

  let existing;
  try {
    existing = await readFile(destination);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const result = existing?.equals(bytes) ? "unchanged" : existing ? "updated" : "added";
  if (result !== "unchanged") await writeFile(destination, bytes);
  counts[entry.category][result] += 1;
}

async function pruneRemovedCardAssets(manifest) {
  const expected = new Set([
    ...manifest.map((entry) => entry.destinationPath),
    ...RETAINED_GENERATED_ASSETS
  ]);
  let removed = 0;

  for (const directory of ["cards", "cards-gold"]) {
    const directoryPath = path.join(IMAGE_ROOT, directory);
    const files = await readdir(directoryPath);
    for (const file of files) {
      const destinationPath = `${directory}/${file}`;
      if (!file.endsWith(".png") || expected.has(destinationPath)) continue;
      await unlink(path.join(directoryPath, file));
      removed += 1;
    }
  }

  return removed;
}

async function main() {
  const treePayload = await fetchJson(TREE_URL, "RoyaleAPI asset tree");
  if (treePayload.truncated) throw new Error("RoyaleAPI asset tree response was truncated");
  const treePaths = treePayload.tree
    ?.filter((entry) => entry.type === "blob")
    .map((entry) => entry.path);
  if (!Array.isArray(treePaths)) throw new Error("RoyaleAPI asset tree has no file list");

  const manifest = await buildManifest(treePaths);
  const categories = [...new Set(manifest.map((entry) => entry.category))];
  const counts = Object.fromEntries(
    categories.map((category) => [category, { added: 0, updated: 0, unchanged: 0 }])
  );

  for (let index = 0; index < manifest.length; index += CONCURRENCY) {
    await Promise.all(manifest.slice(index, index + CONCURRENCY).map((entry) => syncEntry(entry, counts)));
  }
  const removed = await pruneRemovedCardAssets(manifest);

  console.log(`Synced ${manifest.length} PNGs from ${ASSET_REPOSITORY}@${ASSET_SHA}; removed=${removed}`);
  for (const category of categories) {
    const result = counts[category];
    console.log(
      `${category}: added=${result.added} updated=${result.updated} unchanged=${result.unchanged}`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
