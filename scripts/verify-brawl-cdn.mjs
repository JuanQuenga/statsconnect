import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTION = 'https://stats.juanquenga.com';
const PREFIXES = ['/bs/assets/brawlers/3d/', '/assets/brawlers/3d/'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function relativeAsset(value) {
  const prefix = PREFIXES.find((candidate) => value.startsWith(candidate));
  if (!prefix) return null;
  const relative = value.slice(prefix.length);
  if (!relative || /[\\?#%]/.test(relative) || relative.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Unsafe catalog asset path');
  }
  return relative;
}

function references(value, result = new Set()) {
  if (typeof value === 'string') {
    const relative = relativeAsset(value);
    if (relative) result.add(relative);
  } else if (Array.isArray(value)) value.forEach((item) => references(item, result));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => references(item, result));
  return result;
}

async function concurrent(items, work) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

async function filesUnder(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(root, relative));
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`Unsupported local entry: ${relative}`);
  }
  return result;
}

export async function verifyCdn({ origin, localDir }) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('--origin must be an HTTPS URL without credentials, query, or fragment');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const root = path.resolve(localDir);
  const stats = { origin: base.href, catalogVerified: false, shardsVerified: 0, referencedAssets: 0, sampledAssets: [], bytesVerified: 0, rangeVerified: false, missingVerified: false };
  async function request(relative, expectedStatus = 200, extraHeaders = {}) {
    const response = await fetch(new URL(relative, base), {
      headers: { Origin: PRODUCTION, 'Accept-Encoding': 'identity', ...extraHeaders },
      signal: AbortSignal.timeout(60_000),
    });
    if (!(Array.isArray(expectedStatus) ? expectedStatus.includes(response.status) : response.status === expectedStatus)) {
      await response.body?.cancel();
      throw new Error(`${relative}: expected HTTP ${expectedStatus}, got ${response.status}`);
    }
    const cors = response.headers.get('access-control-allow-origin');
    if (cors !== '*' && cors !== PRODUCTION) {
      await response.body?.cancel();
      throw new Error(`${relative}: missing or incorrect CORS`);
    }
    return response;
  }
  async function verifyFile(relative, json = false) {
    const local = await readFile(path.join(root, relative));
    const response = await request(relative);
    const mime = response.headers.get('content-type') ?? '';
    if (mime.includes('text/html') || (json && !/application\/(?:[\w.+-]+\+)?json(?:;|$)/i.test(mime))) {
      await response.body?.cancel();
      throw new Error(`${relative}: unexpected MIME type`);
    }
    const remote = Buffer.from(await response.arrayBuffer());
    if (remote.length !== local.length || hash(remote) !== hash(local)) throw new Error(`${relative}: byte/hash mismatch`);
    stats.bytesVerified += remote.length;
    return json ? JSON.parse(local.toString('utf8')) : local;
  }
  const catalog = await verifyFile('catalog.json', true);
  if (catalog.kind !== 'index' || !Array.isArray(catalog.brawlers) || catalog.brawlers.length === 0) throw new Error('Invalid catalog index');
  stats.catalogVerified = true;
  const assets = new Set();
  const shards = [...new Set(catalog.brawlers.map((entry) => {
    if (typeof entry.shard !== 'string') throw new Error('Missing indexed shard');
    const relative = relativeAsset(entry.shard);
    if (!relative) throw new Error('Unexpected indexed shard origin');
    return relative;
  }))];
  await concurrent(shards, async (relative) => {
    const shard = await verifyFile(relative, true);
    if (shard.kind !== 'brawler') throw new Error(`${relative}: invalid shard`);
    references(shard, assets);
    stats.shardsVerified++;
  });
  // Follow nested local JSON references too; never fetch arbitrary URLs from metadata.
  const expanded = new Set(shards);
  for (;;) {
    const pending = [...assets].filter((relative) => relative.endsWith('.json') && !expanded.has(relative));
    if (!pending.length) break;
    await concurrent(pending, async (relative) => {
      expanded.add(relative);
      references(await verifyFile(relative, true), assets);
    });
  }
  stats.referencedAssets = assets.size;
  const files = await filesUnder(root);
  const available = new Set(files);
  for (const relative of assets) if (!available.has(relative)) throw new Error(`${relative}: missing local referenced asset`);
  let largest = null;
  const samples = new Map();
  await concurrent(files.sort(), async (relative) => {
    const info = await stat(path.join(root, relative));
    if (!info.isFile()) throw new Error(`${relative}: not a local file`);
    if (!largest || info.size > largest.bytes || (info.size === largest.bytes && relative < largest.path)) largest = { path: relative, bytes: info.size };
    const ext = path.extname(relative).slice(1).toLowerCase();
    const previous = samples.get(ext);
    const preferred = !previous || (assets.has(relative) && !assets.has(previous)) || (assets.has(relative) === assets.has(previous) && relative < previous);
    if (['glb', 'png', 'bin', 'webp'].includes(ext) && preferred) samples.set(ext, relative);
  });
  for (const ext of ['glb', 'png', 'bin', 'webp']) if (!samples.has(ext)) throw new Error(`No local ${ext.toUpperCase()} sample`);
  const chosen = [...new Set([...samples.values(), largest.path])].sort();
  await concurrent(chosen, async (relative) => {
    const bytes = await verifyFile(relative);
    stats.sampledAssets.push({ path: relative, bytes: bytes.length, sha256: hash(bytes), largest: relative === largest.path });
  });
  stats.sampledAssets.sort((a, b) => a.path.localeCompare(b.path));
  const glb = samples.get('glb');
  const localGlb = await readFile(path.join(root, glb));
  const ranged = await request(glb, [200, 206], { Range: 'bytes=0-31' });
  const rangeBytes = Buffer.from(await ranged.arrayBuffer());
  if (ranged.status === 206) {
    if (ranged.headers.get('content-range') !== `bytes 0-31/${localGlb.length}`) throw new Error('Incorrect Content-Range');
    if (!rangeBytes.equals(localGlb.subarray(0, 32))) throw new Error('Range byte mismatch');
    stats.rangeResponse = 'partial-206';
  } else {
    // HTTP servers may ignore Range. The viewer fetches complete GLBs.
    if (!rangeBytes.equals(localGlb)) throw new Error('Full response to Range does not match GLB');
    stats.rangeResponse = 'full-200-range-not-supported';
  }
  stats.rangeVerified = true;
  const missing = await request('__cdn-verification-missing-asset__.glb', 404);
  const missingBytes = Buffer.from(await missing.arrayBuffer());
  if ((missing.headers.get('content-type') ?? '').includes('text/html') || /^\s*(?:<!doctype html|<html)/i.test(missingBytes.toString('utf8'))) throw new Error('Missing asset returned HTML');
  stats.missingVerified = true;
  return stats;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = { '--origin': 'origin', '--local-dir': 'localDir' }[args[i]];
      if (!key || options[key] || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Expected --origin HTTPS_URL --local-dir DIR');
      options[key] = args[i + 1];
    }
    if (!options.origin || !options.localDir) throw new Error('Expected --origin HTTPS_URL --local-dir DIR');
    console.log(JSON.stringify({ ok: true, ...await verifyCdn(options) }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Verification failed' }));
    process.exitCode = 1;
  }
}
