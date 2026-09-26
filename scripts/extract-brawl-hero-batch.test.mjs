import assert from 'node:assert/strict';
import test from 'node:test';
import { extractHeroBatch } from './extract-brawl-hero-batch.mjs';

const skin = (brawlerId, skinId, released = true, ready = true, clips = true) => ({
  brawlerId, skinId, released,
  sourceReadiness: { readyForConversion: ready },
  conversionPlan: {
    model: { input: 'model.glb' },
    texture: { input: 'texture.sctx' },
    animations: { IdleAnim: {}, HeroScreenAnim: {}, ...(clips ? { HeroScreenLoopAnim: {} } : {}) },
    faces: { IdleFace: {}, HeroScreenFace: {}, HeroScreenLoopFace: {} },
  },
});

test('selects released source-ready defaults and only their hero roles', () => {
  const source = { schemaVersion: 1, skins: [
    skin(3, 'ThreeAlternate'), skin(3, 'ThreeDefault'),
    skin(1, 'OneDefault'), skin(2, 'TwoDefault', false),
    skin(4, 'FourDefault', true, false), skin(5, 'FiveDefault', true, true, false),
    skin(6, 'SixOldDefault', true, false), skin(6, 'SixDefault'),
  ] };
  const batch = extractHeroBatch(source);
  assert.deepEqual(batch.skins.map(({ brawlerId }) => brawlerId), [1, 3, 6]);
  assert.equal(batch.skins[2].skinId, 'SixDefault');
  assert.deepEqual(Object.keys(batch.skins[0].conversionPlan.animations), ['HeroScreenAnim', 'HeroScreenLoopAnim']);
  assert.deepEqual(Object.keys(batch.skins[0].conversionPlan.faces), ['HeroScreenFace', 'HeroScreenLoopFace']);
  assert.deepEqual(source.skins[2].conversionPlan.animations, { IdleAnim: {}, HeroScreenAnim: {}, HeroScreenLoopAnim: {} });
});
