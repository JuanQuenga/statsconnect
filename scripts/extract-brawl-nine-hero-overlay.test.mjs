import assert from 'node:assert/strict';
import test from 'node:test';
import { extractNineHeroOverlay, NINE_DEFAULT_IDS } from './extract-brawl-nine-hero-overlay.mjs';

test('makes explicit animation-only plans and expands composite converter inputs', () => {
  const defaults = NINE_DEFAULT_IDS.map((id) => ({
    brawlerId: id,
    skinId: `${id}Default`,
    released: true,
    source: { model: id === 16000011 ? 'mortis_redux_geo.glb:cape_GEO+head_GEO' : 'raw_geo.glb' },
    sourceReadiness: { readyForConversion: false },
    conversionPlan: {
      key: `${id}-Default`, model: null, texture: null,
      animations: { IdleAnim: {}, HeroScreenAnim: { symbol: 'open' }, HeroScreenLoopAnim: { symbol: 'loop' } },
      faces: { IdleFace: {}, HeroScreenFace: { symbol: 'open-face' }, HeroScreenLoopFace: { symbol: 'loop-face' } },
    },
  }));
  const manifest = { schemaVersion: 1, source: { commit: 'test' }, defaults };
  const batch = extractNineHeroOverlay(manifest);
  assert.deepEqual(batch.skins.map((skin) => skin.brawlerId), NINE_DEFAULT_IDS);
  assert.deepEqual(Object.keys(batch.skins[0].conversionPlan.animations), ['HeroScreenAnim', 'HeroScreenLoopAnim']);
  assert.deepEqual(Object.keys(batch.skins[0].conversionPlan.faces), ['HeroScreenFace', 'HeroScreenLoopFace']);
  assert.equal(batch.skins.find((skin) => skin.brawlerId === 16000011).conversionPlan.model.input, '69.230/sc3d/mortis_redux_geo.glb');
  assert.equal(batch.skins.every((skin) => skin.sourceReadiness.readyForConversion), true);
  assert.equal(defaults[0].sourceReadiness.readyForConversion, false);
});
