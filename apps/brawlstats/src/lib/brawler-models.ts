import { appPath } from "./paths.ts";

const MODEL_ASSET_ROOT = "/assets/brawlers/3d";

export type BrawlerModelAsset = {
  readonly filename: string;
  readonly yaw?: number;
};

/**
 * Default brawler models confirmed in the last standard-glTF asset release.
 * Newer releases use Supercell's FLA2 format, so unsupported brawlers must keep
 * the official 2D artwork instead of receiving a guessed or unrelated model.
 * New entries must pass geometry, animation, material, orientation, and
 * attachment QA before they are added here.
 */
export const BRAWLER_MODEL_ASSETS: Readonly<Record<number, BrawlerModelAsset>> = {
  16000018: { filename: "16000018.glb" },
  16000022: { filename: "16000022.glb" },
  16000045: { filename: "16000045.glb" },
  16000080: { filename: "16000080.glb" },
};

export function brawlerModel3dAsset(brawlerId: number): BrawlerModelAsset | undefined {
  if (!Number.isSafeInteger(brawlerId)) return undefined;
  return BRAWLER_MODEL_ASSETS[brawlerId];
}

export function brawlerModel3dUrl(brawlerId: number): string | undefined {
  const asset = brawlerModel3dAsset(brawlerId);
  return asset ? appPath(`${MODEL_ASSET_ROOT}/${asset.filename}`) : undefined;
}
