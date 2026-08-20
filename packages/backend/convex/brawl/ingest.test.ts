import type * as IngestPolicy from "./ingestPolicy";

const { optionalBattleText } = (
  await import(new URL("./ingestPolicy.ts", import.meta.url).href)
) as typeof IngestPolicy;

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

equal(optionalBattleText(null), undefined, "null map names are omitted");
equal(optionalBattleText(undefined), undefined, "missing map names are omitted");
equal(optionalBattleText("   "), undefined, "blank map names are omitted");
equal(optionalBattleText("Gem Fort"), "Gem Fort", "valid map names are preserved");
console.log("ok - nullable upstream map names are omitted before Convex persistence");
