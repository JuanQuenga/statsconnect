import { ConvexHttpClient } from "convex/browser";
import { api } from "../packages/backend/convex/_generated/api.js";
import { mapClanBundle } from "../apps/clashcrown/src/lib/clash/mappers.ts";
import { configuredBackend, type ProfileIdentity } from "./profile-data.ts";
import { injectDocumentHead } from "./profile-metadata.ts";
import { pageHeadTags } from "./site-pages.ts";

/** Clubs and clans use the same tag alphabet and query shape as player profiles. */
export type ClubIdentity = ProfileIdentity;
export type ClubSummary = Readonly<{ name: string; members: number; trophies?: number; type?: string }>;

const gameName = { cr: "Clash Royale", bs: "Brawl Stars" } as const;
const groupName = { cr: "clan", bs: "club" } as const;
const capacity = { cr: 50, bs: 30 } as const;
/** Keyed loosely: the API sends `inviteOnly`, the Clash mapper `Invite Only`. */
const joinPolicy: Record<string, string> = { open: "Open to join", inviteonly: "Invite only", closed: "Closed" };
const policy = (type?: string) => type ? joinPolicy[type.replace(/\s+/g, "").toLowerCase()] : undefined;

export function clubUrl({ game, tag }: ClubIdentity): string {
  return game === "cr"
    ? `https://cr.statsconnect.app/clans/${encodeURIComponent(tag)}`
    : `https://bs.statsconnect.app/clubs?tag=${encodeURIComponent(`#${tag}`)}`;
}

export async function loadClub(identity: ClubIdentity): Promise<ClubSummary> {
  const { convexUrl, convexSiteUrl } = await configuredBackend();
  if (identity.game === "cr") {
    const client = new ConvexHttpClient(convexUrl, { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(12000) }) });
    const clan = mapClanBundle(await client.action(api.clash.clashApi.getClanBundle, { tag: identity.tag }));
    return { name: clan.name, members: clan.members.length, trophies: clan.score, type: clan.type };
  }
  const url = new URL("/api/club", convexSiteUrl);
  url.searchParams.set("tag", `#${identity.tag}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Club lookup failed with ${response.status}`);
  return brawlClub(await response.json());
}

/** Keep the server boundary explicit instead of trusting external JSON as ClubProfile. */
export function brawlClub(value: unknown): ClubSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid club response");
  const source = value as Record<string, unknown>;
  if (typeof source.name !== "string" || !source.name) throw new Error("Invalid club response");
  return {
    name: source.name,
    members: Array.isArray(source.members) ? source.members.length : 0,
    ...(typeof source.trophies === "number" ? { trophies: source.trophies } : {}),
    ...(typeof source.type === "string" ? { type: source.type } : {}),
  };
}

/** Link-preview metadata for a shared club or clan; these pages stay out of search indexes. */
export function clubMetadata(shell: string, identity: ClubIdentity, club?: ClubSummary): string {
  const game = gameName[identity.game];
  const group = groupName[identity.game];
  const title = club ? `${club.name} · ${game} ${group} · StatsConnect` : `${game} ${group} #${identity.tag} · StatsConnect`;
  const facts = club ? [
    `${club.members}/${capacity[identity.game]} members`,
    ...(club.trophies === undefined ? [] : [`${club.trophies.toLocaleString("en-US")} trophies`]),
    ...(policy(club.type) ? [policy(club.type)] : []),
  ].join(" · ") : "";
  const description = club
    ? `${facts}. See every member's trophies and activity in ${club.name} on StatsConnect.`
    : `Explore this ${game} ${group} on StatsConnect.`;
  return injectDocumentHead(shell, [...pageHeadTags(title, description, clubUrl(identity)), '<meta name="robots" content="noindex, follow" />']);
}
