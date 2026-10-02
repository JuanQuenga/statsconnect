import { readFile } from "node:fs/promises";
import path from "node:path";
import { profileImageUrl, profileUrl, type LoadedProfile, type ProfileIdentity } from "./profile-data.ts";

function html(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
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
  const tags = [
    `<title>${html(title)}</title>`,
    `<meta name="description" content="${html(description)}" />`,
    `<link rel="canonical" href="${html(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="StatsConnect" />`,
    `<meta property="og:title" content="${html(title)}" />`,
    `<meta property="og:description" content="${html(description)}" />`,
    `<meta property="og:url" content="${html(url)}" />`,
    `<meta property="og:image" content="${html(image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    ...(profile ? ['<meta property="og:image:width" content="1600" />', '<meta property="og:image:height" content="1000" />'] : []),
    `<meta property="og:image:alt" content="${html(title)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${html(title)}" />`,
    `<meta name="twitter:description" content="${html(description)}" />`,
    `<meta name="twitter:image" content="${html(image)}" />`,
    `<meta name="twitter:image:alt" content="${html(title)}" />`,
  ].join("\n    ");
  return shell
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*(?:property\s*=\s*["']og:|name\s*=\s*["'](?:twitter:|description["']))[^>]*>/gi, "")
    .replace(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi, "")
    .replace(/<\/head>/i, () => `${tags}\n  </head>`);
}

export async function applicationShell(): Promise<string> {
  return readFile(path.join(process.cwd(), "dist/index.html"), "utf8");
}
