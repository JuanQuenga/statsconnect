const CDN = "https://cdn.brawlify.com";

function cdnImage(path: string) {
  return `${CDN}/${path.replace(/^\//, "")}`;
}

function localImage(path: string) {
  return `${import.meta.env?.BASE_URL ?? "/"}${path.replace(/^\//, "")}`;
}

export function profileIconUrl(id?: number | null) {
  return cdnImage(`profile-icons/regular/${Number(id) || 28000000}.png`);
}

export function clubBadgeUrl(id?: number | null) {
  return cdnImage(`club-badges/regular/${Number(id) || 8000000}.png`);
}

export function brawlerBorderUrl(id: number) {
  return BRAWLER_OFFICIAL_ART[id] || cdnImage(`brawlers/borders/${id}.png`);
}

export function brawlerModelUrl(id: number) {
  const officialArt = BRAWLER_OFFICIAL_ART[id];
  if (officialArt) return officialArt;
  if (id === 16000107 || id === 16000108) return brawlerPortraitUrl(id);
  return cdnImage(`brawlers/model/${id}.png`);
}

export function brawlerPortraitUrl(id: number) {
  return BRAWLER_OFFICIAL_ART[id] || cdnImage(`brawlers/portraits/${id}.png`);
}

const BRAWLER_OFFICIAL_ART: Readonly<Partial<Record<number, string>>> = {
  16000109: localImage("assets/brawlers/portraits/16000109.png"),
  16000110: localImage("assets/brawlers/portraits/16000110.png"),
};

export function brawlerHeroArtwork(id: number) {
  const featureArt = brawlerFeatureArtUrl(id);
  return {
    artworkMaxWidth: BRAWLER_OFFICIAL_ART[id] ? 250 : undefined,
    fallbackSrc: brawlerPortraitUrl(id),
    kind: "model" as const,
    src: featureArt || brawlerModelUrl(id),
  };
}

export function abilityImageUrl(kind: "gadgets" | "star-powers", id: number) {
  return cdnImage(`${kind}/regular/${id}.png`);
}

const BRAWLER_FEATURE_ART: Readonly<Partial<Record<number, string>>> = {
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
