/**
 * Clone a verified release, add source-owned hero clips to matching defaults,
 * and add the two version 69 defaults. Keep the source release untouched.
 *
 * node scripts/merge-brawl-hero-package.mjs \
 *   --source-dir .generated/brawl-3d-full/cloudflare-release \
 *   --hero-audit .generated/brawl-3d/import-v69/hero-batch.audit.json \
 *   --hero-assets-dir .generated/brawl-3d/import-v69/hero-batch-converted \
 *   --new-catalog-dir .generated/brawl-3d/import-v69 \
 *   --new-assets-dir .generated/brawl-3d/import-v69/converted \
 *   --output-dir .generated/brawl-3d/import-v69/candidate-merged \
 *   --report .generated/brawl-3d/import-v69/merge-report.json
 */
import { createHash } from 'node:crypto';
import { constants, cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const prefix = '/assets/brawlers/3d/';

function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }

function args(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith('--') || !argv[index + 1]) throw new Error(`Expected --option value, got ${key}`);
    result.set(key.slice(2), argv[index + 1]);
  }
  return result;
}

function required(options, key) {
  const value = options.get(key);
  if (!value) throw new Error(`--${key} is required`);
  return path.resolve(value);
}

function localPath(root, url) {
  if (typeof url !== 'string' || !url.startsWith(prefix)) throw new Error(`Unexpected asset URL ${url}`);
  const relative = url.slice(prefix.length);
  if (relative.includes('..') || relative.startsWith('/')) throw new Error(`Unsafe asset URL ${url}`);
  return path.join(root, relative);
}

function copyAsset(asset, sourceRoot, candidate, copied) {
  if (asset?.kind !== 'ready') return;
  const source = localPath(sourceRoot, asset.url);
  const target = localPath(candidate, asset.url);
  if (!existsSync(source)) throw new Error(`Missing source asset ${source}`);
  mkdirSync(path.dirname(target), { recursive: true });
  if (existsSync(target)) {
    const sourceHash = createHash('sha256').update(readFileSync(source)).digest('hex');
    const targetHash = createHash('sha256').update(readFileSync(target)).digest('hex');
    if (sourceHash !== targetHash) throw new Error(`Asset URL collision with different bytes: ${asset.url}`);
  } else copyFileSync(source, target);
  copied.add(asset.url);
}

function copyReadyAssets(value, sourceRoot, candidate, copied) {
  if (!value || typeof value !== 'object') return;
  if (value.kind === 'ready') { copyAsset(value, sourceRoot, candidate, copied); return; }
  for (const child of Object.values(value)) copyReadyAssets(child, sourceRoot, candidate, copied);
}

function verifyReadyAssets(value, candidate) {
  if (!value || typeof value !== 'object') return;
  if (value.kind === 'ready') {
    if (!existsSync(localPath(candidate, value.url))) throw new Error(`Missing candidate asset ${value.url}`);
    return;
  }
  for (const child of Object.values(value)) verifyReadyAssets(child, candidate);
}

function shardFor(row, root) {
  return JSON.parse(readFileSync(localPath(root, row.shard), 'utf8'));
}

function readySkinKeys(index, root) {
  const keys = new Set();
  for (const row of index.brawlers) {
    const shard = shardFor(row, root);
    for (const entry of [...(shard.defaults ?? []), ...(shard.releasedSkins ?? []), ...(shard.skins ?? [])]) {
      if (entry.baseModel?.kind === 'ready' && entry.diffuseTexture?.kind === 'ready' &&
          Object.values(entry.animations ?? {}).some((animation) => animation.exported?.kind === 'ready')) {
        keys.add(`${row.brawlerId}:${entry.skinId}`);
      }
    }
  }
  return keys;
}

function publishShard(id, shard, candidate) {
  const body = `${JSON.stringify(shard, null, 2)}\n`;
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 16);
  const relative = `catalog/${id}.${hash}.json`;
  writeFileSync(path.join(candidate, relative), body);
  return { brawlerId: id, shard: `${prefix}${relative}` };
}

export function mergeBrawlHeroPackage(options) {
  const source = required(options, 'source-dir');
  const heroAuditPath = required(options, 'hero-audit');
  const heroAssets = required(options, 'hero-assets-dir');
  const newCatalog = required(options, 'new-catalog-dir');
  const newAssets = required(options, 'new-assets-dir');
  const candidate = required(options, 'output-dir');
  const reportPath = required(options, 'report');
  const sourceReal = realpathSync(source);
  if (candidate === sourceReal || candidate.startsWith(`${sourceReal}${path.sep}`) || sourceReal.startsWith(`${candidate}${path.sep}`)) {
    throw new Error('Output directory must be separate from source release');
  }
  if (existsSync(candidate)) throw new Error(`Output directory already exists: ${candidate}`);
  cpSync(sourceReal, candidate, { recursive: true, mode: constants.COPYFILE_FICLONE });
  const index = readJson(path.join(candidate, 'catalog.json'));
  const heroAudit = readJson(heroAuditPath);
  const newIndex = readJson(path.join(newCatalog, 'catalog.json'));
  if (index.kind !== 'index' || newIndex.kind !== 'index' || !Array.isArray(heroAudit.defaults)) throw new Error('Invalid source catalog or hero audit');
  const baselineReady = readySkinKeys(index, candidate);
  const sourceDefaults = new Map(heroAudit.defaults.map((entry) => [entry.brawlerId, entry]));
  const copied = new Set();
  const report = { patched: [], skipped: [], added: [], copiedAssets: 0 };

for (const row of index.brawlers) {
  const source = sourceDefaults.get(row.brawlerId);
  if (!source) { report.skipped.push({ id: row.brawlerId, reason: 'no-source-ready-default' }); continue; }
  const clips = ['HeroScreenAnim', 'HeroScreenLoopAnim'];
  const faces = ['HeroScreenFace', 'HeroScreenLoopFace'];
  if (clips.some((key) => source.animations[key]?.exported?.kind !== 'ready')) {
    report.skipped.push({ id: row.brawlerId, reason: 'hero-clips-unavailable' });
    continue;
  }
  if (faces.some((key) => source.faces[key]?.symbol && !source.faces[key]?.ready)) {
    report.skipped.push({ id: row.brawlerId, reason: 'hero-faces-unavailable' });
    continue;
  }
  const shard = shardFor(row, candidate);
  const current = shard.defaults.find((entry) => entry.skinId === source.skinId);
  if (!current || current.baseModel?.kind !== 'ready') {
    report.skipped.push({ id: row.brawlerId, reason: 'production-default-unavailable-or-renamed' });
    continue;
  }
  for (const key of clips) {
    current.animations[key] = source.animations[key];
    copyReadyAssets(source.animations[key], heroAssets, candidate, copied);
  }
  for (const key of faces) {
    if (!source.faces[key]?.ready) continue;
    current.faces[key] = source.faces[key];
    copyReadyAssets(source.faces[key], heroAssets, candidate, copied);
  }
  Object.assign(row, publishShard(row.brawlerId, shard, candidate));
  report.patched.push(row.brawlerId);
}

for (const id of [16000109, 16000110]) {
  if (index.brawlers.some((row) => row.brawlerId === id)) throw new Error(`New brawler ${id} already exists in source release`);
  const sourceRow = newIndex.brawlers.find((row) => row.brawlerId === id);
  if (!sourceRow) throw new Error(`Missing new brawler shard ${id}`);
  const shard = shardFor(sourceRow, newCatalog);
  const defaultEntry = shard.defaults[0];
  if (defaultEntry?.baseModel?.kind !== 'ready' || defaultEntry?.diffuseTexture?.kind !== 'ready' ||
      defaultEntry?.animations?.HeroScreenAnim?.exported?.kind !== 'ready' ||
      defaultEntry?.animations?.HeroScreenLoopAnim?.exported?.kind !== 'ready') {
    throw new Error(`New brawler ${id} has incomplete default runtime`);
  }
  copyReadyAssets(shard, newAssets, candidate, copied);
  index.brawlers.push(publishShard(id, shard, candidate));
  report.added.push(id);
}

index.brawlers.sort((left, right) => left.brawlerId - right.brawlerId);
writeFileSync(path.join(candidate, 'catalog.json'), `${JSON.stringify(index, null, 2)}\n`);
report.copiedAssets = copied.size;
const candidateReady = readySkinKeys(index, candidate);
for (const key of baselineReady) if (!candidateReady.has(key)) throw new Error(`Existing ready skin lost: ${key}`);
report.baselineReadySkins = baselineReady.size;
report.candidateReadySkins = candidateReady.size;
for (const row of index.brawlers) {
  const shard = shardFor(row, candidate);
  verifyReadyAssets(shard, candidate);
}
mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = mergeBrawlHeroPackage(args(process.argv.slice(2)));
  console.log(JSON.stringify({ patched: report.patched.length, skipped: report.skipped.length, added: report.added, copiedAssets: report.copiedAssets }));
}
