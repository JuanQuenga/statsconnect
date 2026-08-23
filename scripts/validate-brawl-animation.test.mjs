import assert from "node:assert/strict";
import test from "node:test";
import { validateBrawlAnimationGlb } from "./validate-brawl-animation.mjs";

function fixtureGlb(quaternion) {
  const json = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: 16 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 16 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: "VEC4" }],
    animations: [{ samplers: [{ output: 0 }], channels: [{ sampler: 0, target: { node: 0, path: "rotation" } }] }],
  };
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(JSON.stringify(json));
  const paddedJson = new Uint8Array((jsonBytes.byteLength + 3) & ~3).fill(0x20);
  paddedJson.set(jsonBytes);
  const binary = new Uint8Array(new Float32Array(quaternion).buffer);
  const total = 12 + 8 + paddedJson.byteLength + 8 + binary.byteLength;
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  let offset = 12;
  view.setUint32(offset, paddedJson.byteLength, true);
  view.setUint32(offset + 4, 0x4e4f534a, true);
  output.set(paddedJson, offset + 8);
  offset += 8 + paddedJson.byteLength;
  view.setUint32(offset, binary.byteLength, true);
  view.setUint32(offset + 4, 0x004e4942, true);
  output.set(binary, offset + 8);
  return output;
}

test("rejects raw packed quaternion values that are not unit length", () => {
  const result = validateBrawlAnimationGlb(fixtureGlb([0, 0, 0, 32767]));
  assert.deepEqual(result, { ok: false, reason: "animation-quaternion-not-unit", quaternionCount: 0 });
});

test("accepts corrected unit quaternions with normal quantization tolerance", () => {
  const result = validateBrawlAnimationGlb(fixtureGlb([0, 0, 0, 1]));
  assert.deepEqual(result, { ok: true, reason: undefined, quaternionCount: 1 });
});
