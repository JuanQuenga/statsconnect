import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareAssets } from './prepare-brawl-cloudflare-assets.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cloudflare-brawl-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, 'source');
  const outputDir = path.join(root, 'output');
  const verificationReport = path.join(root, 'verification.json');
  await mkdir(path.join(sourceDir, 'catalog'), { recursive: true });
  const shard = { schemaVersion: 1, kind: 'brawler', brawlerId: 1, defaults: [{ skinId: 'Good', baseModel: { kind: 'ready', url: '/assets/brawlers/3d/body.glb' } }], releasedSkins: [{ skinId: 'Broken' }] };
  for (const skin of [...shard.defaults, ...shard.releasedSkins]) {
    skin.baseModel = { kind: 'ready', url: '/assets/brawlers/3d/body.glb' };
    skin.diffuseTexture = { kind: 'ready', url: '/assets/brawlers/3d/body.glb' };
    skin.animations = { IdleAnim: { exported: { kind: 'ready', url: '/assets/brawlers/3d/body.glb' } } };
  }
  await writeFile(path.join(sourceDir, 'catalog', 'old.json'), JSON.stringify(shard));
  await writeFile(path.join(sourceDir, 'body.glb'), 'model');
  await writeFile(path.join(sourceDir, 'catalog.json'), JSON.stringify({ schemaVersion: 1, kind: 'index', brawlers: [{ brawlerId: 1, shard: '/assets/brawlers/3d/catalog/old.json' }] }));
  await writeFile(verificationReport, JSON.stringify({ selectableSkins: 2, failures: [{ stage: 'animation', skin: 'Broken', animation: 'IdleAnim' }] }));
  return { sourceDir, outputDir, verificationReport };
}

test('quarantines whole failing skin, rewrites shard hashes, preserves source, deterministic rerun', async (t) => {
  const options = await fixture(t);
  const source = await readFile(path.join(options.sourceDir, 'catalog', 'old.json'), 'utf8');
  const result = await prepareAssets(options);
  assert.equal(result.releasedSkins, 1);
  assert.deepEqual(result.quarantinedSkins, ['Broken']);
  const catalog = await readFile(path.join(options.outputDir, 'catalog.json'), 'utf8');
  const shardPath = JSON.parse(catalog).brawlers[0].shard.replace('/assets/brawlers/3d/', '');
  assert.match(shardPath, /^catalog\/1\.[a-f0-9]{16}\.json$/);
  const shard = JSON.parse(await readFile(path.join(options.outputDir, shardPath), 'utf8'));
  assert.equal(shard.releasedSkins.length, 0);
  assert.equal(await readFile(path.join(options.sourceDir, 'catalog', 'old.json'), 'utf8'), source);
  assert.deepEqual(await prepareAssets(options), result);
  assert.equal(await readFile(path.join(options.outputDir, 'catalog.json'), 'utf8'), catalog);
  assert.match(await readFile(path.join(options.outputDir, '_headers'), 'utf8'), /Access-Control-Allow-Origin: \*/);
});

test('refuses overlap and unmarked output', async (t) => {
  const options = await fixture(t);
  await assert.rejects(prepareAssets({ ...options, outputDir: options.sourceDir }), /overlap/);
  await mkdir(options.outputDir);
  await assert.rejects(prepareAssets(options), /unmarked/);
});

test('rejects output symlinks and unhashed immutable objects', async (t) => {
  const options = await fixture(t);
  await symlink(options.sourceDir, options.outputDir);
  await assert.rejects(prepareAssets(options), /symlink/);
  await rm(options.outputDir);
  await mkdir(path.join(options.sourceDir, 'reference-bridge', 'objects'), { recursive: true });
  await writeFile(path.join(options.sourceDir, 'reference-bridge', 'objects', 'mutable.glb'), 'model');
  await assert.rejects(prepareAssets(options), /content-hashed/);
});

test('fails closed on missing references, unknown failures, and wrong report', async (t) => {
  const options = await fixture(t);
  await rm(path.join(options.sourceDir, 'body.glb'));
  await assert.rejects(prepareAssets(options), /Missing referenced asset/);
  await writeFile(options.verificationReport, JSON.stringify({ selectableSkins: 2, failures: [{ stage: 'geometry', skin: 'Unknown' }] }));
  await assert.rejects(prepareAssets(options), /not found/);
  await writeFile(options.verificationReport, JSON.stringify({ selectableSkins: 3, failures: [] }));
  await assert.rejects(prepareAssets(options), /count mismatch/);
});
