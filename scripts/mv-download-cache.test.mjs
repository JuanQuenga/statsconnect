import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { acquireImportLock, fetchWithRetry } from "./mv-download-cache.mjs";

test("one importer owns a state file and releases it for the next run", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "mv-lock-test-"));
  try {
    const state = path.join(directory, "state.json");
    const release = await acquireImportLock(state);
    await assert.rejects(acquireImportLock(state), /already running/);
    await release();
    await assert.rejects(access(`${state}.lock`));
    await (await acquireImportLock(state))();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("overlapping transfers share one paced request queue", async () => {
  const starts = [];
  const gate = { nextRequestAt: 0 };
  const fetchImpl = async () => { starts.push(Date.now()); return new Response("ok"); };
  const options = { headers: {}, maxRetries: 0, retryDelayMs: 0, requestDelayMs: 20, requestGate: gate };
  await Promise.all([1, 2, 3].map((id) => fetchWithRetry(fetchImpl, `https://example.invalid/${id}`, options)));
  assert.equal(starts.length, 3);
  assert.ok(starts[1] - starts[0] >= 15);
  assert.ok(starts[2] - starts[1] >= 15);
});
