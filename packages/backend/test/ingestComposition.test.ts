import { readFile } from "node:fs/promises";

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const ingestSource = await readFile(
  new URL("../convex/brawl/ingest.ts", import.meta.url),
  "utf8",
);

equal(
  ingestSource.includes("newTeamDelta(teamWon, ids)"),
  true,
  "folded team deltas retain the battle team composition",
);
equal(
  ingestSource.includes("brawlerIds: delta.brawlerIds"),
  true,
  "new team-stat rows persist their composition for downstream filtering",
);
console.log("ok - new team-stat rows retain brawler composition");
