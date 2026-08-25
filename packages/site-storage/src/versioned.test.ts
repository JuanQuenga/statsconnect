import assert from "node:assert/strict";
import { test } from "node:test";
import { readVersioned, writeVersioned } from "./versioned.ts";

test("round-trips versioned data", () => {
  const raw = writeVersioned(2, { tags: ["#ABC"] });
  const parsed = readVersioned<{ tags: string[] }>(raw, 2, (data) => data as { tags: string[] });
  assert.deepEqual(parsed, { tags: ["#ABC"] });
});

test("rejects payloads written by other versions", () => {
  const raw = writeVersioned(1, { old: true });
  const parsed = readVersioned(raw, 2, () => {
    throw new Error("parser should not run");
  });
  assert.equal(parsed, undefined);
});

test("tolerates corrupt or non-envelope input", () => {
  assert.equal(readVersioned("not json", 1, () => "x"), undefined);
  assert.equal(readVersioned(JSON.stringify({ data: 1 }), 1, () => "x"), undefined);
  assert.equal(readVersioned(null, 1, () => "x"), undefined);
});
