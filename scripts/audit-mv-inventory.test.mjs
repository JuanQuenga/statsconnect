import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { auditMvInventory } from "./audit-mv-inventory.mjs";

test("inventory audit measures unique bytes and per-viewer startup requests", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mv-audit-test-"));
  try {
    const asset = async (name, size) => {
      const bytes = Buffer.alloc(size, name.charCodeAt(0));
      const file = path.join(root, name);
      await writeFile(file, bytes);
      return { path: file, sha256: createHash("sha256").update(bytes).digest("hex") };
    };
    const geometry = await asset("base.glb", 100);
    const texture = await asset("texture.png", 50);
    const idle = await asset("idle.glb", 20);
    const routes = ["One", "Two"].map((route) => ({ route, displayName: route, skinId: route, identity: { kind: "matched" }, assets: { geometry, texture, animations: { idle } }, animationMetadata: { idle: { face: null } }, materialSlots: [] }));
    const audit = await auditMvInventory({ routes });
    assert.equal(audit.capturedRoutes, 2);
    assert.equal(audit.objects.files, 3);
    assert.equal(audit.objects.bytes, 170);
    assert.equal(audit.objects.logicalBytes, 340);
    assert.equal(audit.objects.savedBytes, 170);
    assert.equal(audit.firstLoad.bytes.p50, 170);
    assert.equal(audit.firstLoad.requests.max, 3);
    assert.deepEqual(audit.missingFiles, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
