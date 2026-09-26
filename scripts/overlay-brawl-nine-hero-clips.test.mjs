import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSscNodeNames } from './overlay-brawl-nine-hero-clips.mjs';

function glb(document) {
  const encoded = Buffer.from(JSON.stringify(document));
  const json = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 0x20);
  encoded.copy(json);
  const binary = Buffer.from([1, 2, 3, 4]);
  const bytes = Buffer.alloc(20 + json.length + 8 + binary.length);
  bytes.write('glTF');
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  bytes.writeUInt32LE(binary.length, 20 + json.length);
  bytes.writeUInt32LE(0x004e4942, 24 + json.length);
  binary.copy(bytes, 28 + json.length);
  return bytes;
}

test('normalizes converter suffixes while preserving GLB binary chunk', () => {
  const source = glb({ nodes: [{ name: 'head_s:SSC' }, { name: 'torso_s' }] });
  const result = normalizeSscNodeNames(source);
  assert.equal(result.normalized, 1);
  assert.equal(result.bytes.readUInt32LE(8), result.bytes.length);
  const document = JSON.parse(result.bytes.subarray(20, 20 + result.bytes.readUInt32LE(12)).toString());
  assert.deepEqual(document.nodes.map((node) => node.name), ['head_s', 'torso_s']);
  assert.deepEqual(result.bytes.subarray(-12), source.subarray(-12));
  assert.equal(normalizeSscNodeNames(result.bytes).normalized, 0);
});
