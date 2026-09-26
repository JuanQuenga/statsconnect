import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mergeBrawlHeroPackage } from './merge-brawl-hero-package.mjs';

const prefix = '/assets/brawlers/3d/';
const ready = (name) => ({ kind: 'ready', url: `${prefix}${name}` });
const entry = (id, skinId) => ({
  brawlerId: id,
  skinId,
  baseModel: ready(`models/${id}.glb`),
  diffuseTexture: ready(`textures/${id}.png`),
  animations: { IdleAnim: { symbol: 'idle', exported: ready(`animations/${id}/IdleAnim.glb`) } },
  faces: {},
});
function json(root, name, value) {
  const file = path.join(root, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value)}\n`);
}
function asset(root, name) {
  const file = path.join(root, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, name);
}

test('merges verified hero roles and new defaults without changing source skins', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'brawl-hero-merge-'));
  try {
    const source = path.join(root, 'source');
    const hero = path.join(root, 'hero');
    const newCatalog = path.join(root, 'new-catalog');
    const newAssets = path.join(root, 'new-assets');
    const output = path.join(root, 'output');
    const oldShard = { schemaVersion: 1, defaults: [entry(1, 'Default')], releasedSkins: [entry(1, 'Alternate')] };
    json(source, 'catalog.json', { schemaVersion: 1, kind: 'index', brawlers: [{ brawlerId: 1, shard: `${prefix}catalog/1.old.json` }] });
    json(source, 'catalog/1.old.json', oldShard);
    for (const name of ['models/1.glb', 'textures/1.png', 'animations/1/IdleAnim.glb']) asset(source, name);

    const sourceDefault = entry(1, 'Default');
    sourceDefault.animations.HeroScreenAnim = { symbol: 'open', exported: ready('animations/1/open.glb') };
    sourceDefault.animations.HeroScreenLoopAnim = { symbol: 'loop', exported: ready('animations/1/loop.glb') };
    sourceDefault.faces.HeroScreenFace = { symbol: 'open-face', ready: true, atlas: ready('faces/1/open.png'), binary: ready('faces/1/open.bin') };
    sourceDefault.faces.HeroScreenLoopFace = { symbol: 'loop-face', ready: true, atlas: ready('faces/1/loop.png'), binary: ready('faces/1/loop.bin') };
    json(root, 'hero-audit.json', { defaults: [sourceDefault] });
    for (const name of ['animations/1/open.glb', 'animations/1/loop.glb', 'faces/1/open.png', 'faces/1/open.bin', 'faces/1/loop.png', 'faces/1/loop.bin']) asset(hero, name);

    json(newCatalog, 'catalog.json', { schemaVersion: 1, kind: 'index', brawlers: [109, 110].map((id) => ({ brawlerId: 16000000 + id, shard: `${prefix}catalog/${16000000 + id}.new.json` })) });
    for (const id of [16000109, 16000110]) {
      const newEntry = entry(id, `${id}Default`);
      newEntry.animations.HeroScreenAnim = { symbol: 'open', exported: ready(`animations/${id}/open.glb`) };
      newEntry.animations.HeroScreenLoopAnim = { symbol: 'loop', exported: ready(`animations/${id}/loop.glb`) };
      json(newCatalog, `catalog/${id}.new.json`, { schemaVersion: 1, defaults: [newEntry], releasedSkins: [] });
      for (const name of [`models/${id}.glb`, `textures/${id}.png`, `animations/${id}/IdleAnim.glb`, `animations/${id}/open.glb`, `animations/${id}/loop.glb`]) asset(newAssets, name);
    }

    const options = new Map([
      ['source-dir', source], ['hero-audit', path.join(root, 'hero-audit.json')],
      ['hero-assets-dir', hero], ['new-catalog-dir', newCatalog],
      ['new-assets-dir', newAssets], ['output-dir', output], ['report', path.join(root, 'report.json')],
    ]);
    const before = readFileSync(path.join(source, 'catalog/1.old.json'), 'utf8');
    const report = mergeBrawlHeroPackage(options);
    assert.deepEqual(report.patched, [1]);
    assert.deepEqual(report.added, [16000109, 16000110]);
    assert.equal(readFileSync(path.join(source, 'catalog/1.old.json'), 'utf8'), before);
    const index = JSON.parse(readFileSync(path.join(output, 'catalog.json'), 'utf8'));
    assert.deepEqual(index.brawlers.map((row) => row.brawlerId), [1, 16000109, 16000110]);
    const oldRow = index.brawlers[0];
    const merged = JSON.parse(readFileSync(path.join(output, oldRow.shard.slice(prefix.length)), 'utf8'));
    assert.equal(merged.defaults[0].animations.HeroScreenAnim.exported.url, `${prefix}animations/1/open.glb`);
    assert.deepEqual(merged.releasedSkins, oldShard.releasedSkins);
    assert.equal(existsSync(path.join(output, 'faces/1/loop.bin')), true);
    assert.equal(existsSync(path.join(output, 'models/16000110.glb')), true);
    assert.throws(() => mergeBrawlHeroPackage(options), /already exists/);

    asset(source, 'animations/1/open.glb');
    writeFileSync(path.join(source, 'animations/1/open.glb'), 'old release bytes');
    assert.throws(
      () => mergeBrawlHeroPackage(new Map([...options, ['output-dir', path.join(root, 'collision')]])),
      /Asset URL collision with different bytes: \/assets\/brawlers\/3d\/animations\/1\/open\.glb/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
