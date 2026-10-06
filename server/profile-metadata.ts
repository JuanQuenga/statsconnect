import { readFile } from "node:fs/promises";
import path from "node:path";
import { profileImageUrl, profileUrl, type LoadedProfile, type ProfileIdentity } from "./profile-data.ts";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}

/** Replace the shell's title, description, canonical, and social tags with route-specific ones. */
export function injectDocumentHead(shell: string, tags: readonly string[]): string {
  return shell
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*(?:property\s*=\s*["']og:|name\s*=\s*["'](?:twitter:|description["']))[^>]*>/gi, "")
    .replace(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi, "")
    .replace(/<\/head>/i, () => `${tags.join("\n    ")}\n  </head>`);
}

export function profileMetadata(shell: string, identity: ProfileIdentity, profile?: LoadedProfile): string {
  const game = identity.game === "cr" ? "Clash Royale" : "Brawl Stars";
  const title = profile ? `${profile.player.name} · ${game} · StatsConnect` : `${game} player #${identity.tag} · StatsConnect`;
  const trophies = profile?.player.trophies;
  const description = profile
    ? `${profile.player.name}${trophies === undefined ? "" : ` · ${trophies.toLocaleString("en-US")} trophies`} · ${identity.game === "cr" ? "Current deck and player stats" : "Top brawlers and player stats"} on StatsConnect.`
    : `Explore this ${game} player profile on StatsConnect.`;
  const image = profile ? profileImageUrl(identity) : "https://statsconnect.app/og.png";
  const url = profileUrl(identity);
  // Per-player pages are programmatic data views; keep them out of search
  // indexes until they carry unique rendered value, while link discovery
  // (follow) stays intact.
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    '<meta name="robots" content="noindex, follow" />',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="StatsConnect" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    ...(profile ? ['<meta property="og:image:width" content="1600" />', '<meta property="og:image:height" content="1000" />'] : []),
    `<meta property="og:image:alt" content="${escapeHtml(title)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(title)}" />`,
  ];
  return injectDocumentHead(shell, tags);
}

export async function applicationShell(): Promise<string> {
  return readFile(path.join(process.cwd(), "dist/index.html"), "utf8");
}
