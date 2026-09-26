/** Build an animation-only conversion plan for the nine v69 incomplete defaults. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const NINE_DEFAULT_IDS = [16000003, 16000010, 16000011, 16000016, 16000023, 16000024, 16000053, 16000080, 16000087];

export function extractNineHeroOverlay(manifest) {
  const skins = NINE_DEFAULT_IDS.map((id) => {
    const source = manifest.defaults.find((entry) => entry.brawlerId === id);
    if (!source?.skinId?.endsWith('Default')) throw new Error(`Missing default source for ${id}`);
    const plan = source.conversionPlan;
    if (!plan?.animations?.HeroScreenAnim || !plan.animations.HeroScreenLoopAnim) throw new Error(`Missing hero animation plan for ${id}`);
    const animations = Object.fromEntries(['HeroScreenAnim', 'HeroScreenLoopAnim'].map((key) => [key, plan.animations[key]]));
    const faces = Object.fromEntries(['HeroScreenFace', 'HeroScreenLoopFace'].filter((key) => plan.faces[key]).map((key) => [key, plan.faces[key]]));
    const model = [16000010, 16000011].includes(id)
      ? { input: `69.230/sc3d/${source.source.model.split(':')[0]}`, output: `models/${plan.key}.glb` }
      : plan.model;
    return {
      ...source,
      // Materialization's selection gate expects a full runtime. This plan
      // only publishes body/face clips; the delivered model remains the donor.
      sourceReadiness: { ...source.sourceReadiness, readyForConversion: true },
      conversionPlan: { ...plan, model, animations, faces },
    };
  });
  return { schemaVersion: manifest.schemaVersion, source: manifest.source, skins };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/extract-brawl-nine-hero-overlay.mjs <build-manifest.json> <nine-hero.build.json>');
  const batch = extractNineHeroOverlay(JSON.parse(readFileSync(input, 'utf8')));
  mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  writeFileSync(output, `${JSON.stringify(batch, null, 2)}\n`);
  console.log(`Selected ${batch.skins.length} animation-only defaults`);
}
