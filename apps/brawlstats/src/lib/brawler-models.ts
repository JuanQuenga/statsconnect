const MODEL_CDN = "https://raw.githubusercontent.com/tailsjs/brawl-stars-assets/master/55.243/sc3d";

export type BrawlerModelAsset = {
  modelFilename: string;
  textureFilename: string;
  animationFilename?: string;
};

/**
 * Default brawler models confirmed in the last standard-glTF asset release.
 * Newer releases use Supercell's FLA2 format, so unsupported brawlers must keep
 * the official 2D artwork instead of receiving a guessed or unrelated model.
 */
export const BRAWLER_MODEL_ASSETS: Readonly<Record<number, BrawlerModelAsset>> = {
  16000000: { modelFilename: "shelly_redux_geo.glb", textureFilename: "shelly_redux_tex.ktx" },
  16000001: { modelFilename: "colt_redux_geo.glb", textureFilename: "colt_redux_tex.ktx" },
  16000002: { modelFilename: "bull_redux_geo.glb", textureFilename: "bull_tex.ktx" },
  16000007: { modelFilename: "jessie_geo.glb", textureFilename: "jessie_tex.ktx", animationFilename: "jessie_idle.glb" },
  16000009: { modelFilename: "dynamike_geo.glb", textureFilename: "dynamike_tex.ktx" },
  16000012: { modelFilename: "crow_geo.glb", textureFilename: "crow_tex.ktx", animationFilename: "crow_idle.glb" },
  16000018: { modelFilename: "darryl_geo.glb", textureFilename: "darryl_tex.ktx" },
  16000019: { modelFilename: "penny_geo.glb", textureFilename: "penny_tex.ktx", animationFilename: "penny_idle.glb" },
  16000021: { modelFilename: "gene_geo.glb", textureFilename: "gene_tex.ktx" },
  16000022: { modelFilename: "tick_geo.glb", textureFilename: "tick_tex.ktx" },
  16000038: { modelFilename: "surge_geo.glb", textureFilename: "surge_tex.ktx", animationFilename: "surge_idle.glb" },
  16000045: { modelFilename: "stu_geo.glb", textureFilename: "stu_tex.ktx", animationFilename: "stu_idle.glb" },
  16000046: { modelFilename: "belle_geo.glb", textureFilename: "belle_tex.ktx", animationFilename: "belle_idle.glb" },
  16000047: { modelFilename: "squeak_geo.glb", textureFilename: "squeak_tex.ktx", animationFilename: "squeak_idle.glb" },
  16000048: { modelFilename: "grom_geo.glb", textureFilename: "grom_tex.ktx", animationFilename: "grom_idle.glb" },
  16000049: { modelFilename: "buzz_geo.glb", textureFilename: "buzz_tex.ktx", animationFilename: "buzz_idle.glb" },
  16000050: { modelFilename: "griff_geo.glb", textureFilename: "griff_tex.ktx", animationFilename: "griff_idle.glb" },
  16000051: { modelFilename: "ash_geo.glb", textureFilename: "ash_tex.ktx", animationFilename: "ash_idle.glb" },
  16000052: { modelFilename: "meg_geo.glb", textureFilename: "meg_tex.ktx", animationFilename: "meg_idle.glb" },
  16000053: { modelFilename: "lolla_geo.glb", textureFilename: "lolla_tex.ktx", animationFilename: "lolla_idle.glb" },
  16000054: { modelFilename: "fang_geo.glb", textureFilename: "fang_tex.ktx", animationFilename: "fang_idle.glb" },
  16000056: { modelFilename: "eve_geo.glb", textureFilename: "eve_tex.ktx", animationFilename: "eve_idle.glb" },
  16000057: { modelFilename: "janet_geo.glb", textureFilename: "janet_tex.ktx", animationFilename: "janet_idle.glb" },
  16000058: { modelFilename: "clyde_geo.glb", textureFilename: "bonnie_tex.ktx" },
  16000059: { modelFilename: "otis_geo.glb", textureFilename: "otis_tex.ktx", animationFilename: "otis_idle.glb" },
  16000060: { modelFilename: "bronson_geo.glb", textureFilename: "bronson_tex.ktx", animationFilename: "bronson_idle.glb" },
  16000061: { modelFilename: "gus_geo.glb", textureFilename: "gus_tex.ktx", animationFilename: "gus_idle.glb" },
  16000062: { modelFilename: "buster_geo.glb", textureFilename: "buster_tex.ktx", animationFilename: "buster_idle.glb" },
  16000063: { modelFilename: "chester_geo.glb", textureFilename: "chester_tex.ktx", animationFilename: "chester_idle.glb" },
  16000064: { modelFilename: "gray_geo.glb", textureFilename: "gray_tex.ktx", animationFilename: "gray_idle.glb" },
  16000065: { modelFilename: "mandy_geo.glb", textureFilename: "mandy_tex.ktx", animationFilename: "mandy_idle.glb" },
  16000066: { modelFilename: "rt_geo.glb", textureFilename: "rt_tex.ktx", animationFilename: "rt_idle.glb" },
  16000067: { modelFilename: "willow_geo.glb", textureFilename: "willow_tex.ktx", animationFilename: "willow_idle.glb" },
  16000068: { modelFilename: "maisie_geo.glb", textureFilename: "maisie_tex.ktx", animationFilename: "maisie_idle.glb" },
  16000069: { modelFilename: "fishtank_geo.glb", textureFilename: "fishtank_tex.ktx", animationFilename: "fishtank_idle.glb" },
  16000070: { modelFilename: "cordelius_geo.glb", textureFilename: "cordelius_tex.ktx", animationFilename: "cordelius_idle.glb" },
  16000071: { modelFilename: "doug_geo.glb", textureFilename: "doug_tex.ktx", animationFilename: "doug_idle.glb" },
  16000072: { modelFilename: "pearl_geo.glb", textureFilename: "pearl_base_tex.ktx", animationFilename: "pearl_idle.glb" },
  16000073: { modelFilename: "chuck_geo.glb", textureFilename: "chuck_tex.ktx", animationFilename: "chuck_idle.glb" },
  16000074: { modelFilename: "charlie_geo.glb", textureFilename: "charlie_tex.ktx", animationFilename: "charlie_idle.glb" },
  16000075: { modelFilename: "mico_geo.glb", textureFilename: "mico_tex.ktx", animationFilename: "mico_idle.glb" },
  16000076: { modelFilename: "kit_geo.glb", textureFilename: "kit_tex.ktx", animationFilename: "kit_idle.glb" },
  16000077: { modelFilename: "goodtwin_geo.glb", textureFilename: "twins_good_tex.ktx", animationFilename: "goodtwin_idle.glb" },
  16000078: { modelFilename: "melodie_geo.glb", textureFilename: "melodie_tex.ktx", animationFilename: "melodie_idle.glb" },
  16000079: { modelFilename: "angelo_geo.glb", textureFilename: "angelo_tex.ktx", animationFilename: "angelo_idle.glb" },
  16000080: { modelFilename: "draco_geo.glb", textureFilename: "draco_tex.ktx", animationFilename: "draco_idle.glb" },
  16000081: { modelFilename: "lily_geo.glb", textureFilename: "lily_tex.ktx", animationFilename: "lily_idle.glb" },
};

export function brawlerModel3dAsset(brawlerId: number): BrawlerModelAsset | undefined {
  if (!Number.isSafeInteger(brawlerId)) return undefined;
  return BRAWLER_MODEL_ASSETS[brawlerId];
}

export function brawlerModel3dUrl(brawlerId: number): string | undefined {
  const asset = brawlerModel3dAsset(brawlerId);
  return asset ? `${MODEL_CDN}/${asset.modelFilename}` : undefined;
}

export function brawlerModelAnimationUrl(brawlerId: number): string | undefined {
  const asset = brawlerModel3dAsset(brawlerId);
  return asset?.animationFilename ? `${MODEL_CDN}/${asset.animationFilename}` : undefined;
}
