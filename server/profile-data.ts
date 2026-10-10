import { ConvexHttpClient } from "convex/browser";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { profilePreviewConfigPath, profilePreviewConfiguration, type ProfilePreviewConfiguration } from "../shared/profile-preview-config.ts";
import { api } from "../packages/backend/convex/_generated/api.js";
import { mapPlayerBundle } from "../apps/clashcrown/src/lib/clash/mappers.ts";
import type { Player } from "../apps/clashcrown/src/lib/clash/domain.ts";
import type { PlayerProfile } from "../apps/brawlstats/src/lib/types.ts";
import type { ProfileCardAnalytics } from "../apps/brawlstats/src/lib/profile-card.ts";

export type ProfileIdentity = { game: "cr" | "bs"; tag: string };
export type LoadedProfile = { game: "cr"; player: Player } | { game: "bs"; player: PlayerProfile; analytics?: ProfileCardAnalytics };
export const profileCacheControl = "public, max-age=60, s-maxage=300, stale-while-revalidate=300";

export function profileIdentity(url: URL): ProfileIdentity | undefined {
  const game = url.searchParams.get("game");
  const tag = (url.searchParams.get("tag") ?? "").trim().replace(/^#/, "").toUpperCase();
  if ((game !== "cr" && game !== "bs") || !/^[0289PYLQGRJCUV]{3,15}$/.test(tag)) return undefined;
  return { game, tag };
}

export function profileUrl({ game, tag }: ProfileIdentity): string {
  return game === "cr"
    ? `https://cr.statsconnect.app/players/${encodeURIComponent(tag)}`
    : `https://bs.statsconnect.app/players?tag=${encodeURIComponent(`#${tag}`)}`;
}

export function profileImageUrl(identity: ProfileIdentity): string {
  const url = new URL("https://statsconnect.app/api/profile-image");
  url.searchParams.set("game", identity.game);
  url.searchParams.set("tag", identity.tag);
  return url.toString();
}

export async function configuredBackend(): Promise<ProfilePreviewConfiguration> {
  const environment = profilePreviewConfiguration(process.env);
  if (environment) return environment;
  try {
    const source = record(JSON.parse(await readFile(path.join(process.cwd(), profilePreviewConfigPath), "utf8")));
    const built = profilePreviewConfiguration({ CONVEX_URL: string(source.convexUrl), CONVEX_SITE_URL: string(source.convexSiteUrl) });
    if (built) return built;
  } catch { /* Missing build configuration gets the same honest fallback as missing runtime configuration. */ }
  throw new Error("Profile preview backend is not configured");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid player response");
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid player response");
  return value;
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid player response");
  return value;
}

/** Keep the server boundary explicit instead of treating external JSON as PlayerProfile. */
function brawlPlayer(value: unknown): PlayerProfile {
  const source = record(value);
  const icon = source.icon ? record(source.icon) : undefined;
  const club = source.club ? record(source.club) : undefined;
  return {
    tag: string(source.tag), name: string(source.name),
    trophies: number(source.trophies), highestTrophies: number(source.highestTrophies),
    expLevel: number(source.expLevel), expPoints: number(source.expPoints),
    ...(source["3vs3Victories"] !== undefined ? { "3vs3Victories": number(source["3vs3Victories"]) } : {}),
    ...(icon ? { icon: { id: number(icon.id) } } : {}),
    ...(club && typeof club.name === "string" ? { club: { name: club.name } } : {}),
    ...(Array.isArray(source.brawlers) ? { brawlers: source.brawlers.map((value: unknown) => {
      const brawler = record(value);
      return {
        id: number(brawler.id), name: string(brawler.name), power: number(brawler.power), rank: number(brawler.rank),
        trophies: number(brawler.trophies), highestTrophies: number(brawler.highestTrophies),
      };
    }) } : {}),
  };
}

export async function loadProfile(identity: ProfileIdentity): Promise<LoadedProfile> {
  const { convexUrl, convexSiteUrl } = await configuredBackend();
  if (identity.game === "cr") {
    const client = new ConvexHttpClient(convexUrl, { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(12000) }) });
    const payload = await client.action(api.clash.clashApi.getPlayerBundle, { tag: identity.tag });
    return { game: "cr", player: mapPlayerBundle(payload) };
  }
  const url = new URL("/api/player", convexSiteUrl);
  url.searchParams.set("tag", `#${identity.tag}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Player lookup failed with ${response.status}`);
  const payload = record(await response.json());
  const player = brawlPlayer(payload.player);
  const analytics = await brawlAnalytics(convexSiteUrl, identity.tag);
  return { game: "bs", player, analytics };
}

async function brawlAnalytics(siteUrl: string, tag: string): Promise<ProfileCardAnalytics | undefined> {
  try {
    const url = new URL("/api/player-analytics", siteUrl);
    url.searchParams.set("tag", `#${tag}`);
    url.searchParams.set("limit", "1");
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return undefined;
    const payload = record(await response.json());
    if (!Array.isArray(payload.summaries)) return undefined;
    return { summaries: payload.summaries.map((value: unknown) => {
      const summary = record(value);
      return { days: number(summary.days), battles: number(summary.battles), wins: number(summary.wins), losses: number(summary.losses) };
    }) };
  } catch { return undefined; }
}
