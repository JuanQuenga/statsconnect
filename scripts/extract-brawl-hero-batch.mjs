/** Select source-ready default skins and their two native hero screen roles. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function extractHeroBatch(manifest) {
  const firstByBrawler = new Map();
  for (const skin of manifest.skins) {
    if (skin.released && skin.skinId.endsWith('Default') && skin.sourceReadiness?.readyForConversion &&
        skin.conversionPlan?.animations?.HeroScreenAnim && skin.conversionPlan?.animations?.HeroScreenLoopAnim &&
        !firstByBrawler.has(skin.brawlerId)) firstByBrawler.set(skin.brawlerId, skin);
  }
  const skins = [...firstByBrawler.values()]
    .map((skin) => {
      const roles = ['HeroScreenAnim', 'HeroScreenLoopAnim'];
      const faceRoles = ['HeroScreenFace', 'HeroScreenLoopFace'];
      return {
        ...skin,
        conversionPlan: {
          ...skin.conversionPlan,
          animations: Object.fromEntries(roles.filter((key) => skin.conversionPlan.animations[key]).map((key) => [key, skin.conversionPlan.animations[key]])),
          faces: Object.fromEntries(faceRoles.filter((key) => skin.conversionPlan.faces[key]).map((key) => [key, skin.conversionPlan.faces[key]])),
        },
      };
    })
    .sort((left, right) => left.brawlerId - right.brawlerId);
  return { schemaVersion: manifest.schemaVersion, source: manifest.source, skins };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/extract-brawl-hero-batch.mjs <build-manifest.json> <hero-batch.build.json>');
  const batch = extractHeroBatch(JSON.parse(readFileSync(input, 'utf8')));
  mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  writeFileSync(output, `${JSON.stringify(batch, null, 2)}\n`);
  console.log(`Selected ${batch.skins.length} source-ready defaults with both hero clips`);
}
