import { META_MODES, type MetaMode } from "./clash/battles.ts";

/**
 * Pure derivations behind the meta report page: URL state, the "meta pulse"
 * highlights, the generated summary prose, and the usage/win-rate quadrants.
 * Nothing here touches React or Convex so every rule is unit-tested.
 */

export type ReportLocale = "en" | "es";
export type MetaView = "overview" | "decks" | "cards" | "archetypes";
export type MetaWindow = 1 | 7;
export type DeckSort = "rating" | "popularity" | "winRate";

export const META_VIEWS: readonly MetaView[] = ["overview", "decks", "cards", "archetypes"];
export const META_WINDOWS: readonly MetaWindow[] = [1, 7];
export const DECK_SORTS: readonly DeckSort[] = ["rating", "popularity", "winRate"];
export const DEFAULT_MODE: MetaMode = "pathOfLegends";
export const DEFAULT_WINDOW: MetaWindow = 7;
export const DEFAULT_VIEW: MetaView = "overview";
export const DEFAULT_SORT: DeckSort = "rating";
/** A deck has eight slots, so more than eight required cards can never match. */
export const MAX_FILTER_CARDS = 8;
/** Exclusions take no deck slots; the cap only keeps the URL bounded. */
export const MAX_EXCLUDE_CARDS = 40;

export type MetaState = {
  mode: MetaMode;
  windowDays: MetaWindow;
  view: MetaView;
  sort: DeckSort;
  include: number[];
  exclude: number[];
  archetype?: string;
};

// --- URL state --------------------------------------------------------------

/**
 * TanStack Router JSON-parses search values, so `?window=7` arrives as the
 * number 7 and `?card=26000000` as a number too. Accept every shape.
 */
function firstValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstValue(value[0]);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value.trim() || undefined;
  return undefined;
}

function pick<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  const raw = firstValue(value);
  return allowed.find((item) => String(item) === raw) ?? fallback;
}

/** Comma-separated positive integer ids, de-duplicated, order kept, capped. */
export function parseIdList(value: unknown, limit = MAX_FILTER_CARDS): number[] {
  const raw = Array.isArray(value) ? value.map((item) => firstValue(item) ?? "").join(",") : firstValue(value);
  if (!raw) return [];
  const ids: number[] = [];
  for (const part of raw.split(",")) {
    const id = Number(part.trim());
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

export function serializeIdList(ids: readonly number[]): string | undefined {
  return ids.length ? ids.join(",") : undefined;
}

export function parseMetaQuery(query: Readonly<Record<string, unknown>>): MetaState {
  const archetype = firstValue(query.archetype);
  const explicitView = firstValue(query.view);
  // Older links are `/meta?archetype=…#archetypes` with no view, so an
  // archetype on its own still opens the archetype detail.
  const view = explicitView ? pick(explicitView, META_VIEWS, DEFAULT_VIEW) : archetype ? "archetypes" : DEFAULT_VIEW;
  const include = parseIdList(query.card);
  const exclude = parseIdList(query.exclude, MAX_EXCLUDE_CARDS).filter((id) => !include.includes(id));
  return {
    mode: pick(query.mode, META_MODES, DEFAULT_MODE),
    windowDays: pick(query.window, META_WINDOWS, DEFAULT_WINDOW),
    view,
    sort: pick(query.sort, DECK_SORTS, DEFAULT_SORT),
    include,
    exclude,
    ...(view === "archetypes" && archetype ? { archetype } : {})
  };
}

/** Defaults are omitted so the canonical page stays a bare `/meta`. */
export function serializeMetaQuery(state: MetaState): Record<string, string | undefined> {
  return {
    view: state.view === DEFAULT_VIEW ? undefined : state.view,
    mode: state.mode === DEFAULT_MODE ? undefined : state.mode,
    window: state.windowDays === DEFAULT_WINDOW ? undefined : String(state.windowDays),
    sort: state.sort === DEFAULT_SORT ? undefined : state.sort,
    card: serializeIdList(state.include),
    exclude: serializeIdList(state.exclude),
    archetype: state.view === "archetypes" ? state.archetype : undefined
  };
}

/**
 * Applies a patch with the cross-field rules: archetype ids are only valid for
 * the mode/window that produced them, and one card cannot be both required and
 * excluded.
 */
export function nextMetaState(current: MetaState, patch: Partial<MetaState>): MetaState {
  const next = { ...current, ...patch };
  if ((patch.mode && patch.mode !== current.mode) || (patch.windowDays && patch.windowDays !== current.windowDays)) {
    if (!("archetype" in patch)) next.archetype = undefined;
  }
  if (next.view !== "archetypes") next.archetype = undefined;
  next.include = next.include.slice(0, MAX_FILTER_CARDS);
  next.exclude = next.exclude.filter((id) => !next.include.includes(id)).slice(0, MAX_EXCLUDE_CARDS);
  return next;
}

/** Toggling a card into one list always removes it from the other. */
export function toggleCardFilter(state: Pick<MetaState, "include" | "exclude">, cardId: number, list: "include" | "exclude") {
  const target = state[list];
  const other = list === "include" ? state.exclude : state.include;
  const nextTarget = target.includes(cardId)
    ? target.filter((id) => id !== cardId)
    : [...target, cardId].slice(0, list === "include" ? MAX_FILTER_CARDS : MAX_EXCLUDE_CARDS);
  const nextOther = other.filter((id) => id !== cardId);
  return list === "include"
    ? { include: nextTarget, exclude: nextOther }
    : { include: nextOther, exclude: nextTarget };
}

/** The deck builder on /decks reads `deck` (eight comma ids) when `tool=builder`. */
export function deckBuilderHref(cardIds: readonly number[]): string {
  const params = new URLSearchParams({ tool: "builder" });
  if (cardIds.length) params.set("deck", cardIds.join(","));
  return `/decks?${params.toString().replaceAll("%2C", ",")}`;
}

// --- Meta pulse ----------------------------------------------------------------

export type PulseDeck = { deckHash: string; uses: number; winRate: number; usageRate: number; rating: number };
export type PulseTier = { cardId: number; tier: "S" | "A" | "B" | "C"; uses: number; winRate: number; score: number };
export type PulseMover = { cardId: number; usageDelta: number; winRateDelta: number };
export type PulseArchetype = { id: string; uses: number; usageRate: number; usageDelta: number; winRate: number };

export type MetaPulse<D extends PulseDeck, T extends PulseTier, M extends PulseMover, A extends PulseArchetype> = {
  mostPlayed: D | null;
  bestRated: D | null;
  strongestCard: T | null;
  risingCard: M | null;
  hottestArchetype: A | null;
  leadArchetype: A | null;
};

function best<T>(rows: readonly T[], better: (left: T, right: T) => boolean): T | null {
  let winner: T | null = null;
  for (const row of rows) if (winner === null || better(row, winner)) winner = row;
  return winner;
}

/**
 * - most played: highest observed games (rating breaks ties)
 * - best rated: highest Wilson-based rating (games break ties)
 * - strongest card: first S-tier row (tiers arrive sorted by Wilson score), else the top scorer
 * - rising card: largest positive usage delta among risers
 * - hottest archetype: largest positive usage delta; lead archetype: largest share
 */
export function selectMetaPulse<D extends PulseDeck, T extends PulseTier, M extends PulseMover, A extends PulseArchetype>(input: {
  decks: readonly D[];
  tiers: readonly T[];
  risers: readonly M[];
  archetypes: readonly A[];
}): MetaPulse<D, T, M, A> {
  const sTier = input.tiers.filter((row) => row.tier === "S");
  return {
    mostPlayed: best(input.decks, (left, right) => left.uses > right.uses || (left.uses === right.uses && left.rating > right.rating)),
    bestRated: best(input.decks, (left, right) => left.rating > right.rating || (left.rating === right.rating && left.uses > right.uses)),
    strongestCard: best(sTier.length ? sTier : input.tiers, (left, right) => left.score > right.score || (left.score === right.score && left.uses > right.uses)),
    risingCard: best(input.risers.filter((row) => row.usageDelta > 0), (left, right) => left.usageDelta > right.usageDelta),
    hottestArchetype: best(input.archetypes.filter((row) => row.usageDelta > 0), (left, right) => left.usageDelta > right.usageDelta),
    leadArchetype: best(input.archetypes, (left, right) => left.uses > right.uses)
  };
}

/** Most-used cards first, for the quick filter chips. */
export function topUsedCardIds(rows: ReadonlyArray<{ cardId: number; uses: number }>, limit = 12): number[] {
  return [...rows].sort((left, right) => right.uses - left.uses || left.cardId - right.cardId).slice(0, limit).map((row) => row.cardId);
}

// --- Number formatting ---------------------------------------------------------

export function formatPercent(value: number, locale: ReportLocale, digits = 1): string {
  return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** A rate difference in percentage points, always signed: "+2.1". */
export function formatPoints(delta: number, locale: ReportLocale): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(delta * 100);
}

export function formatCount(value: number, locale: ReportLocale): string {
  return new Intl.NumberFormat(locale).format(Math.round(value));
}

/**
 * Win-rate bar centred on 50%: returns which side it grows and how far, with
 * ±`span` (default 10 points) filling one half of the track.
 */
export function centredBarExtent(winRate: number, span = 0.1): { direction: "up" | "down" | "even"; extent: number } {
  const delta = winRate - 0.5;
  if (Math.abs(delta) < 0.0005) return { direction: "even", extent: 0 };
  return { direction: delta > 0 ? "up" : "down", extent: Math.min(1, Math.abs(delta) / span) };
}

/** Largest whole unit for "updated 3 hours ago". */
export function relativeAge(then: number, now: number): { value: number; unit: "minute" | "hour" | "day" } {
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 60) return { value: -minutes, unit: "minute" };
  const hours = Math.round(minutes / 60);
  if (hours < 48) return { value: -hours, unit: "hour" };
  return { value: -Math.round(hours / 24), unit: "day" };
}

// --- Meta map quadrants ----------------------------------------------------------

export type Quadrant = "staple" | "gem" | "overplayed" | "struggling";
export const QUADRANTS: readonly Quadrant[] = ["staple", "gem", "overplayed", "struggling"];

/**
 * Usage is split at the median of the plotted cards (so the split adapts to
 * each mode), win rate at an even 50%:
 * - staple: popular and winning
 * - gem: below-median usage, winning
 * - overplayed: popular, losing
 * - struggling: rare and losing
 */
export function classifyQuadrant(point: { usageRate: number; winRate: number }, usageThreshold: number): Quadrant {
  const popular = point.usageRate >= usageThreshold;
  const winning = point.winRate >= 0.5;
  if (popular) return winning ? "staple" : "overplayed";
  return winning ? "gem" : "struggling";
}

export function medianOf(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildMetaMap<T extends { usageRate: number; winRate: number; uses: number }>(rows: readonly T[]) {
  const usageThreshold = medianOf(rows.map((row) => row.usageRate));
  const points = rows.map((row) => ({ ...row, quadrant: classifyQuadrant(row, usageThreshold) }));
  const groups = Object.fromEntries(
    QUADRANTS.map((quadrant) => [
      quadrant,
      points.filter((point) => point.quadrant === quadrant).sort((left, right) => right.uses - left.uses)
    ])
  ) as Record<Quadrant, Array<T & { quadrant: Quadrant }>>;
  const winRates = rows.map((row) => row.winRate);
  const low = Math.min(0.5, ...winRates);
  const high = Math.max(0.5, ...winRates);
  const pad = Math.max(0.01, (high - low) * 0.08);
  return {
    usageThreshold,
    points,
    groups,
    winDomain: [Math.max(0, Math.floor((low - pad) * 100) / 100), Math.min(1, Math.ceil((high + pad) * 100) / 100)] as [number, number],
    usageMax: Math.max(0.01, ...rows.map((row) => row.usageRate)) * 1.08
  };
}

// --- Summary prose ---------------------------------------------------------------

export type SummaryInput = {
  modeName: string;
  windowDays: MetaWindow;
  decksObserved: number;
  leadArchetype?: { name: string; usageRate: number; winRate: number } | null;
  mostPlayed?: { deckHash: string; usageRate: number; winRate: number; uses: number } | null;
  bestRated?: { deckHash: string; winRate: number; uses: number } | null;
  strongestCard?: { name: string; winRate: number; uses: number } | null;
  riser?: { name: string; usageDelta: number } | null;
  decliner?: { name: string; usageDelta: number } | null;
  hottestArchetype?: { name: string; usageDelta: number } | null;
};

const PHRASES = {
  en: {
    window: (days: MetaWindow) => (days === 1 ? "the last 24 hours" : "the last 7 days"),
    previous: (days: MetaWindow) => (days === 1 ? "the previous day" : "the previous week")
  },
  es: {
    window: (days: MetaWindow) => (days === 1 ? "las últimas 24 horas" : "los últimos 7 días"),
    previous: (days: MetaWindow) => (days === 1 ? "el día anterior" : "la semana anterior")
  }
} as const;

/**
 * Two to four plain sentences that read the numbers back: what dominates, what
 * wins, which card is strongest, and what is moving. Every clause is skipped
 * when its input is missing, so thin samples produce shorter, honest prose.
 */
export function buildMetaSummary(input: SummaryInput, locale: ReportLocale): string[] {
  const pct = (value: number) => formatPercent(value, locale);
  const pts = (value: number) => formatPoints(Math.abs(value), locale).replace(/^[+-]/, "");
  const count = (value: number) => formatCount(value, locale);
  const phrase = PHRASES[locale];
  const sentences: string[] = [];
  const scope = locale === "es"
    ? `En ${count(input.decksObserved)} mazos observados en ${input.modeName} durante ${phrase.window(input.windowDays)}`
    : `Across ${count(input.decksObserved)} decks observed in ${input.modeName} over ${phrase.window(input.windowDays)}`;

  if (input.leadArchetype) {
    const lead = input.leadArchetype;
    sentences.push(locale === "es"
      ? `${scope}, ${lead.name} es el arquetipo más jugado: aparece en el ${pct(lead.usageRate)} de las partidas y gana el ${pct(lead.winRate)}.`
      : `${scope}, ${lead.name} is the most-played archetype: it shows up in ${pct(lead.usageRate)} of games and wins ${pct(lead.winRate)} of them.`);
  } else if (input.mostPlayed) {
    sentences.push(locale === "es"
      ? `${scope}, la lista más jugada aparece en el ${pct(input.mostPlayed.usageRate)} de las partidas y gana el ${pct(input.mostPlayed.winRate)}.`
      : `${scope}, the most-played list shows up in ${pct(input.mostPlayed.usageRate)} of games and wins ${pct(input.mostPlayed.winRate)} of them.`);
  } else {
    sentences.push(locale === "es"
      ? `${scope}, todavía no hay suficientes partidas para clasificar mazos.`
      : `${scope}, there are not yet enough games to rank decks.`);
    return sentences;
  }

  if (input.bestRated) {
    const deck = input.bestRated;
    const same = input.mostPlayed?.deckHash === deck.deckHash;
    sentences.push(same
      ? locale === "es"
        ? `La lista más jugada también es el mazo mejor valorado, con un ${pct(deck.winRate)} de victorias en ${count(deck.uses)} partidas.`
        : `The most-played list is also the best-rated deck, winning ${pct(deck.winRate)} across ${count(deck.uses)} games.`
      : locale === "es"
        ? `El mazo mejor valorado, que pondera el porcentaje de victorias con el tamaño de la muestra, gana el ${pct(deck.winRate)} en ${count(deck.uses)} partidas.`
        : `The best-rated deck, which weighs win rate against sample size, wins ${pct(deck.winRate)} across ${count(deck.uses)} games.`);
  }

  if (input.strongestCard) {
    const card = input.strongestCard;
    sentences.push(locale === "es"
      ? `${card.name} encabeza la lista de niveles de cartas con un ${pct(card.winRate)} de victorias en ${count(card.uses)} partidas.`
      : `${card.name} tops the card tier list with a ${pct(card.winRate)} win rate over ${count(card.uses)} games.`);
  }

  const previous = phrase.previous(input.windowDays);
  if (input.riser && input.decliner) {
    sentences.push(locale === "es"
      ? `${input.riser.name} es la carta que más sube, ${pts(input.riser.usageDelta)} puntos de uso frente a ${previous}, mientras que ${input.decliner.name} cae ${pts(input.decliner.usageDelta)} puntos.`
      : `${input.riser.name} is the biggest climber, up ${pts(input.riser.usageDelta)} usage points on ${previous}, while ${input.decliner.name} fell ${pts(input.decliner.usageDelta)} points.`);
  } else if (input.riser) {
    sentences.push(locale === "es"
      ? `${input.riser.name} es la carta que más sube, ${pts(input.riser.usageDelta)} puntos de uso frente a ${previous}.`
      : `${input.riser.name} is the biggest climber, up ${pts(input.riser.usageDelta)} usage points on ${previous}.`);
  } else if (input.hottestArchetype) {
    sentences.push(locale === "es"
      ? `${input.hottestArchetype.name} es el arquetipo que más crece, ${pts(input.hottestArchetype.usageDelta)} puntos de uso frente a ${previous}.`
      : `${input.hottestArchetype.name} is the fastest-growing archetype, up ${pts(input.hottestArchetype.usageDelta)} usage points on ${previous}.`);
  }

  return sentences.slice(0, 4);
}
