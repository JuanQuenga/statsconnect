import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIX = '/assets/brawlers/3d/';
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);
const inside = (parent, child) => child === parent || child.startsWith(`${parent}${path.sep}`);

function relativeAsset(url) {
  if (typeof url !== 'string' || !url.startsWith(PREFIX)) throw new Error(`Invalid asset URL: ${url}`);
  const relative = url.slice(PREFIX.length);
  if (!relative || relative.split('/').some((part) => !part || part === '.' || part === '..') || /[\\?#%]/.test(relative)) {
    throw new Error(`Unsafe asset URL: ${url}`);
  }
  return relative;
}

async function filesUnder(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not supported: ${relative}`);
    if (entry.isDirectory()) files.push(...await filesUnder(directory, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Unsupported file: ${relative}`);
  }
  return files.sort();
}

function references(value, result = new Set()) {
  if (typeof value === 'string' && value.startsWith(PREFIX)) result.add(relativeAsset(value));
  else if (Array.isArray(value)) value.forEach((item) => references(item, result));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => references(item, result));
  return result;
}

export async function prepareAssets({ sourceDir, verificationReport, outputDir }) {
  const source = await realpath(sourceDir);
  await mkdir(path.dirname(path.resolve(outputDir)), { recursive: true });
  const output = path.join(await realpath(path.dirname(path.resolve(outputDir))), path.basename(outputDir));
  if (inside(source, output) || inside(output, source)) throw new Error('Source and output directories must not overlap');
  // Only replace a directory previously produced by this script.
  try {
    if ((await lstat(output)).isSymbolicLink()) throw new Error('Output must not be a symlink');
    const previous = JSON.parse(await readFile(path.join(output, 'cloudflare-release-report.json'), 'utf8'));
    if (previous.generator !== 'prepare-brawl-cloudflare-assets-v1') throw new Error('Unrecognized output directory');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try { await stat(output); throw new Error('Refusing to replace an unmarked output directory'); }
    catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
  }
  const verification = JSON.parse(await readFile(verificationReport, 'utf8'));
  if (!Array.isArray(verification.failures) || !Number.isInteger(verification.selectableSkins)) throw new Error('Invalid runtime verification report');
  const quarantined = new Set();
  for (const failure of verification.failures) {
    if (typeof failure.skin !== 'string' || !['geometry', 'animation'].includes(failure.stage)) throw new Error('Unsupported verification failure; manual review required');
    quarantined.add(failure.skin);
  }
  const sourceFiles = await filesUnder(source);
  for (const relative of sourceFiles) {
    if (relative.startsWith('reference-bridge/objects/') && !/^reference-bridge\/objects\/[a-f0-9]{64}\.[a-z0-9]+$/.test(relative)) {
      throw new Error(`Immutable object must have a content-hashed filename: ${relative}`);
    }
  }
  const index = JSON.parse(await readFile(path.join(source, 'catalog.json'), 'utf8'));
  if (index.kind !== 'index' || !Array.isArray(index.brawlers)) throw new Error('Invalid catalog index');
  const changed = new Map();
  const oldShards = new Set();
  const matched = new Set();
  let originalSkins = 0;
  let releasedSkins = 0;
  let originalSelectableSkins = 0;
  let selectableSkins = 0;
  const needed = new Set();
  for (const entry of index.brawlers) {
    const old = relativeAsset(entry.shard);
    oldShards.add(old);
    const shard = JSON.parse(await readFile(path.join(source, old), 'utf8'));
    if (shard.kind !== 'brawler' || shard.brawlerId !== entry.brawlerId) throw new Error(`Invalid shard: ${old}`);
    const runtimeIds = new Set([...shard.defaults, ...shard.releasedSkins].filter((skin) => skin.baseModel?.kind === 'ready' && skin.diffuseTexture?.kind === 'ready' && Object.values(skin.animations ?? {}).some((animation) => animation.exported?.kind === 'ready')).map((skin) => skin.skinId));
    originalSelectableSkins += runtimeIds.size;
    selectableSkins += [...runtimeIds].filter((id) => !quarantined.has(id)).length;
    for (const field of ['defaults', 'releasedSkins']) {
      if (!Array.isArray(shard[field])) throw new Error(`Invalid shard entries: ${old}`);
      originalSkins += shard[field].length;
      shard[field] = shard[field].filter((skin) => {
        if (!quarantined.has(skin.skinId)) return true;
        matched.add(skin.skinId);
        return false;
      });
      releasedSkins += shard[field].length;
    }
    const content = json(shard);
    const relative = `catalog/${entry.brawlerId}.${digest(content)}.json`;
    entry.shard = `${PREFIX}${relative}`;
    changed.set(relative, content);
    references(shard, needed);
  }
  if (originalSelectableSkins !== verification.selectableSkins) throw new Error(`Verification catalog count mismatch: ${originalSelectableSkins} != ${verification.selectableSkins}`);
  for (const skin of quarantined) if (!matched.has(skin)) throw new Error(`Verification skin not found: ${skin}`);
  const available = new Set(sourceFiles);
  for (const relative of needed) if (!available.has(relative)) throw new Error(`Missing referenced asset: ${relative}`);
  const temporary = await mkdtemp(`${output}.preparing-`);
  try {
    await cp(source, temporary, { recursive: true });
    for (const old of oldShards) await rm(path.join(temporary, old));
    for (const [relative, content] of changed) await writeFile(path.join(temporary, relative), content);
    await writeFile(path.join(temporary, 'catalog.json'), json(index));
    await writeFile(path.join(temporary, '_headers'), '/*\n  Access-Control-Allow-Origin: *\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex\n\n/catalog.json\n  Cache-Control: no-cache, must-revalidate\n\n/catalog/*\n  Cache-Control: no-cache, must-revalidate\n\n/reference-bridge/objects/*\n  Cache-Control: public, max-age=31536000, immutable\n');
    const report = { generator: 'prepare-brawl-cloudflare-assets-v1', brawlers: index.brawlers.length, originalSkins, releasedSkins, originalSelectableSkins, selectableSkins, quarantinedSkins: [...matched].sort(), quarantinePolicy: 'whole-skin-on-any-runtime-failure', referencedAssets: needed.size };
    await writeFile(path.join(temporary, 'cloudflare-release-report.json'), json(report));
    const finalFiles = await filesUnder(temporary);
    if (finalFiles.length > 20000) throw new Error(`Cloudflare free file limit exceeded: ${finalFiles.length}`);
    let bytes = 0;
    let largestFileBytes = 0;
    for (const relative of finalFiles) {
      const info = await stat(path.join(temporary, relative));
      if (info.size > 25 * 1024 * 1024) throw new Error(`Cloudflare file size limit exceeded: ${relative}`);
      bytes += info.size;
      largestFileBytes = Math.max(largestFileBytes, info.size);
    }
    await rm(output, { recursive: true, force: true });
    await rename(temporary, output);
    return { ...report, files: finalFiles.length, bytes, largestFileBytes, outputDir: output };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const options = {};
  const keys = { '--source-dir': 'sourceDir', '--verification-report': 'verificationReport', '--output-dir': 'outputDir' };
  for (let i = 0; i < args.length; i += 2) {
    if (!keys[args[i]] || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Expected --source-dir DIR --verification-report FILE --output-dir DIR');
    options[keys[args[i]]] = args[i + 1];
  }
  if (Object.keys(options).length !== 3) throw new Error('Expected --source-dir DIR --verification-report FILE --output-dir DIR');
  console.log(json(await prepareAssets(options)));
}
