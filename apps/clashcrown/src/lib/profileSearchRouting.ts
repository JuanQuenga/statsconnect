import { normalizeTag } from "./clash/profileIdentity.ts";

export function profileSearchDestination({
  term, kind, open, highlight, rows, results,
}: {
  term: string;
  kind: "players" | "clans";
  open: boolean;
  highlight: number;
  rows: readonly { href: string }[];
  results?: { tag?: string | null; players: readonly { tag: string }[] };
}): string {
  if (open && highlight >= 0 && rows[highlight]) return rows[highlight].href;
  if (kind === "clans") {
    try {
      return `/clans/${normalizeTag(term)}`;
    } catch {
      return `/clans/search?name=${encodeURIComponent(term)}`;
    }
  }
  if (results?.tag && !results.players.length) return `/players/${results.tag}`;
  if (!results?.tag && results?.players.length === 1) return `/players/${results.players[0].tag}`;
  return `/players?q=${encodeURIComponent(term)}`;
}
