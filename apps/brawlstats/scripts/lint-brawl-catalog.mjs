#!/usr/bin/env node
// Node 24 strips the same TypeScript modules used by the app's tests.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { parseBrawlerAssetCatalog, catalogAnimationOptions, catalogEntryToViewerManifest } from '../src/lib/brawler-asset-catalog.ts';

const ROOT = '/tmp/brawl-audit/lint';
const DIAG = '/tmp/brawl-diag/data';
const CATALOG = 'https://bs.statsconnect.app/assets/brawlers/3d/catalog.json';
const WORKER = 'https://statsconnect-brawl-assets.juanquenga.workers.dev';
const EPSILON = 1e-4;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const TYPES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const COMPONENTS = { 5120: ['getInt8', 1], 5121: ['getUint8', 1], 5122: ['getInt16', 2], 5123: ['getUint16', 2], 5125: ['getUint32', 4], 5126: ['getFloat32', 4] };

export function assetRequestUrl(url) {
  const target = new URL(url, new URL(CATALOG).origin);
  if (![new URL(CATALOG).hostname, new URL(WORKER).hostname].includes(target.hostname)) throw new Error(`forbidden asset host: ${target.href}`);
  return target.href !== CATALOG && target.pathname.startsWith('/assets/brawlers/3d/')
    ? `${WORKER}/${target.pathname.slice('/assets/brawlers/3d/'.length)}${target.search}` : target.href;
}

export function parseGlb(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('bad GLB header/version/length');
  let document, binary = Buffer.alloc(0), offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error('truncated GLB chunk header');
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    // Reference exports omit JSON padding; GLTFLoader accepts them. Validate
    // actual bounds rather than reject assets the app successfully loads.
    if (offset + 8 + length > bytes.length) throw new Error('invalid GLB chunk length');
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset === 12 && type !== 0x4e4f534a) throw new Error('GLB first chunk must be JSON');
    if (type === 0x4e4f534a) {
      if (document) throw new Error('duplicate GLB JSON chunk');
      document = JSON.parse(chunk.toString('utf8').trim());
    } else if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  if (document?.asset?.version !== '2.0') throw new Error('missing glTF 2.0 document');
  if (document.buffers?.some((buffer) => buffer.uri)) throw new Error('external GLB buffers are unsupported');
  if ((document.buffers?.[0]?.byteLength ?? 0) > binary.length) throw new Error('truncated GLB binary buffer');
  return { document, binary };
}

// Reuses glbinfo.py's stride/offset decoding, with sparse and normalized data.
export function readAccessor(glb, index) {
  const { document, binary } = glb;
  const accessor = document.accessors?.[index];
  if (!accessor || !TYPES[accessor.type] || !COMPONENTS[accessor.componentType] || !Number.isInteger(accessor.count) || accessor.count < 0) throw new Error(`invalid accessor ${index}`);
  const size = TYPES[accessor.type], [getter, width] = COMPONENTS[accessor.componentType];
  const values = new Float64Array(accessor.count * size);
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  // Matrix columns smaller than 4 bytes have glTF's 4-byte column padding.
  const columns = accessor.type.startsWith('MAT') ? Number(accessor.type.at(-1)) : 1;
  const rows = size / columns, columnStride = columns > 1 ? Math.ceil(rows * width / 4) * 4 : rows * width;
  const elementBytes = columns * columnStride;
  function decode(bufferViewIndex, byteOffset, count, target, sparseIndices) {
    const bv = document.bufferViews?.[bufferViewIndex];
    if (!bv || (bv.buffer ?? 0) !== 0) throw new Error(`invalid buffer view for accessor ${index}`);
    const stride = bv.byteStride ?? elementBytes;
    if (stride < elementBytes || byteOffset < 0 || byteOffset + Math.max(0, count - 1) * stride + (count ? elementBytes : 0) > bv.byteLength) throw new Error(`accessor ${index} exceeds buffer view`);
    const base = (bv.byteOffset ?? 0) + byteOffset;
    for (let row = 0; row < count; row++) for (let component = 0; component < size; component++) {
      let value = view[getter](base + row * stride + Math.floor(component / rows) * columnStride + component % rows * width, true);
      if (accessor.normalized && accessor.componentType !== 5126) {
        const signed = accessor.componentType === 5120 || accessor.componentType === 5122;
        value = signed ? Math.max(-1, value / (2 ** (width * 8 - 1) - 1)) : value / (2 ** (width * 8) - 1);
      }
      if (!Number.isFinite(value)) throw new Error(`non-finite accessor ${index}`);
      target[(sparseIndices ? sparseIndices[row] : row) * size + component] = value;
    }
  }
  if (accessor.bufferView !== undefined) decode(accessor.bufferView, accessor.byteOffset ?? 0, accessor.count, values);
  if (accessor.sparse) {
    const sparse = accessor.sparse, definition = COMPONENTS[sparse.indices.componentType];
    if (!definition || ![5121, 5123, 5125].includes(sparse.indices.componentType) || sparse.count > accessor.count) throw new Error('invalid sparse accessor');
    const bv = document.bufferViews?.[sparse.indices.bufferView];
    if (!bv || (bv.buffer ?? 0) !== 0 || (sparse.indices.byteOffset ?? 0) + sparse.count * definition[1] > bv.byteLength) throw new Error('invalid sparse index view');
    const indices = [];
    for (let i = 0; i < sparse.count; i++) {
      const value = view[definition[0]]((bv.byteOffset ?? 0) + (sparse.indices.byteOffset ?? 0) + i * definition[1], true);
      if (value >= accessor.count || value <= (indices.at(-1) ?? -1)) throw new Error('invalid sparse indices');
      indices.push(value);
    }
    decode(sparse.values.bufferView, sparse.values.byteOffset ?? 0, sparse.count, values, indices);
  }
  return { values, size, count: accessor.count };
}

function nodeIdentities(document) {
  const nodes = document.nodes ?? [], counts = new Map(), parents = new Map();
  nodes.forEach((node, index) => {
    const name = node.name ?? `node:${index}`;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    (node.children ?? []).forEach((child) => {
      if (!nodes[child] || parents.has(child)) throw new Error('invalid GLB node hierarchy');
      parents.set(child, index);
    });
  });
  const identities = new Map(), visiting = new Set();
  function identity(index) {
    if (identities.has(index)) return identities.get(index);
    if (visiting.has(index)) throw new Error('cyclic GLB node hierarchy');
    visiting.add(index);
    const name = nodes[index].name ?? `node:${index}`;
    let result = name;
    if (counts.get(name) > 1) {
      const parent = parents.get(index);
      const siblings = parent === undefined ? nodes.map((_, i) => i).filter((i) => !parents.has(i)) : nodes[parent].children;
      const ordinal = siblings.filter((i) => nodes[i].name === name).indexOf(index);
      result = `${parent === undefined ? '' : `${identity(parent)}/`}${name}[${ordinal}]`;
    }
    visiting.delete(index); identities.set(index, result); return result;
  }
  return nodes.map((_, index) => identity(index));
}

function skeletonJointNames(document) {
  const identities = nodeIdentities(document);
  return [...new Set((document.skins ?? []).flatMap((skin) => skin.joints ?? []))].map((joint) => {
    if (!identities[joint]) throw new Error('invalid skeleton joint');
    return identities[joint];
  });
}

export function animationTracks(glb) {
  const { document } = glb, nodes = document.nodes ?? [];
  const clip = document.animations?.[0];
  if (!clip) return null;
  const identities = nodeIdentities(document);
  const tracks = [], targets = new Set();
  let minTime = Infinity, maxTime = -Infinity;
  for (const channel of clip.channels ?? []) {
    const sampler = clip.samplers?.[channel.sampler], node = channel.target?.node, targetPath = channel.target?.path;
    if (!sampler || !nodes[node]) throw new Error('invalid animation channel');
    const input = readAccessor(glb, sampler.input), output = readAccessor(glb, sampler.output);
    const times = input.values, interpolation = sampler.interpolation ?? 'LINEAR';
    if (input.size !== 1 || times.length === 0 || times[0] < 0 || !['LINEAR', 'STEP', 'CUBICSPLINE'].includes(interpolation)) throw new Error('invalid animation sampler');
    for (let i = 1; i < times.length; i++) if (times[i] <= times[i - 1]) throw new Error('animation times must increase');
    minTime = Math.min(minTime, times[0]); maxTime = Math.max(maxTime, times.at(-1));
    if (!['translation', 'rotation', 'scale'].includes(targetPath)) continue;
    const size = targetPath === 'rotation' ? 4 : 3;
    if (output.size !== size || output.count !== input.count * (interpolation === 'CUBICSPLINE' ? 3 : 1)) throw new Error('invalid animation output dimensions');
    const name = identities[node], key = `${name}/${targetPath}`;
    if (targets.has(key)) throw new Error(`ambiguous bone track ${key}`);
    targets.add(key);
    tracks.push({ key, name, node, path: targetPath, times, values: output.values, size, interpolation });
  }
  return { name: clip.name ?? null, minTime: Number.isFinite(minTime) ? minTime : 0, maxTime: Number.isFinite(maxTime) ? maxTime : 0, tracks };
}

export function sampleTrack(track, time) {
  const { times, values, size, interpolation } = track, cubic = interpolation === 'CUBICSPLINE';
  let low = 0, high = times.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (times[mid] <= time) low = mid; else high = mid - 1; }
  const i = low, j = Math.min(i + 1, times.length - 1);
  const at = (index, part = 1) => Array.from(values.subarray((cubic ? index * 3 + part : index) * size, (cubic ? index * 3 + part + 1 : index + 1) * size));
  const a = at(i), b = at(j);
  if (time <= times[0]) return at(0);
  if (time >= times.at(-1) || interpolation === 'STEP' || i === j) return a;
  const delta = times[j] - times[i], t = (time - times[i]) / delta;
  if (cubic) {
    const out = at(i, 2), incoming = at(j, 0);
    const result = a.map((v, k) => (2 * t ** 3 - 3 * t ** 2 + 1) * v + (t ** 3 - 2 * t ** 2 + t) * delta * out[k] + (-2 * t ** 3 + 3 * t ** 2) * b[k] + (t ** 3 - t ** 2) * delta * incoming[k]);
    if (track.path === 'rotation') { const length = Math.hypot(...result); if (length) return result.map((v) => v / length); }
    return result;
  }
  if (track.path === 'rotation') return new Quaternion(...a).slerp(new Quaternion(...b), t).toArray();
  return a.map((v, k) => v + (b[k] - v) * t);
}

export function clipWindow(animation, clip) {
  const start = animation.startFrame / animation.fps;
  const end = animation.endFrame < 0 ? clip.maxTime : animation.endFrame / animation.fps;
  return { start, end, duration: end - start, outside: start < clip.minTime - EPSILON || start > clip.maxTime + EPSILON || end > clip.maxTime + EPSILON || end < start || end < clip.minTime - EPSILON };
}

export function windowFrameCount(animation, clip) {
  if (animation.endFrame >= 0) return animation.endFrame - animation.startFrame + 1;
  return clip ? clip.maxTime * animation.fps - animation.startFrame + 1 : Infinity;
}

export function playbackWindow(animation, clip) {
  const start = Math.max(0, animation.startFrame / animation.fps);
  const end = animation.endFrame < 0 ? clip.maxTime : Math.min(animation.endFrame / animation.fps, clip.maxTime);
  const duration = Math.max(1 / animation.fps, Math.min(Math.max(start, end) - start + 1 / animation.fps, clip.maxTime - start));
  return { start, end: start + duration, duration, invalid: start > clip.maxTime + EPSILON };
}

export function jointCoverage(jointNames, clip, window) {
  const joints = new Set(jointNames), tracked = new Set();
  for (const track of clip?.tracks ?? []) {
    // A track applies between keys too; constant single-key tracks count.
    if (joints.has(track.name) && track.times[0] <= window.end + EPSILON && track.times.at(-1) >= window.start - EPSILON) tracked.add(track.name);
  }
  return { joints: joints.size, tracked: tracked.size, fraction: joints.size ? tracked.size / joints.size : 0 };
}

export function motionsEqual(a, aAnimation, b, bAnimation, tolerance = EPSILON) {
  const aw = playbackWindow(aAnimation, a), bw = playbackWindow(bAnimation, b);
  if (aw.invalid || bw.invalid || Math.abs(aw.duration - bw.duration) > tolerance || a.tracks.length === 0 || a.tracks.length !== b.tracks.length) return false;
  const right = new Map(b.tracks.map((track) => [track.key, track]));
  if (a.tracks.some((track) => !right.has(track.key))) return false;
  // Every frame, half-frame, and source key inside the window. No 12-sample
  // intersection shortcut: that missed short movements and unmatched bones.
  const times = new Set([0, aw.duration / 2, aw.duration]);
  const step = 1 / (2 * Math.max(aAnimation.fps, bAnimation.fps));
  for (let time = step; time < aw.duration; time += step) times.add(time);
  for (const [clip, window] of [[a, aw], [b, bw]]) for (const track of clip.tracks) for (const time of track.times) if (time >= window.start && time <= window.end) times.add(time - window.start);
  const compare = (time) => a.tracks.every((left) => {
    const l = sampleTrack(left, aw.start + time), r = sampleTrack(right.get(left.key), bw.start + time);
    const error = Math.max(...l.map((value, i) => Math.abs(value - r[i])));
    return error <= tolerance || left.path === 'rotation' && Math.max(...l.map((value, i) => Math.abs(value + r[i]))) <= tolerance;
  });
  // Reject most pairs using three poses before visiting the whole window.
  return [0, aw.duration / 2, aw.duration].every(compare) && [...times].every(compare);
}

export function duplicateMotions(options, animations, assets) {
  const duplicates = [];
  for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) {
    const left = options[i].key, right = options[j].key, aa = animations[left], ba = animations[right];
    const a = assets.get(aa.exported.url), b = assets.get(ba.exported.url);
    if (!a || !b) continue;
    const sameWindow = aa.startFrame === ba.startFrame && aa.endFrame === ba.endFrame && aa.fps === ba.fps;
    if (sameWindow && a.hash === b.hash) duplicates.push({ animation: right, otherAnimation: left, method: 'sha256', hash: a.hash });
    else if (a.clip && b.clip && motionsEqual(a.clip, aa, b.clip, ba)) duplicates.push({ animation: right, otherAnimation: left, method: 'sampled-tracks', tolerance: EPSILON });
  }
  return duplicates;
}

export function canonicalTriangleSignature(positions, indices, matrix = new Matrix4()) {
  const points = [], vertex = new Vector3();
  for (let i = 0; i < positions.length; i += 3) points.push(vertex.fromArray(positions, i).applyMatrix4(matrix).toArray().map((value) => Object.is(value, -0) ? 0 : value).join(','));
  const order = indices ?? Array.from({ length: points.length }, (_, i) => i);
  if (order.length % 3) throw new Error('triangle index count is not divisible by three');
  const triangles = [];
  for (let i = 0; i < order.length; i += 3) {
    const corners = [points[order[i]], points[order[i + 1]], points[order[i + 2]]];
    if (corners.some((corner) => corner === undefined)) throw new Error('triangle index outside positions');
    triangles.push(corners.sort().join(';'));
  }
  return triangles.sort();
}

export function inspectGeometry(glb) {
  const { document } = glb, nodes = document.nodes ?? [], meshes = document.meshes ?? [];
  const parents = new Map();
  nodes.forEach((node, index) => (node.children ?? []).forEach((child) => {
    if (!nodes[child] || parents.has(child)) throw new Error('invalid GLB node hierarchy');
    parents.set(child, index);
  }));
  const matrices = new Map(), visiting = new Set();
  function matrixFor(index) {
    if (matrices.has(index)) return matrices.get(index);
    if (visiting.has(index)) throw new Error('cyclic GLB node hierarchy');
    visiting.add(index);
    const node = nodes[index], local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])));
    if (parents.has(index)) local.premultiply(matrixFor(parents.get(index)));
    visiting.delete(index); matrices.set(index, local); return local;
  }
  const signatures = new Map(), coincidentShells = [], meshInstances = [];
  let triangleCount = 0;
  nodes.forEach((node, nodeIndex) => {
    if (node.mesh === undefined) return;
    const mesh = meshes[node.mesh];
    if (!mesh) throw new Error('invalid mesh index');
    const triangles = [];
    for (const primitive of mesh.primitives ?? []) {
      if ((primitive.mode ?? 4) !== 4) throw new Error('non-triangle mesh is unsupported');
      if (primitive.extensions?.KHR_draco_mesh_compression) throw new Error('Draco mesh is unsupported');
      const positions = readAccessor(glb, primitive.attributes?.POSITION);
      if (positions.size !== 3) throw new Error('invalid mesh POSITION accessor');
      const indices = primitive.indices === undefined ? undefined : readAccessor(glb, primitive.indices);
      if (indices && (indices.size !== 1 || [...indices.values].some((value) => !Number.isInteger(value) || value < 0))) throw new Error('invalid mesh indices');
      triangles.push(...canonicalTriangleSignature(positions.values, indices?.values, matrixFor(nodeIndex)));
    }
    const name = node.name ?? mesh.name ?? `node:${nodeIndex}`;
    triangleCount += triangles.length;
    meshInstances.push({ name, nodeIndex, meshIndex: node.mesh, triangles: triangles.length });
    if (triangles.length) {
      const hash = sha256(triangles.sort().join('\n'));
      if (signatures.has(hash)) coincidentShells.push({ mesh: name, nodeIndex, otherMesh: signatures.get(hash).name, otherNodeIndex: signatures.get(hash).nodeIndex, triangles: triangles.length, hash });
      else signatures.set(hash, { name, nodeIndex });
    }
  });
  const jointNames = skeletonJointNames(document);
  return { meshCount: meshes.length, meshInstances, triangleCount, jointNames, coincidentShells, hcNodes: nodes.filter((node) => /_HC|HC_/i.test(node.name ?? '')).map((node) => node.name), materials: document.materials ?? [] };
}

export function uvEvidence(raw, document) {
  const strings = [];
  if (typeof raw.uvHints?.lobbyAtlasName === 'string') strings.push({ field: 'uvHints.lobbyAtlasName', value: raw.uvHints.lobbyAtlasName });
  for (const [field, face] of Object.entries(raw.faces ?? {})) {
    for (const key of ['exportName', 'symbol', 'atlasName', 'sourceName']) if (typeof face[key] === 'string') strings.push({ field: `${field}.${key}`, value: face[key] });
  }
  for (const [index, name] of (raw.uvHints?.faceNames ?? []).entries()) strings.push({ field: `uvHints.faceNames[${index}]`, value: name });
  const matched = strings.filter(({ value }) => value.includes('67') || value.includes('68'));
  const evidence = [...matched];
  if (document?.extensionsUsed?.includes('v')) evidence.push({ field: 'geometry.extensionsUsed', value: 'v' });
  const fileVersion = raw.uvHints?.fileVersion ?? raw.geometryMetadata?.fileVersion;
  if (['67', '68'].includes(String(fileVersion))) evidence.push({ field: 'geometryMetadata.fileVersion', value: String(fileVersion) });
  const model = raw.uvHints?.model ?? raw.source?.modelFile;
  if (['barley_unicornknight_redux_geo.glb', 'rico_og_geo.glb', 'bull_footbull_redux_geo.glb', 'bull_ox_redux_geo.glb'].includes(model)) evidence.push({ field: 'model', value: model });
  return { evidence, evidenceString: evidence.length ? evidence.map(({ field, value }) => `${field}=${value}`).join('; ') : 'unavailable: production catalog omits original atlas/model names and importer provenance', lobbyMatches: matched.filter(({ field }) => /LobbyFace|lobby/i.test(field)), nonLobbyMatches: matched.filter(({ field }) => !/LobbyFace|lobby/i.test(field)) };
}

export function materialFindings(raw, geometry) {
  const findings = [], slots = raw.materialSlots ?? [];
  for (const slot of slots) {
    const name = slot.materialName;
    if (slot.scBooleans?.enableNormalOutline === true) findings.push({ category: 'normal_outline', material: name, outlinePresent: !!slot.outline, outline: slot.outline ?? null, widthPresent: typeof slot.outline?.width === 'number', colorPresent: Array.isArray(slot.outline?.color), detail: `${name}: enableNormalOutline; width=${slot.outline?.width ?? 'missing'}, color=${JSON.stringify(slot.outline?.color ?? null)}` });
    if (slot.opacity === 0) findings.push({ category: 'opacity_zero', material: name, detail: `${name}: opacity=0` });
    const native = geometry?.materials.find((material) => material.name === name);
    if (slot.transparent === true || typeof slot.opacity === 'number' && slot.opacity < 1 || native?.alphaMode === 'BLEND' || native?.pbrMetallicRoughness?.baseColorFactor?.[3] < 1) findings.push({ category: 'transparent', material: name, opacity: slot.opacity ?? null, alphaMode: native?.alphaMode ?? null, detail: `${name}: opacity=${slot.opacity ?? 'unspecified'}, alphaMode=${native?.alphaMode ?? 'OPAQUE'}` });
    if (slot.uvSource === '67/68') findings.push({ category: 'uv_67_68', material: name });
  }
  for (const native of geometry?.materials ?? []) if (!slots.some((slot) => slot.materialName === native.name) && (native.alphaMode === 'BLEND' || native.pbrMetallicRoughness?.baseColorFactor?.[3] < 1)) findings.push({ category: 'transparent', material: native.name ?? '(unnamed)', detail: `${native.name ?? '(unnamed)'}: alphaMode=${native.alphaMode ?? 'OPAQUE'}` });
  return findings;
}

async function mapLimit(values, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) { const index = next++; await fn(values[index], index); }
  }));
}

function downloader() {
  let active = 0;
  const waiting = [], inFlight = new Map(), failed = new Map();
  const stats = { downloaded: 0, reusedDiagnostic: 0, reusedCache: 0, bytesDownloaded: 0, requests: 0, maxConcurrency: 0 };
  async function fetchFollowingRedirects(url) {
    for (let redirects = 0; redirects <= 10; redirects++) {
      // Check every destination before making a request, including redirects.
      if (![new URL(CATALOG).hostname, new URL(WORKER).hostname].includes(new URL(url).hostname)) throw new Error(`unexpected redirect host: ${url}`);
      stats.requests++;
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(60_000) });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error(`redirect missing Location: ${url}`);
      url = new URL(location, url).href;
    }
    throw new Error('asset redirect limit exceeded');
  }
  async function network(url) {
    if (active >= 8) await new Promise((resolve) => waiting.push(resolve));
    else active++;
    stats.maxConcurrency = Math.max(stats.maxConcurrency, active);
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const response = await fetchFollowingRedirects(url);
        if ([429, 502, 503, 504].includes(response.status) && attempt < 3) {
          const retry = response.headers.get('retry-after'), seconds = Number(retry);
          await response.body?.cancel();
          const delay = retry ? Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(retry) - Date.now()) : 1000 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, delay || 1000)));
          continue;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        stats.downloaded++; stats.bytesDownloaded += bytes.length;
        return { bytes, finalUrl: response.url };
      }
      throw new Error('retry budget exhausted');
    } finally { const resume = waiting.shift(); if (resume) resume(); else active--; }
  }
  async function get(url, { fresh = false } = {}) {
    const absolute = new URL(url, new URL(CATALOG).origin).href;
    if (![new URL(CATALOG).hostname, new URL(WORKER).hostname].includes(new URL(absolute).hostname)) throw new Error(`forbidden asset host: ${absolute}`);
    if (failed.has(absolute)) throw failed.get(absolute);
    if (inFlight.has(absolute)) return inFlight.get(absolute);
    const request = (async () => {
      const local = path.join(ROOT, 'cache', sha256(absolute));
      if (!fresh) {
        try { const bytes = await readFile(local); stats.reusedCache++; return { bytes, finalUrl: absolute }; } catch (error) { if (error.code !== 'ENOENT') throw error; }
        const pathname = new URL(absolute).pathname;
        const candidates = pathname.endsWith('.glb') ? [path.join(DIAG, 'glb', pathname.replace(/^\/assets\/brawlers\/3d\//, '').replaceAll('/', '__')), path.join(DIAG, 'glb61', path.basename(pathname))] : pathname.includes('/catalog/') ? [path.join(DIAG, 'shards', path.basename(pathname))] : [];
        for (const candidate of candidates) {
          try { const bytes = await readFile(candidate); stats.reusedDiagnostic++; return { bytes, finalUrl: absolute }; } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      }
      // The app redirects its /assets/brawlers/3d/ prefix to the worker root.
      // Fetch that root directly for assets, retaining app paths as cache keys.
      const result = await network(assetRequestUrl(absolute));
      const temporary = `${local}.${process.pid}.tmp`;
      await writeFile(temporary, result.bytes); await rename(temporary, local);
      return result;
    })();
    inFlight.set(absolute, request);
    try { return await request; } catch (error) { failed.set(absolute, error); throw error; } finally { inFlight.delete(absolute); }
  }
  return { get, stats };
}

export function parseArguments(args) {
  const result = { json: false, skins: null, limit: Infinity };
  for (let index = 0; index < args.length; index++) {
    const [flag, inline] = args[index].split('=', 2);
    if (flag === '--json') result.json = true;
    else if (flag === '--skins') {
      const value = inline ?? args[++index];
      if (!value || value.startsWith('--')) throw new Error('--skins needs comma-separated exact skin IDs');
      result.skins = new Set(value.split(',').map((skin) => skin.trim()).filter(Boolean));
    } else if (flag === '--limit') {
      result.limit = Number(inline ?? args[++index]);
      if (!Number.isSafeInteger(result.limit) || result.limit < 1) throw new Error('--limit needs a positive integer');
    } else if (flag === '--help') result.help = true;
    else throw new Error(`unknown argument: ${args[index]}`);
  }
  return result;
}

async function loadEntries(download) {
  const root = await download.get(CATALOG, { fresh: true });
  const index = JSON.parse(root.bytes.toString('utf8')), entries = new Map(), failures = [];
  const shards = index.kind === 'index' ? index.brawlers : [{ shard: null }];
  await mapLimit(shards, 8, async (shard) => {
    try {
      const raw = shard.shard ? JSON.parse((await download.get(shard.shard)).bytes.toString('utf8')) : index;
      // Parse complete shards using the app's parser, preserving raw additive metadata.
      const catalog = parseBrawlerAssetCatalog(raw);
      const parsed = [...catalog.defaults, ...catalog.releasedSkins, ...catalog.skins];
      const originals = [...(raw.defaults ?? []), ...(raw.releasedSkins ?? []), ...(raw.skins ?? [])];
      parsed.forEach((entry, i) => {
        const key = `${entry.brawlerId}:${entry.skinId}`, existing = entries.get(key);
        if (!existing || entry.baseModel.kind === 'ready' && existing.entry.baseModel.kind !== 'ready') entries.set(key, { entry, raw: originals[i] });
      });
    } catch (error) { failures.push({ category: 'load_failure', stage: 'catalog', shard: shard.shard, detail: String(error) }); }
  });
  return { entries: [...entries.values()].sort((a, b) => (a.entry.brawlerId ?? 0) - (b.entry.brawlerId ?? 0) || a.entry.skinId.localeCompare(b.entry.skinId)), failures, shards: shards.length, finalUrl: root.finalUrl, catalogHash: sha256(root.bytes) };
}

async function auditSkin({ entry, raw }, download) {
  const findings = [], assets = new Map(), options = catalogAnimationOptions(entry), manifest = catalogEntryToViewerManifest(entry);
  const add = (category, detail, more = {}) => findings.push({ category, detail, ...more });
  let base, baseDocument;
  if (entry.baseModel.kind === 'ready') {
    try {
      const glb = parseGlb((await download.get(entry.baseModel.url)).bytes);
      baseDocument = glb.document; base = inspectGeometry(glb);
      if (base.meshCount === 0 || base.meshInstances.length === 0 || base.triangleCount === 0) add('load_failure', 'base model contains zero renderable meshes/triangles', { stage: 'base', url: entry.baseModel.url });
      for (const name of base.hcNodes) add('hc_geometry', `HC node: ${name}`, { node: name });
      for (const shell of base.coincidentShells) add('coincident_shell', `${shell.mesh} duplicates ${shell.otherMesh}: ${shell.triangles} triangles in bind pose`, shell);
    } catch (error) { add('load_failure', String(error), { stage: 'base', url: entry.baseModel.url }); }
  } else add('base_unavailable', entry.baseModel.reason ?? 'base model unavailable');
  const evidence = uvEvidence(raw, baseDocument);
  for (const finding of materialFindings(raw, base)) {
    if (finding.category === 'uv_67_68') {
      finding.evidence = evidence; finding.detail = `${finding.material}: uvSource=67/68; ${evidence.evidenceString}`;
      if (!evidence.evidence.length) add('uv_evidence_missing', finding.detail, { material: finding.material });
      if (evidence.nonLobbyMatches.length && !evidence.lobbyMatches.length) add('uv_non_lobby_evidence', finding.detail, { material: finding.material, evidence });
    }
    findings.push(finding);
  }
  for (const [field, face] of Object.entries(entry.faces)) {
    if (entry.assetGroup === 'reference-bridge' && face.fps !== 30) add('face_fps', `${field}: catalog fps=${face.fps}; viewer fps=30`, { face: field, catalogFps: face.fps, viewerFps: 30 });
    if (!face.ready || !face.resolved || face.atlas.kind !== 'ready' || face.binary.kind !== 'ready') add('missing_face_data', `${field}: face data not ready/resolved`, { face: field });
  }
  if (manifest?.face.kind === 'unavailable') add('missing_face_data', 'skin has no available face data', { scope: 'skin', hasStencil: entry.materialSlots?.some((slot) => slot.stencil === true) ?? false });
  const urls = [...new Set(Object.values(entry.animations).filter((animation) => animation.exported.kind === 'ready').map((animation) => animation.exported.url))];
  for (const url of urls) {
    try {
      const bytes = (await download.get(url)).bytes, glb = parseGlb(bytes);
      const clip = animationTracks(glb);
      assets.set(url, { hash: sha256(bytes), clip, jointNames: skeletonJointNames(glb.document) });
    } catch (error) { add('load_failure', String(error), { stage: 'animation', url, animations: Object.entries(entry.animations).filter(([, animation]) => animation.exported.kind === 'ready' && animation.exported.url === url).map(([key]) => key) }); }
  }
  const animationResults = [];
  for (const [key, animation] of Object.entries(entry.animations)) {
    if (animation.exported.kind !== 'ready') continue;
    const asset = assets.get(animation.exported.url), frames = windowFrameCount(animation, asset?.clip);
    if (frames <= 3 + EPSILON) add('short_window', `${key}: ${frames} frames (${animation.startFrame}..${animation.endFrame})`, { animation: key, frames });
    const viewer = manifest?.animations[key];
    if (viewer && raw.animations?.[key]?.faceField !== null && (viewer[1].kind !== 'ready' || viewer[2].kind !== 'ready')) add('missing_face_data', `${key}: viewer lacks face atlas/binary`, { animation: key });
    if (!asset) continue;
    if (!asset.clip) { add('no_animation_clip', `${key}: exported GLB contains no animation clip`, { animation: key, url: animation.exported.url }); continue; }
    const window = clipWindow(animation, asset.clip);
    if (window.outside) add('window_outside_clip', `${key}: window ${window.start.toFixed(5)}..${window.end.toFixed(5)}s outside keyframes ${asset.clip.minTime.toFixed(5)}..${asset.clip.maxTime.toFixed(5)}s`, { animation: key, window, clipRange: [asset.clip.minTime, asset.clip.maxTime] });
    const coverage = jointCoverage(base?.jointNames.length ? base.jointNames : asset.jointNames, asset.clip, window);
    if (coverage.fraction < 0.2) add('low_joint_coverage', `${key}: ${coverage.tracked}/${coverage.joints} joints (${(coverage.fraction * 100).toFixed(1)}%)`, { animation: key, coverage });
    animationResults.push({ key, url: animation.exported.url, hash: asset.hash, offered: options.some((option) => option.key === key), window, clipRange: [asset.clip.minTime, asset.clip.maxTime], coverage, tracks: asset.clip.tracks.length, viewerFaceFps: viewer?.[7] ?? null });
  }
  for (const duplicate of duplicateMotions(options, entry.animations, assets)) add('duplicate_motion', `${duplicate.animation} duplicates ${duplicate.otherAnimation} (${duplicate.method})`, duplicate);
  return { skinId: entry.skinId, brawlerId: entry.brawlerId, assetGroup: entry.assetGroup, offeredOptions: options, base: base ? { meshCount: base.meshCount, triangles: base.triangleCount, jointCount: base.jointNames.length, meshInstances: base.meshInstances } : null, animations: animationResults, findings };
}

const PRIORITY = { load_failure: 100, no_animation_clip: 95, window_outside_clip: 90, duplicate_motion: 85, low_joint_coverage: 80, uv_non_lobby_evidence: 75, coincident_shell: 70, short_window: 65, uv_evidence_missing: 60, normal_outline: 55, opacity_zero: 50, transparent: 45, hc_geometry: 40, missing_face_data: 35, face_fps: 30, uv_67_68: 25, base_unavailable: 20 };
export function summarizeReport(report) {
  const rows = report.skins.flatMap((skin) => skin.findings.map((finding) => ({ skinId: skin.skinId, ...finding }))).concat(report.catalogFailures);
  const counts = Object.fromEntries(Object.keys(PRIORITY).map((key) => [key, { findings: 0, skins: new Set() }]));
  for (const row of rows) {
    const count = counts[row.category] ??= { findings: 0, skins: new Set() };
    count.findings++; if (row.skinId) count.skins.add(row.skinId);
  }
  const categories = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, { findings: value.findings, skins: value.skins.size }]));
  const worst = rows.sort((a, b) => (PRIORITY[b.category] ?? 0) - (PRIORITY[a.category] ?? 0) || (a.coverage?.fraction ?? 1) - (b.coverage?.fraction ?? 1) || (a.skinId ?? '').localeCompare(b.skinId ?? '') || (a.animation ?? '').localeCompare(b.animation ?? '')).slice(0, 30);
  return { categories, totalFindings: rows.length, skinsWithFindings: report.skins.filter((skin) => skin.findings.length).length, worst };
}

function summaryMarkdown(report) {
  const cell = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  return `# Brawl catalog lint\n\nGenerated ${report.generatedAt}. Audited ${report.skins.length}/${report.catalogEntries} catalog entries in ${report.elapsedSeconds}s. ${report.catalogShards} shards; ${report.readyBaseModels} ready base models.\n\nCatalog: ${CATALOG}\n\n${report.methodology.join('\n\n')}\n\n${report.summary.totalFindings} findings across ${report.summary.skinsWithFindings} skins. Counts are observations, including material/face metadata the viewer already corrects.\n\n| Category | Findings | Skins |\n| --- | ---: | ---: |\n${Object.entries(report.summary.categories).map(([key, value]) => `| ${key} | ${value.findings} | ${value.skins} |`).join('\n')}\n\n## Worst 30 findings\n\nRanked by category severity, then coverage fraction.\n\n| Category | Skin ID | Animation | Detail |\n| --- | --- | --- | --- |\n${report.summary.worst.map((row) => `| ${cell(row.category)} | ${cell(row.skinId)} | ${cell(row.animation ?? row.animations?.join(', '))} | ${cell(row.detail)} |`).join('\n')}\n\nDownloads: ${JSON.stringify(report.downloads)}\n\nRun: \`node apps/brawlstats/scripts/lint-brawl-catalog.mjs [--json] [--skins SkinId,OtherSkin] [--limit N]\`. Reports always replace \`/tmp/brawl-audit/lint/report.json\` and \`SUMMARY.md\`; check the selection metadata before comparing runs.\n`;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) { console.log('Usage: node lint-brawl-catalog.mjs [--json] [--skins SkinId,OtherSkin] [--limit N]\n--json prints the full JSON report; reports also go to /tmp/brawl-audit/lint/.'); return; }
  const started = Date.now();
  await mkdir(path.join(ROOT, 'cache'), { recursive: true });
  const download = downloader(), catalog = await loadEntries(download);
  if (options.skins) for (const skin of options.skins) if (!catalog.entries.some(({ entry }) => entry.skinId === skin)) throw new Error(`unknown skin: ${skin}`);
  const selected = catalog.entries.filter(({ entry }) => !options.skins || options.skins.has(entry.skinId)).slice(0, options.limit);
  const results = new Array(selected.length);
  let done = 0;
  await mapLimit(selected, 8, async (skin, index) => {
    results[index] = await auditSkin(skin, download);
    done++;
    if (done % 25 === 0 || done === selected.length) process.stderr.write(`Audited ${done}/${selected.length} skins; downloaded ${download.stats.downloaded} files (${Math.round(download.stats.bytesDownloaded / 1048576)} MiB)\n`);
  });
  const report = {
    schemaVersion: 1, generatedAt: new Date().toISOString(), catalogUrl: CATALOG, finalCatalogUrl: catalog.finalUrl, catalogHash: catalog.catalogHash, catalogShards: catalog.shards, catalogEntries: catalog.entries.length,
    selection: { skins: options.skins ? [...options.skins] : null, limit: Number.isFinite(options.limit) ? options.limit : null }, readyBaseModels: selected.filter(({ entry }) => entry.baseModel.kind === 'ready').length,
    elapsedSeconds: Math.round((Date.now() - started) / 1000), downloads: download.stats,
    methodology: [
      'Uses the app catalog parser, option dedupe and viewer manifest mapping. All exported animation GLBs are inspected, including options hidden by app dedupe. Duplicate-motion comparisons use only surviving options and the first clip, as the viewer does.',
      'Duplicate motion: same SHA-256 and frame/fps window, or identical complete bone-transform track sets within 1e-4 at every frame, half-frame and source key in equal-duration viewer-clamped playback windows. Quaternion LINEAR uses slerp; STEP and CUBICSPLINE are supported. Playback speed and face animation are intentionally excluded from body-motion comparison. Samples are evidence, not proof of equality between all sample points.',
      'Coverage is the fraction of base skeleton joints with transform tracks overlapping the requested window, including constant tracks. Coincident shells have exactly equal triangle multisets in the default world/bind pose, ignoring winding, UVs and material. This does not prove they remain coincident under different skin weights.',
      'Zero meshes is a base-model failure only; rig-only animation exports are valid. Negative end frames mean the clip end, matching the app. Out-of-range checks tolerate 1e-4 seconds of floating-point export drift.',
      'Face-fps findings compare raw catalog fps with 30; viewer manifests already correct reference-bridge faces. Missing per-animation face data excludes explicit faceField=null. UV evidence uses retained source/export names or geometry metadata, never hashed filenames. Missing provenance is reported explicitly. No face textures/binaries are downloaded.',
      'Fresh production index; immutable hash-addressed shards and GLBs reuse /tmp/brawl-diag/data and /tmp/brawl-audit/lint/cache. At most eight asset-worker requests concurrently. No requests to mv.brawlstars.top.'
    ], catalogFailures: catalog.failures, skins: results,
  };
  report.summary = summarizeReport(report);
  await writeFile(path.join(ROOT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(ROOT, 'SUMMARY.md'), summaryMarkdown(report));
  console.log(options.json ? JSON.stringify(report, null, 2) : `${results.length} skins audited in ${report.elapsedSeconds}s; ${report.summary.totalFindings} observations.\n${JSON.stringify(report.summary.categories, null, 2)}\nReports: ${ROOT}/report.json and ${ROOT}/SUMMARY.md`);
  // Catalog/asset load failures make automated runs fail; metadata observations do not.
  if (report.summary.categories.load_failure.findings > 0) process.exitCode = 1;
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
