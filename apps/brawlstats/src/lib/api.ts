import { stripSupercellColorTags } from "./format";

const CDN = "https://cdn.brawlify.com";

const configured =
  import.meta.env.VITE_CONVEX_SITE_URL || import.meta.env.VITE_CONVEX_URL || "";

export const apiBaseUrl = configured.replace(".convex.cloud", ".convex.site").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function cleanApiPayload(value: unknown): unknown {
  if (typeof value === "string") return stripSupercellColorTags(value);
  if (Array.isArray(value)) return value.map(cleanApiPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cleanApiPayload(entry)]),
    );
  }
  return value;
}

export async function apiFetch<T>(path: string): Promise<T> {
  if (!apiBaseUrl) {
    throw new ApiError("Set VITE_CONVEX_SITE_URL to your Convex HTTP Actions URL.", 503, "NOT_CONFIGURED");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Accept: "application/json" },
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("The backend returned an unreadable response.", response.status);
  }

  if (!response.ok) {
    const body = payload as { message?: string; error?: string };
    throw new ApiError(body.message || "The Brawl Stars API request failed.", response.status, body.error);
  }

  return cleanApiPayload(payload) as T;
}

export function collection<T = unknown>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as T[];
    if (Array.isArray(obj.list)) return obj.list as T[];
  }
  return [];
}

export function cdnImage(path: string) {
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

const BRAWLER_FEATURE_ART: Record<number, string> = {
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

export const EVENT_MODE_IDS: Record<string, number> = {
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
