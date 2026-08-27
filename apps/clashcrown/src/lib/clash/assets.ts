/**
 * Asset resolution for Clash Royale entities.
 *
 * Hybrid strategy:
 * - Card art and clan badges come from the icon URLs the official API returns
 *   (Supercell's own CDN), so newly released cards and badges never 404.
 * - Everything the API only identifies by numeric id or display name (arenas,
 *   chests, war leagues, levels) resolves to assets vendored under
 *   `public/images`, copied from RoyaleAPI/cr-api-assets.
 *
 * Vendored assets are committed rather than hotlinked: cr-api-assets is
 * NOASSERTION-licensed and its README asks consumers to clone rather than treat
 * it as a CDN.
 */

import type { ApiArena, ApiCard, ApiIconUrls } from "./types";

export const UNKNOWN_CARD_IMAGE = "/images/cards/unknown-v2.webp";
export const NO_CLAN_BADGE_IMAGE = "/images/clan-badges/no-clan-v2.webp";

/** Normalizes a display name into the filename convention used by cr-api-assets. */
export function slugify(value: string) {
  return value
    .toLowerCase()
    .replaceAll(".", "")
    .replaceAll("'", "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Vendored portrait path used when an API-hosted card image fails to load. */
export function vendoredCardImage(name: string, variant?: "Evolution" | "Hero"): string {
  const suffix = variant === "Hero" ? "-hero" : variant === "Evolution" ? "-ev1" : "";
  return `/images/cards/${slugify(name)}${suffix}.png`;
}

/** Ordered recovery chain for remote card art, preserving variant art when available. */
export function cardArtFallbacks(card: { name: string; variant?: "Evolution" | "Hero" }): string[] {
  const base = vendoredCardImage(card.name);
  const candidates = card.variant
    ? [vendoredCardImage(card.name, card.variant), base, UNKNOWN_CARD_IMAGE]
    : [base, UNKNOWN_CARD_IMAGE];
  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
}

/**
 * Evolution and Hero art. Both are wholly separate assets rather than the base
 * card with a badge on it — their own frame, gem and pose. Some cards now have
 * both forms, so availability alone cannot choose the active one.
 * `evolutionMedium` / `heroMedium` are the trustworthy "this card has a
 * variant" signals: `maxEvolutionLevel` is also set on Hero cards that have no
 * Evolution at all, so reading it as "can evolve"
 * is what put an EVO badge on Balloon, Bowler and Tombstone.
 */
/** Cards with vendored -hero art under public/images/cards, per scripts/sync-assets.mjs. */
const HERO_CARD_SLUGS = new Set([
  "barbarian-barrel",
  "giant",
  "goblins",
  "ice-golem",
  "knight",
  "magic-archer",
  "mega-minion",
  "mini-pekka",
  "musketeer",
  "wizard"
]);

/** Identifies the active variant on a deck slot, including battle payloads that omit variant-specific URLs. */
export function activeCardVariant(card: Pick<ApiCard, "name" | "evolutionLevel" | "iconUrls">): "Evolution" | "Hero" | undefined {
  if ((card.evolutionLevel ?? 0) <= 0) return undefined;
  if (card.iconUrls?.heroMedium || HERO_CARD_SLUGS.has(slugify(card.name))) return "Hero";
  return "Evolution";
}

export function evolutionCardImage(card: { iconUrls?: ApiIconUrls }): string | undefined {
  return card.iconUrls?.evolutionMedium;
}

export function heroCardImage(card: { iconUrls?: ApiIconUrls }): string | undefined {
  return card.iconUrls?.heroMedium;
}

/**
 * The art for a slot the battle data marks as evolved.
 *
 * The API overloads `evolutionLevel` across both mechanics: a Hero slot also
 * comes back with an evolution level, and Goblins, Balloon and the other nine
 * Hero cards have no Evolution art to show for it. So an evolved slot means
 * "played as its variant", and which variant that is follows from the art the
 * card actually has.
 */
export function variantArt(card?: { evolutionImage?: string; heroImage?: string }):
  | { src: string; label: "Evolution" | "Hero" }
  | undefined {
  if (card?.evolutionImage) return { src: card.evolutionImage, label: "Evolution" };
  if (card?.heroImage) return { src: card.heroImage, label: "Hero" };
  return undefined;
}

/** Artwork for a player-owned card, based on the variant that is actually active. */
export function selectCardArt(card: {
  image: string;
  variant?: "Evolution" | "Hero";
  evolutionImage?: string;
  heroImage?: string;
}): { src: string; variant: "Evolution" | "Hero" | undefined } {
  if (card.variant === "Hero" && card.heroImage) {
    return { src: card.heroImage, variant: "Hero" };
  }
  if (card.variant === "Evolution" && card.evolutionImage) {
    return { src: card.evolutionImage, variant: "Evolution" };
  }
  return { src: card.image, variant: card.variant };
}

/** Best portrait advertised by the catalog, independent of a player's active deck variant. */
export function highestAvailableCardArt(card: {
  image: string;
  evolutionImage?: string;
  heroImage?: string;
}): string {
  return card.heroImage ?? card.evolutionImage ?? card.image;
}

/**
 * Card art. Prefers the API's own icon URLs so the catalog is self-healing;
 * falls back to the vendored copy for demo data and any response that predates
 * `iconUrls`.
 */
export function cardImage(card: {
  name?: string;
  iconUrls?: ApiIconUrls;
  evolutionLevel?: number;
}): string {
  if ((card.evolutionLevel ?? 0) > 0) {
    // Hero URLs identify hero slots when the API provides them. Keep that
    // preference ahead of evolution art so a hero never falls through to an
    // EVO image merely because both variants exist on the catalog card.
    const variant = card.iconUrls?.heroMedium ?? card.iconUrls?.evolutionMedium;
    if (variant) return variant;
    if (card.name) {
      // Without API URLs the hero cards are only recognizable by name; the set
      // mirrors the -hero files vendored by scripts/sync-assets.mjs.
      const slug = slugify(card.name);
      return vendoredCardImage(card.name, HERO_CARD_SLUGS.has(slug) ? "Hero" : "Evolution");
    }
  }
  if (card.iconUrls?.medium) return card.iconUrls.medium;
  if (!card.name) return UNKNOWN_CARD_IMAGE;
  return vendoredCardImage(card.name);
}

/** Clan badge. `badgeUrls` is present on full clan responses; rankings give only `badgeId`. */
export function badgeImage(badgeId?: number, badgeUrls?: ApiIconUrls): string {
  const fromApi = badgeUrls?.large ?? badgeUrls?.medium ?? badgeUrls?.small;
  if (fromApi) return fromApi;
  if (typeof badgeId === "number" && badgeId > 0) return `/images/clan-badges/${badgeId}.png`;
  return NO_CLAN_BADGE_IMAGE;
}

/**
 * Arena id -> vendored asset key.
 *
 * Ids are not a simple offset (54000007 is Arena 10, not Arena 7), so the
 * in-use ladder and clan-war arenas need an explicit table sourced from
 * RoyaleAPI/cr-api-data. Other event and PvE arenas fall through to the
 * name/trophy heuristics below.
 */
const ARENA_ID_TO_KEY: Record<number, string> = {
  54000000: "arena0",
  54000001: "arena1",
  54000002: "arena2",
  54000003: "arena3",
  54000004: "arena4",
  54000005: "arena5",
  54000006: "arena6",
  54000007: "arena10",
  54000008: "arena7",
  54000009: "arena8",
  54000010: "arena9",
  54000011: "arena12",
  54000012: "arena15",
  54000013: "arena16",
  54000014: "arena17",
  54000015: "arena18",
  54000016: "arena19",
  54000017: "arena20",
  54000018: "arena21",
  54000019: "arena22",
  54000020: "arena23",
  54000024: "arena11",
  54000027: "arena10",
  54000028: "arena10",
  54000029: "arena10",
  54000030: "arena10",
  54000031: "arena24",
  54000055: "arena13",
  54000056: "arena14",
  54000117: "arena24",
  54000130: "arena24",
  54000131: "arena24",
  54000132: "arena24",
  54000141: "arena24",
  54000142: "arena24",
  54000143: "arena31",
  54000144: "arena24"
};

/** Highest arena/league image vendored under public/images/arenas. */
const MAX_ARENA_INDEX = 24;
const MAX_LEAGUE_INDEX = 10;
const EXTRA_VENDORED_ARENA_INDICES = new Set([31]);

/** Ranked league badge, with Ultimate Champion as the legacy-result fallback. */
export function leagueImage(leagueNumber?: number): string {
  const index = leagueNumber === undefined || !Number.isFinite(leagueNumber)
    ? MAX_LEAGUE_INDEX
    : Math.min(Math.max(Math.trunc(leagueNumber), 0), MAX_LEAGUE_INDEX);
  return `/images/arenas/league${index}.png`;
}

/** API display names are subtitles rather than predictable `Arena N` labels. */
const ARENA_NAME_TO_INDEX: Record<string, number> = {
  "training camp": 0,
  "goblin stadium": 1,
  "bone pit": 2,
  "barbarian bowl": 3,
  "spell valley": 4,
  "builder's workshop": 5,
  "p.e.k.k.a's playhouse": 6,
  "royal arena": 7,
  "frozen peak": 8,
  "jungle arena": 9,
  "hog mountain": 10,
  "electro valley": 11,
  "spooky town": 12,
  "rascal's hideout": 13,
  "serenity peak": 14,
  "miner's mine": 15,
  "executioner's kitchen": 16,
  "royal crypt": 17,
  "silent sanctuary": 18,
  "dragon spa": 19,
  "boot camp": 20,
  "clash fest": 21,
  "pancakes!": 22,
  valkalla: 23,
  "legendary arena": 24,
  "lumberlove cabin": 25,
  "royal road": 26,
  "musketeer street": 27,
  "summit of heroes": 28,
  "magic academy": 29,
  "ultimate clash pit": 30,
  "little prince's tavern": 31,
  "spirit square": 32
};

function arenaKey(index: number): string {
  const normalized = Math.max(Math.trunc(index), 0);
  return `arena${normalized <= MAX_ARENA_INDEX || EXTRA_VENDORED_ARENA_INDICES.has(normalized) ? normalized : MAX_ARENA_INDEX}`;
}

/**
 * Arena art. The id table covers the authoritative ladder and clan-war keys;
 * arenas released after the data snapshot are recovered by parsing the display
 * name ("Arena 17", "League 10", "Legendary Arena").
 */
export function arenaImage(arena?: ApiArena): string {
  const byId = typeof arena?.id === "number" ? ARENA_ID_TO_KEY[arena.id] : undefined;
  if (byId) return `/images/arenas/${byId}.png`;

  const rawName = arena?.rawName?.trim() ?? "";
  const rawLeague = rawName.match(/^Arena_L(\d+)$/i);
  if (rawLeague) return `/images/arenas/${arenaKey(14 + Number(rawLeague[1]))}.png`;

  const rawArena = rawName.match(/^Arena(\d+)$/i);
  if (rawArena) return `/images/arenas/${arenaKey(Number(rawArena[1]))}.png`;
  if (/^TrainingCamp$/i.test(rawName)) return "/images/arenas/arena0.png";

  const name = arena?.name?.trim().toLowerCase() ?? "";
  const namedIndex = ARENA_NAME_TO_INDEX[name];
  if (namedIndex !== undefined) return `/images/arenas/${arenaKey(namedIndex)}.png`;

  const league = name.match(/league\s*(\d+)/);
  if (league) {
    const index = Math.min(Number(league[1]), MAX_LEAGUE_INDEX);
    return `/images/arenas/league${index}.png`;
  }

  const numbered = name.match(/arena\s*(\d+)/);
  if (numbered) {
    return `/images/arenas/${arenaKey(Number(numbered[1]))}.png`;
  }

  // A named but newly released arena should never masquerade as Training Camp.
  return name ? "/images/arenas/arena24.png" : "/images/arenas/arena0.png";
}

/**
 * Chest art, keyed off the display name returned by /upcomingchests. Filenames
 * follow the upstream cr-api-assets convention.
 */
const CHEST_FILES: Record<string, string> = {
  "wooden chest": "chest-wooden",
  "silver chest": "chest-silver",
  "golden chest": "chest-gold",
  "gold chest": "chest-gold",
  "magical chest": "chest-magical",
  "giant chest": "chest-giant",
  "epic chest": "chest-epic",
  "legendary chest": "chest-legendary",
  "super magical chest": "chest-supermagical",
  "lightning chest": "chest-lightning",
  "mega lightning chest": "chest-megalightning",
  "fortune chest": "chest-fortune",
  "gold fortune chest": "chest-gold-fortune",
  "royal wild chest": "chest-royalwild",
  "draft chest": "chest-draft",
  "king's chest": "chest-king",
  "kings chest": "chest-king",
  "legendary king's chest": "chest-kinglegendary",
  "legendary kings chest": "chest-kinglegendary",
  "gold crate": "chest-goldcrate",
  "plentiful gold crate": "chest-plentifulgoldcrate",
  "overflowing gold crate": "chest-overflowgoldcrate"
};

export function chestImage(name?: string): string {
  const file = CHEST_FILES[(name ?? "").trim().toLowerCase()] ?? "chest-wooden";
  return `/images/chests/${file}.png`;
}

/** Clan war league badge, derived from clan war trophies. */
const WAR_LEAGUE_TIERS: Array<{ min: number; file: string; label: string }> = [
  { min: 5000, file: "legendary", label: "Legendary League" },
  { min: 3000, file: "gold-1", label: "Gold League" },
  { min: 2500, file: "silver-1", label: "Silver League I" },
  { min: 2000, file: "silver-2", label: "Silver League II" },
  { min: 1500, file: "silver-3", label: "Silver League III" },
  { min: 1000, file: "bronze-1", label: "Bronze League I" },
  { min: 500, file: "bronze-2", label: "Bronze League II" },
  { min: 0, file: "bronze-3", label: "Bronze League III" }
];

export function warLeague(warTrophies: number): { image: string; label: string } {
  const tier = WAR_LEAGUE_TIERS.find((item) => warTrophies >= item.min) ?? WAR_LEAGUE_TIERS[WAR_LEAGUE_TIERS.length - 1];
  return { image: `/images/war/${tier.file}.png`, label: tier.label };
}

/** King tower level icon; only levels 1-13 are vendored. */
export function levelImage(level?: number): string {
  const clamped = Math.min(Math.max(level ?? 1, 1), 13);
  return `/images/levels/${clamped}.png`;
}

const RARITY_FILES = new Set(["Common", "Rare", "Epic", "Legendary", "Champion"]);

export function rarityImage(rarity?: string): string | undefined {
  if (!rarity) return undefined;
  const titled = rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase();
  return RARITY_FILES.has(titled) ? `/images/rarities/${titled}.png` : undefined;
}

/** Deck helpers shared by the builder, deck pages and battle rows. */
export function averageElixir(cards: Array<Pick<ApiCard, "elixirCost">>): number {
  const costed = cards.filter((card) => typeof card.elixirCost === "number" && card.elixirCost > 0);
  if (!costed.length) return 0;
  return costed.reduce((total, card) => total + (card.elixirCost ?? 0), 0) / costed.length;
}

/** Elixir needed to cycle back to your cheapest card: the four cheapest costs. */
export function fourCardCycle(cards: Array<Pick<ApiCard, "elixirCost">>): number {
  const costs = cards
    .map((card) => card.elixirCost ?? 0)
    .filter((cost) => cost > 0)
    .sort((a, b) => a - b)
    .slice(0, 4);
  return costs.reduce((total, cost) => total + cost, 0);
}

/** Official deep link that opens the deck in-game. */
export function copyDeckLink(cardIds: number[]): string | undefined {
  if (cardIds.length !== 8) return undefined;
  return `https://link.clashroyale.com/en/?clashroyale://copyDeck?deck=${cardIds.join(";")}`;
}
