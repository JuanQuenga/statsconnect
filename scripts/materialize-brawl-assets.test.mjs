import test from "node:test";
import assert from "node:assert/strict";
import { resolveMaterializerPath, selectedEntries, validateGeometryGlb } from "./materialize-brawl-assets.mjs";

const entry = (brawlerId, skinId, ready = true) => ({
  brawlerId,
  skinId,
  released: true,
  sourceReadiness: { readyForConversion: ready },
});

test("materializer selects only released source-ready entries", () => {
  const manifest = { skins: [entry(1, "a"), entry(2, "b", false), entry(3, "c", false), entry(4, "d")] };
  assert.deepEqual(selectedEntries(manifest, new Map([['limit', '2']])).map((item) => item.skinId), ["a", "d"]);
});

test("materializer can bound a representative matrix to one skin per brawler", () => {
  const manifest = { skins: [entry(1, "a"), entry(1, "b"), entry(2, "c"), entry(3, "d")] };
  const options = new Map([['distinct-brawlers', true], ['limit', '3']]);
  assert.deepEqual(selectedEntries(manifest, options).map((item) => item.skinId), ["a", "c", "d"]);
});

function glbWithAttributes(attributes) {
  const json = Buffer.from(`${JSON.stringify({ asset: { version: "2.0" }, meshes: [{ primitives: [{ attributes }] }] })}   `);
  const header = Buffer.alloc(20);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + 8 + json.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, json]);
}

test("geometry is unavailable when a primitive has no TEXCOORD_0", () => {
  assert.deepEqual(validateGeometryGlb(glbWithAttributes({ POSITION: 0 })), { ok: false, reason: "model-texcoord0-missing" });
  assert.deepEqual(validateGeometryGlb(glbWithAttributes({ POSITION: 0, TEXCOORD_0: 1 })), { ok: true });
});

test("materializer resolves output paths before subprocesses use a temporary cwd", () => {
  assert.equal(
    resolveMaterializerPath(".generated/brawl-3d", "/workspace/project"),
    "/workspace/project/.generated/brawl-3d",
  );
  assert.equal(
    resolveMaterializerPath("/var/tmp/brawl-3d", "/workspace/project"),
    "/var/tmp/brawl-3d",
  );
});
