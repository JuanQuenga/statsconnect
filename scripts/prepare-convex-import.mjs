import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const tableRenames = {
  brawl: {
    apiFetchLogs: "brawlApiFetchLogs",
    crawlTargets: "brawlCrawlTargets",
    pipelineCounters: "brawlPipelineCounters",
    pipelineRuns: "brawlPipelineRuns",
    playerDirectory: "brawlPlayerDirectory",
    seenBattles: "brawlSeenBattles",
  },
  clash: {
    apiFetchLogs: "clashApiFetchLogs",
    crawlTargets: "clashCrawlTargets",
    pipelineCounters: "clashPipelineCounters",
    pipelineRuns: "clashPipelineRuns",
    playerDirectory: "clashPlayerDirectory",
    seenBattles: "clashSeenBattles",
  },
};

const [source, snapshotDirectory, outputDirectory] = process.argv.slice(2);
if (!source || !snapshotDirectory || !outputDirectory || !(source in tableRenames)) {
  console.error(
    "Usage: node scripts/prepare-convex-import.mjs <brawl|clash> <snapshot-directory> <output-directory>",
  );
  process.exit(1);
}
if (path.resolve(outputDirectory) === path.resolve(snapshotDirectory)) {
  console.error(
    "The output directory must differ from the snapshot directory so the original snapshot stays untouched.",
  );
  process.exit(1);
}

const sourceKey = /** @type {keyof typeof tableRenames} */ (source);
const renames = tableRenames[sourceKey];
const entries = await readdir(snapshotDirectory, { withFileTypes: true });
const manifest = {};

await mkdir(outputDirectory, { recursive: true });

for (const entry of entries) {
  if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
  const documentsPath = path.join(snapshotDirectory, entry.name, "documents.jsonl");
  let contents;
  try {
    contents = await readFile(documentsPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
    throw error;
  }

  const targetTable = renames[entry.name] ?? entry.name;
  const rows = contents
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const row = JSON.parse(line);
      delete row._id;
      delete row._creationTime;
      return JSON.stringify(row);
    });

  await writeFile(
    path.join(outputDirectory, `${targetTable}.jsonl`),
    rows.length ? `${rows.join("\n")}\n` : "",
    "utf8",
  );
  manifest[targetTable] = rows.length;
}

await writeFile(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify({ source: sourceKey, tables: manifest }, null, 2)}\n`,
  "utf8",
);
