const mutableCatalogPath = /^(?:catalog\.json|catalog\/.+\.json)$/;

export function isMutableBrawlerAssetPath(assetPath: string): boolean {
  return mutableCatalogPath.test(assetPath.replace(/\\/g, "/"));
}

export function brawlerAssetCacheControl(assetPath: string): string {
  return isMutableBrawlerAssetPath(assetPath)
    ? "no-cache, must-revalidate"
    : "public, max-age=31536000, immutable";
}
