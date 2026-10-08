import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, QuaternionKeyframeTrack } from 'three';
import { catalogAnimationOptions, parseBrawlerAssetCatalog } from '../src/lib/brawler-asset-catalog.ts';
import { assetRequestUrl, parseGlb, readAccessor, animationTracks, sampleTrack, clipWindow, windowFrameCount, playbackWindow, jointCoverage, motionsEqual, duplicateMotions, canonicalTriangleSignature, inspectGeometry, materialFindings, uvEvidence, parseArguments, summarizeReport } from './lint-brawl-catalog.mjs';

function glbBytes(document, binary = Buffer.alloc(0)) {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, ...document }));
  const jsonChunk = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(jsonChunk);
  const binChunk = Buffer.alloc(Math.ceil(binary.length / 4) * 4); binary.copy(binChunk);
  const result = Buffer.alloc(12 + 8 + jsonChunk.length + (binary.length ? 8 + binChunk.length : 0));
  result.writeUInt32LE(0x46546c67); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonChunk.length, 12); result.writeUInt32LE(0x4e4f534a, 16); jsonChunk.copy(result, 20);
  if (binary.length) { const offset = 20 + jsonChunk.length; result.writeUInt32LE(binChunk.length, offset); result.writeUInt32LE(0x004e4942, offset + 4); binChunk.copy(result, offset + 8); }
  return result;
}

const animation = (startFrame = 0, endFrame = 30, fps = 30) => ({ startFrame, endFrame, fps });
const track = (name = 'bone', values = [0, 0, 0, 1, 0, 0], times = [0, 1]) => ({ key: `${name}/translation`, name, node: 0, path: 'translation', times: Float64Array.from(times), values: Float64Array.from(values), size: 3, interpolation: 'LINEAR' });
const clip = (tracks = [track()], minTime = 0, maxTime = 1) => ({ tracks, minTime, maxTime });

test('LINEAR rotation sampling matches viewer keyframe interpolants for nonunit exported quaternions', () => {
  const times = [0.8999999761581421, 0.9333333373069763];
  const values = [0.08148442, 0.08517716, 0.97708058, 0.17731254, 0.08072146, 0.08594012, 0.97714162, 0.17697683];
  const source = { ...track(), path: 'rotation', size: 4, times: Float64Array.from(Float32Array.from(times)), values: Float64Array.from(Float32Array.from(values)) };
  const viewer = new QuaternionKeyframeTrack('bone.quaternion', times, values).createInterpolant();
  for (const time of [times[0], 0.9166666666666666, 0.9333333333333333, times[1]]) {
    const expected = Array.from(viewer.evaluate(time)), actual = sampleTrack(source, time);
    assert.ok(Math.max(...actual.map((value, i) => Math.abs(value - expected[i]))) < 1e-7);
  }
});

test('GLB chunk reader validates version, lengths, JSON and binary', () => {
  const bytes = glbBytes({ nodes: [] });
  assert.deepEqual(parseGlb(bytes).document.nodes, []);
  assert.equal(parseGlb(bytes).binary.length, 0);
  assert.throws(() => parseGlb(bytes.subarray(0, bytes.length - 1)), /header/);
  const bad = Buffer.from(bytes); bad.writeUInt32LE(1, 4);
  assert.throws(() => parseGlb(bad), /version/);
  assert.throws(() => parseGlb(glbBytes({ buffers: [{ byteLength: 20 }] })), /truncated/);
  assert.throws(() => parseGlb(glbBytes({ buffers: [{ uri: 'external.bin' }] })), /external/);
});

test('reference GLBs with unpadded JSON match GLTFLoader acceptance', () => {
  const json = Buffer.from('{"asset":{"version":"2.0"}}');
  const bytes = Buffer.alloc(20 + json.length);
  bytes.writeUInt32LE(0x46546c67); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); json.copy(bytes, 20);
  assert.equal(parseGlb(bytes).document.asset.version, '2.0');
});

test('production asset paths resolve to the worker root and reject external hosts', () => {
  assert.equal(assetRequestUrl('/assets/brawlers/3d/reference-bridge/objects/a.glb'), 'https://statsconnect-brawl-assets.juanquenga.workers.dev/reference-bridge/objects/a.glb');
  assert.equal(assetRequestUrl('/assets/brawlers/3d/catalog/a.json'), 'https://statsconnect-brawl-assets.juanquenga.workers.dev/catalog/a.json');
  assert.equal(assetRequestUrl('https://bs.statsconnect.app/assets/brawlers/3d/catalog.json'), 'https://bs.statsconnect.app/assets/brawlers/3d/catalog.json');
  assert.throws(() => assetRequestUrl('https://mv.brawlstars.top/a.glb'), /forbidden/);
});

test('accessors respect stride, offsets and normalized integers', () => {
  const binary = Buffer.from([99, 0, 255, 0, 99, 128, 64, 0]);
  const glb = { binary, document: { bufferViews: [{ byteOffset: 1, byteLength: 7, byteStride: 4 }], accessors: [{ bufferView: 0, componentType: 5121, type: 'VEC2', count: 2, normalized: true }] } };
  assert.deepEqual([...readAccessor(glb, 0).values], [0, 1, 128 / 255, 64 / 255]);
  glb.document.accessors[0].count = 3;
  assert.throws(() => readAccessor(glb, 0), /exceeds/);
});

test('sparse accessors apply overrides to zero-filled data', () => {
  const binary = Buffer.alloc(8); binary[0] = 1; binary.writeFloatLE(42, 4);
  const document = { bufferViews: [{ byteOffset: 0, byteLength: 1 }, { byteOffset: 4, byteLength: 4 }], accessors: [{ componentType: 5126, type: 'SCALAR', count: 3, sparse: { count: 1, indices: { bufferView: 0, componentType: 5121 }, values: { bufferView: 1 } } }] };
  assert.deepEqual([...readAccessor({ document, binary }, 0).values], [0, 42, 0]);
  binary[0] = 3;
  assert.throws(() => readAccessor({ document, binary }, 0), /sparse indices/);
});

test('matrix accessors account for padded small component columns', () => {
  const binary = Buffer.from([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
  const document = { bufferViews: [{ byteLength: 12 }], accessors: [{ bufferView: 0, componentType: 5121, type: 'MAT3', count: 1 }] };
  assert.deepEqual([...readAccessor({ document, binary }, 0).values], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('first animation clip decodes without meshes and rejects malformed output', () => {
  const binary = Buffer.alloc(32); [0, 1, 0, 0, 0, 1, 0, 0].forEach((value, i) => binary.writeFloatLE(value, i * 4));
  const document = { nodes: [{ name: 'bone' }], bufferViews: [{ byteLength: 8 }, { byteOffset: 8, byteLength: 24 }], accessors: [{ bufferView: 0, componentType: 5126, type: 'SCALAR', count: 2 }, { bufferView: 1, componentType: 5126, type: 'VEC3', count: 2 }], animations: [{ samplers: [{ input: 0, output: 1 }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }] };
  const result = animationTracks({ document, binary });
  assert.equal(result.tracks.length, 1); assert.equal(result.maxTime, 1);
  assert.deepEqual(sampleTrack(result.tracks[0], 0.5), [0.5, 0, 0]);
  document.accessors[1].count = 1;
  assert.throws(() => animationTracks({ document, binary }), /dimensions/);
  assert.equal(animationTracks({ document: {} }), null);
});

test('repeated source node names remain distinct hierarchy tracks', () => {
  const binary = Buffer.alloc(32); [0, 1, 0, 0, 0, 1, 0, 0].forEach((value, i) => binary.writeFloatLE(value, i * 4));
  const document = { nodes: [{ name: 'mirror', children: [1] }, { name: 'mirror' }], bufferViews: [{ byteLength: 8 }, { byteOffset: 8, byteLength: 24 }], accessors: [{ bufferView: 0, componentType: 5126, type: 'SCALAR', count: 2 }, { bufferView: 1, componentType: 5126, type: 'VEC3', count: 2 }], animations: [{ samplers: [{ input: 0, output: 1 }], channels: [0, 1].map((node) => ({ sampler: 0, target: { node, path: 'translation' } })) }] };
  const result = animationTracks({ document, binary });
  assert.equal(result.tracks.length, 2);
  assert.notEqual(result.tracks[0].key, result.tracks[1].key);
  document.animations[0].channels.push(document.animations[0].channels[0]);
  assert.throws(() => animationTracks({ document, binary }), /ambiguous/);
});

test('linear and step samples clamp outside key times', () => {
  const t = track();
  assert.deepEqual(sampleTrack(t, -1), [0, 0, 0]);
  assert.deepEqual(sampleTrack(t, 2), [1, 0, 0]);
  assert.deepEqual(sampleTrack({ ...t, interpolation: 'STEP' }, 0.9), [0, 0, 0]);
});

test('quaternion interpolation uses slerp and equal antipodal rotations', () => {
  const rotation = { ...track(), key: 'bone/rotation', path: 'rotation', size: 4, values: Float64Array.from([0, 0, 0, 1, 0, 0, 1, 0]) };
  const halfway = sampleTrack(rotation, 0.5);
  assert.ok(Math.abs(halfway[2] - Math.SQRT1_2) < 1e-12);
  const negative = { ...rotation, values: Float64Array.from(rotation.values, (value) => -value) };
  assert.equal(motionsEqual(clip([rotation]), animation(), clip([negative]), animation()), true);
});

test('cubic Hermite samples include tangents', () => {
  const cubic = { ...track(), interpolation: 'CUBICSPLINE', values: Float64Array.from([0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]) };
  assert.deepEqual(sampleTrack(cubic, 0.5), [0.75, 0, 0]);
});

test('windows use negative end sentinel and reject either side of range', () => {
  assert.equal(clipWindow(animation(0, -3), clip()).end, 1);
  assert.equal(clipWindow(animation(0, 60), clip()).outside, true);
  assert.equal(clipWindow(animation(0, 30), clip([], 0.1, 1)).outside, true);
  assert.equal(clipWindow(animation(31, -1), clip()).outside, true);
  assert.equal(clipWindow(animation(20, 10), clip()).outside, true);
  assert.equal(clipWindow(animation(), clip([], 0, 0.9999999)).outside, false);
});

test('short windows resolve negative end sentinels using the actual clip', () => {
  assert.equal(windowFrameCount(animation(0, 2)), 3);
  assert.equal(windowFrameCount(animation(0, -1), clip([], 0, 2 / 30)), 3);
  assert.equal(windowFrameCount(animation(0, -1)), Infinity);
});

test('duplicate motion compares viewer-clamped playback while reporting raw overruns', () => {
  assert.equal(playbackWindow(animation(0, 31), clip()).end, 1);
  assert.equal(clipWindow(animation(0, 31), clip()).outside, true);
  assert.equal(motionsEqual(clip(), animation(0, 31), clip(), animation()), true);
  assert.equal(motionsEqual(clip(), animation(31, -1), clip(), animation()), false);
});

test('duplicate comparison includes the final displayed frame interval', () => {
  const flat = track('bone', [0, 0, 0, 0, 0, 0]);
  const changed = track('bone', [0, 0, 0, 0, 0, 0, 1, 0, 0], [0, 29 / 30, 1]);
  assert.equal(playbackWindow(animation(0, 29), clip()).duration, 1);
  assert.equal(motionsEqual(clip([flat]), animation(0, 29), clip([changed]), animation(0, 29)), false);
});

test('coverage includes constant tracks, deduplicates paths and counts overlapping tracks', () => {
  const t = track('a', [1, 0, 0, 1, 0, 0]);
  const result = jointCoverage(['a', 'b', 'c', 'd', 'e', 'f'], clip([t, { ...t, path: 'scale' }, track('not-a-joint')]), { start: 0.2, end: 0.8 });
  assert.equal(result.tracked, 1); assert.equal(result.fraction < 0.2, true);
  assert.equal(jointCoverage(['a'], clip([t]), { start: 2, end: 3 }).tracked, 0);
  assert.equal(jointCoverage([], clip(), { start: 0, end: 1 }).fraction, 0);
});

test('motion comparison requires the complete track set and equal duration', () => {
  assert.equal(motionsEqual(clip(), animation(), clip([track(), track('extra')]), animation()), false);
  assert.equal(motionsEqual(clip(), animation(), clip([track('different')]), animation()), false);
  assert.equal(motionsEqual(clip(), animation(), clip(), animation(0, 15)), false);
  assert.equal(motionsEqual(clip([]), animation(), clip([]), animation()), false);
});

test('motion comparison observes frame interiors and enforces 1e-4 tolerance', () => {
  const t = track('bone', [0, 0, 0, 0.1, 0, 0, 0, 0, 0], [0, 0.25, 1]);
  const flat = track('bone', [0, 0, 0, 0, 0, 0]);
  assert.equal(motionsEqual(clip([t]), animation(), clip([flat]), animation()), false);
  const near = track('bone', [0.00009, 0, 0, 1.00009, 0, 0]);
  assert.equal(motionsEqual(clip(), animation(), clip([near]), animation()), true);
  near.values[0] = 0.00011;
  assert.equal(motionsEqual(clip(), animation(), clip([near]), animation()), false);
});

test('duplicate detection starts from app survivors, catches byte and motion duplicates', () => {
  const exported = (url) => ({ kind: 'ready', url });
  const animations = {
    Win: { ...animation(), label: 'Win', exported: exported('/assets/win.glb') },
    Hero: { ...animation(), label: 'Hero', exported: exported('/assets/hero.glb') },
    Alias: { ...animation(), label: 'Alias', exported: exported('/assets/win.glb') },
    Still: { ...animation(0, 2), label: 'Still', exported: exported('/assets/still.glb') },
  };
  const entry = parseBrawlerAssetCatalog({ schemaVersion: 1, skins: [{ skinId: 'Test', character: 'Test', baseModel: exported('/assets/base.glb'), diffuseTexture: exported('/assets/base.png'), animations, faces: {} }] }).skins[0];
  const options = catalogAnimationOptions(entry);
  assert.deepEqual(options.map((option) => option.key), ['Win', 'Hero']);
  const assets = new Map([['/assets/win.glb', { hash: 'a', clip: clip() }], ['/assets/hero.glb', { hash: 'a', clip: clip() }]]);
  assert.equal(duplicateMotions(options, entry.animations, assets)[0].method, 'sha256');
  assets.get('/assets/hero.glb').hash = 'b';
  assert.equal(duplicateMotions(options, entry.animations, assets)[0].method, 'sampled-tracks');
});

test('triangle multisets ignore vertex order/winding, preserve multiplicity and exact positions', () => {
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  assert.deepEqual(canonicalTriangleSignature(positions, [0, 1, 2]), canonicalTriangleSignature(positions, [2, 1, 0]));
  assert.notDeepEqual(canonicalTriangleSignature(positions, [0, 1, 2]), canonicalTriangleSignature(positions, [0, 1, 2, 0, 1, 2]));
  const offset = [...positions]; offset[0] = 1e-8;
  assert.notDeepEqual(canonicalTriangleSignature(positions), canonicalTriangleSignature(offset));
  assert.notDeepEqual(canonicalTriangleSignature(positions), canonicalTriangleSignature(positions, undefined, new Matrix4().makeTranslation(1, 0, 0)));
  assert.throws(() => canonicalTriangleSignature(positions, [0, 1, 9]), /outside/);
});

test('geometry detects coincident mesh instances using node transforms', () => {
  const values = [0, 0, 0, 1, 0, 0, 0, 1, 0], binary = Buffer.alloc(36);
  values.forEach((value, index) => binary.writeFloatLE(value, index * 4));
  const document = { nodes: [{ name: 'body', mesh: 0 }, { name: 'outline_HC', mesh: 0 }, { name: 'offset', mesh: 0, translation: [1, 0, 0] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], bufferViews: [{ byteLength: 36 }], accessors: [{ bufferView: 0, type: 'VEC3', componentType: 5126, count: 3 }] };
  const result = inspectGeometry({ document, binary });
  assert.equal(result.coincidentShells.length, 1); assert.equal(result.coincidentShells[0].mesh, 'outline_HC');
  assert.equal(result.triangleCount, 3); assert.deepEqual(result.hcNodes, ['outline_HC']);
  assert.equal(inspectGeometry({ document: {}, binary: Buffer.alloc(0) }).meshCount, 0);
});

test('material observations preserve raw outline fields and transparent slots', () => {
  const raw = { materialSlots: [{ materialName: 'outline', scBooleans: { enableNormalOutline: true }, outline: { width: 0.02, color: [0, 0, 0, 1] } }, { materialName: 'hidden', opacity: 0 }, { materialName: 'blend', uvSource: '67/68' }] };
  const rows = materialFindings(raw, { materials: [{ name: 'blend', alphaMode: 'BLEND' }] });
  assert.equal(rows.find((row) => row.category === 'normal_outline').widthPresent, true);
  assert.equal(rows.filter((row) => row.category === 'transparent').length, 2);
  assert.equal(rows.filter((row) => row.category === 'opacity_zero').length, 1);
  assert.equal(rows.filter((row) => row.category === 'uv_67_68').length, 1);
});

test('UV evidence uses retained names, never digits in hashed object URLs', () => {
  const unknown = uvEvidence({ faces: { LobbyFace: { atlas: { url: '/assets/678abc.png' } } } }, {});
  assert.equal(unknown.evidence.length, 0); assert.match(unknown.evidenceString, /unavailable/);
  const evidence = uvEvidence({ faces: { IdleFace: { exportName: 'idle68' }, LobbyFace: { exportName: 'lobby_plain' } } }, {});
  assert.equal(evidence.nonLobbyMatches.length, 1); assert.equal(evidence.lobbyMatches.length, 0);
  assert.match(evidence.evidenceString, /IdleFace.exportName=idle68/);
  assert.equal(uvEvidence({}, { extensionsUsed: ['v'] }).evidence[0].value, 'v');
  assert.equal(uvEvidence({ uvHints: { lobbyAtlasName: 'lobby_atlas67.png' } }, {}).lobbyMatches[0].value, 'lobby_atlas67.png');
});

test('CLI supports json, exact skin selection and a positive limit', () => {
  const args = parseArguments(['--json', '--skins=A,B', '--limit', '2']);
  assert.equal(args.json, true); assert.deepEqual([...args.skins], ['A', 'B']); assert.equal(args.limit, 2);
  assert.throws(() => parseArguments(['--limit', '0']), /positive/);
  assert.throws(() => parseArguments(['--skins']), /needs/);
  assert.throws(() => parseArguments(['--wat']), /unknown/);
});

test('summary counts observations and affected skins separately', () => {
  const result = summarizeReport({ skins: [{ skinId: 'A', findings: [{ category: 'face_fps' }, { category: 'face_fps' }, { category: 'load_failure' }] }, { skinId: 'B', findings: [{ category: 'face_fps' }] }], catalogFailures: [] });
  assert.deepEqual(result.categories.face_fps, { findings: 3, skins: 2 });
  assert.equal(result.worst[0].category, 'load_failure'); assert.equal(result.totalFindings, 4);
});
