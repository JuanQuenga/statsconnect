const CDN = "https://cdn.brawlify.com";

function cdnImage(path: string) {
  return `${CDN}/${path.replace(/^\//, "")}`;
}

export function profileIconUrl(id?: number | null) {
  return cdnImage(`profile-icons/regular/${Number(id) || 28000000}.png`);
}

export function clubBadgeUrl(id?: number | null) {
  return cdnImage(`club-badges/regular/${Number(id) || 8000000}.png`);
}

export function brawlerBorderUrl(id: number) {
  return cdnImage(`brawlers/borders/${id}.png`);
}

export function brawlerModelUrl(id: number) {
  return cdnImage(`brawlers/model/${id}.png`);
}

type BrawlerHeroArtMetadata = Readonly<{
  imageUrl?: string;
  imageUrl2?: string;
  imageUrl3?: string;
}>;

export function brawlerHeroArtwork(id: number, metadata: BrawlerHeroArtMetadata) {
  const featureArt = brawlerFeatureArtUrl(id);
  return {
    fallbackSrc: metadata.imageUrl2 || metadata.imageUrl || metadata.imageUrl3 || brawlerBorderUrl(id),
    kind: featureArt ? "feature" as const : "model" as const,
    src: featureArt || brawlerModelUrl(id),
  };
}

const BRAWLER_FEATURE_ART: Readonly<Record<number, string>> = {
  16000107: "https://brawlstars.inbox.supercell.com/xdjcscmv3zo3/4CF9yj49X04L66kRTG2ZyI/5410496b3d48d6c65fec7072099e4f2e/800x433.png",
};

export function brawlerFeatureArtUrl(id: number) {
  return BRAWLER_FEATURE_ART[id];
}

export function mapImageUrl(id: number) {
  return cdnImage(`maps/regular/${id}.png`);
}

export function gameModeImageUrl(id: number) {
  return cdnImage(`game-modes/regular/${id}.png`);
}

const EVENT_MODE_IDS: Readonly<Record<string, number>> = {
  bigGame: 48000009,
  bossFight: 48000010,
  bounty: 48000003,
  brawlBall: 48000005,
  duoShowdown: 48000006,
  gemGrab: 48000000,
  heist: 48000002,
  hotZone: 48000015,
  knockout: 48000020,
  roboRumble: 48000008,
  showdown: 48000006,
  siege: 48000012,
  wipeout: 48000025,
};

export function eventModeId(mode?: string | null) {
  if (!mode) return 48000000;
  return EVENT_MODE_IDS[mode] || 48000000;
}
