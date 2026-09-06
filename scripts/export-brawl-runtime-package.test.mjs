import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { exportRuntimePackage } from "./export-brawl-runtime-package.mjs";

test("release export contains only reachable assets and is safe to rerun", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "brawl-release-test-"));
  const source = path.join(root, "source"), output = path.join(root, "release");
  try {
    await mkdir(path.join(source, "catalog"), { recursive: true });
    await writeFile(path.join(source, "catalog.json"), JSON.stringify({ kind: "index", brawlers: [{ shard: "/assets/brawlers/3d/catalog/current.json" }] }));
    await writeFile(path.join(source, "catalog/current.json"), JSON.stringify({ model: { kind: "ready", url: "/assets/brawlers/3d/model.glb" } }));
    await writeFile(path.join(source, "model.glb"), "model");
    await writeFile(path.join(source, "stale.glb"), "stale");
    const first = await exportRuntimePackage({ source, output });
    assert.equal(first.files, 3);
    assert.equal((await readdir(output)).includes("stale.glb"), false);
    assert.deepEqual(await exportRuntimePackage({ source, output }), first);
    await writeFile(path.join(output, "user-file"), "preserve");
    await assert.rejects(exportRuntimePackage({ source, output }), /unrelated files/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
