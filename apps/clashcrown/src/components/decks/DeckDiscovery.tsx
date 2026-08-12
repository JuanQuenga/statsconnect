import { AlertCircle, Check, Copy, Info, LoaderCircle, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { CardArt } from "@/components/portfolio/CardArt";
import { copyDeckLink, UNKNOWN_CARD_IMAGE } from "@/lib/clash/assets";
import { META_MODES, modeLabel, type MetaMode } from "@/lib/clash/battles";
import { mapPlayerBundle } from "@/lib/clash/mappers";
import { normalizeTag } from "@/lib/clash/tag";
import {
  deckCost,
  discoverDecksQuery,
  findReplacements,
  personalizeDecks,
  selectWarDecks,
  type DiscoveryDeck,
  type DiscoverySort,
  type PersonalizedDeck
} from "@/lib/deckDiscovery";
import { errorMessage, playerBundleAction } from "@/lib/convex";
import type { Card, Player } from "@/lib/mock-data";

type DiscoveryView = "discover" | "war";

type DeckDiscoveryProps = {
  cards: Card[];
  view: DiscoveryView;
  catalogMessage?: string;
  onUseDeck: (cards: Card[], deckHash: string) => void;
};

type TrophyBand = "all" | "under5000" | "5000to6999" | "7000to8999" | "9000plus";

function trophyRange(band: TrophyBand) {
  if (band === "under5000") return { maxTrophies: 4999 };
  if (band === "5000to6999") return { minTrophies: 5000, maxTrophies: 6999 };
  if (band === "7000to8999") return { minTrophies: 7000, maxTrophies: 8999 };
  if (band === "9000plus") return { minTrophies: 9000 };
  return {};
}

function numeric(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function DeckDiscovery({ cards, view, catalogMessage, onUseDeck }: DeckDiscoveryProps) {
  const getPlayer = useAction(playerBundleAction);
  const [tagInput, setTagInput] = useState("");
  const [playerTag, setPlayerTag] = useState("");
  const [tagError, setTagError] = useState("");
  const [mode, setMode] = useState<MetaMode>("pathOfLegends");
  const [windowDays, setWindowDays] = useState<1 | 7>(7);
  const [sort, setSort] = useState<DiscoverySort>("rating");
  const [includeCardIds, setIncludeCardIds] = useState<number[]>([]);
  const [excludeCardIds, setExcludeCardIds] = useState<number[]>([]);
  const [minElixir, setMinElixir] = useState("0");
  const [maxElixir, setMaxElixir] = useState("9");
  const [minCycle, setMinCycle] = useState("0");
  const [maxCycle, setMaxCycle] = useState("36");
  const [minEvolutions, setMinEvolutions] = useState("0");
  const [maxEvolutions, setMaxEvolutions] = useState("8");
  const [trophyBand, setTrophyBand] = useState<TrophyBand>("all");
  const [arenaName, setArenaName] = useState("");
  const [copyNotice, setCopyNotice] = useState("");

  const catalog = useMemo(() => new Map(
    cards.filter((card): card is Card & { id: number } => typeof card.id === "number").map((card) => [card.id, card])
  ), [cards]);
  const trophy = trophyRange(trophyBand);
  const discovery = useConvexQuery(discoverDecksQuery, {
    mode,
    windowDays,
    includeCardIds,
    excludeCardIds,
    minEvolutions: numeric(minEvolutions, 0),
    maxEvolutions: numeric(maxEvolutions, 8),
    ...trophy,
    ...(arenaName.trim() ? { arenaName: arenaName.trim() } : {}),
    sort,
    limit: 100
  });
  const warDiscovery = useConvexQuery(discoverDecksQuery, {
    mode: "clanWar",
    windowDays: 7,
    sort: "rating",
    limit: 100
  });

  const playerQuery = useQuery({
    queryKey: ["deck-discovery-player", playerTag],
    queryFn: async () => mapPlayerBundle(await getPlayer({ tag: playerTag })),
    enabled: Boolean(playerTag),
    retry: false
  });
  const player = playerQuery.data;

  const costFiltered = useMemo(() => {
    const minAverage = numeric(minElixir, 0);
    const maxAverage = numeric(maxElixir, 9);
    const cycleMin = numeric(minCycle, 0);
    const cycleMax = numeric(maxCycle, 36);
    return (discovery?.decks ?? []).filter((deck) => {
      const cost = deckCost(deck.cardIds, catalog);
      if (!cost) return minAverage <= 0 && maxAverage >= 9 && cycleMin <= 0 && cycleMax >= 36;
      return cost.average >= minAverage && cost.average <= maxAverage && cost.cycle >= cycleMin && cost.cycle <= cycleMax;
    });
  }, [catalog, discovery?.decks, maxCycle, maxElixir, minCycle, minElixir]);
  const personalized = useMemo(
    () => player ? personalizeDecks(costFiltered, player) : null,
    [costFiltered, player]
  );
  const visibleDecks: Array<DiscoveryDeck | PersonalizedDeck> = personalized ?? costFiltered;
  const personalizedWar = useMemo(
    () => player && warDiscovery ? personalizeDecks(warDiscovery.decks, player) : [],
    [player, warDiscovery]
  );
  const warSet = useMemo(() => selectWarDecks(personalizedWar), [personalizedWar]);

  function connectPlayer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const normalized = normalizeTag(tagInput);
      setTagError("");
      setPlayerTag(normalized);
    } catch (error) {
      setTagError(errorMessage(error));
    }
  }

  async function copyDeck(deck: DiscoveryDeck) {
    const link = copyDeckLink(deck.cardIds);
    if (!link) {
      setCopyNotice("This observed row does not contain eight valid card ids.");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopyNotice("Official Clash Royale deck link copied.");
    } catch {
      setCopyNotice("Copying was blocked by your browser.");
    }
  }

  function loadBuilder(deck: DiscoveryDeck) {
    const resolved = deck.cardIds
      .map((cardId) => catalog.get(cardId))
      .filter((card): card is Card & { id: number } => Boolean(card));
    if (resolved.length !== 8) {
      setCopyNotice("The live card catalog has not resolved every card in this deck yet.");
      return;
    }
    onUseDeck(resolved, deck.deckHash);
  }

  return (
    <div className="deck-discovery-stack">
      <PlayerSeed
        tagInput={tagInput}
        setTagInput={setTagInput}
        onSubmit={connectPlayer}
        loading={playerQuery.isFetching}
        player={player}
        error={tagError || (playerQuery.error ? errorMessage(playerQuery.error) : "")}
        onClear={() => { setPlayerTag(""); setTagInput(""); }}
      />

      {view === "war" ? (
        <WarDiscovery
          player={player}
          loading={warDiscovery === undefined || playerQuery.isFetching}
          dataAvailable={Boolean(warDiscovery?.decks.length)}
          warSet={warSet}
          observed={personalizedWar}
          catalog={catalog}
          onCopy={copyDeck}
          onUse={loadBuilder}
        />
      ) : (
        <>
          <DiscoveryFilters
            cards={cards}
            mode={mode}
            setMode={setMode}
            windowDays={windowDays}
            setWindowDays={setWindowDays}
            sort={sort}
            setSort={setSort}
            includeCardIds={includeCardIds}
            setIncludeCardIds={setIncludeCardIds}
            excludeCardIds={excludeCardIds}
            setExcludeCardIds={setExcludeCardIds}
            minElixir={minElixir}
            setMinElixir={setMinElixir}
            maxElixir={maxElixir}
            setMaxElixir={setMaxElixir}
            minCycle={minCycle}
            setMinCycle={setMinCycle}
            maxCycle={maxCycle}
            setMaxCycle={setMaxCycle}
            minEvolutions={minEvolutions}
            setMinEvolutions={setMinEvolutions}
            maxEvolutions={maxEvolutions}
            setMaxEvolutions={setMaxEvolutions}
            trophyBand={trophyBand}
            setTrophyBand={setTrophyBand}
            arenaName={arenaName}
            setArenaName={setArenaName}
          />

          {catalogMessage ? <p className="discovery-warning"><AlertCircle size={16} />{catalogMessage} Elixir filters can only evaluate cards present in the loaded catalog.</p> : null}
          {discovery === undefined ? <DiscoveryLoading /> : (
            <section className="profile-section discovery-results" aria-live="polite">
              <div className="section-heading discovery-heading">
                <div><span className="eyebrow">Observed decks</span><h2>{player ? `Recommended for ${player.name}` : `${modeLabel(mode)} results`}</h2></div>
                <p>{visibleDecks.length} shown from {discovery.totalRanked} ranked decks · {discovery.windowDays}-day sample</p>
              </div>
              <CoverageNotes discovery={discovery} trophyBand={trophyBand} arenaName={arenaName} player={player} />
              {copyNotice ? <p className="builder-notice" role="status">{copyNotice}</p> : null}
              {visibleDecks.length ? (
                <div className="discovery-deck-list">
                  {visibleDecks.map((deck, index) => (
                    <ObservedDeckCard
                      key={deck.deckHash}
                      deck={deck}
                      displayRank={index + 1}
                      catalog={catalog}
                      player={player}
                      observed={discovery.decks}
                      onCopy={copyDeck}
                      onUse={loadBuilder}
                    />
                  ))}
                </div>
              ) : <EmptyResults hasRanked={discovery.totalRanked > 0} hasCatalog={catalog.size > 0} />}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PlayerSeed({
  tagInput,
  setTagInput,
  onSubmit,
  loading,
  player,
  error,
  onClear
}: {
  tagInput: string;
  setTagInput: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  player?: Player;
  error: string;
  onClear: () => void;
}) {
  return (
    <section className="player-seed profile-section" aria-labelledby="player-seed-heading">
      <div>
        <span className="eyebrow">Optional personalization</span>
        <h2 id="player-seed-heading">Match decks to your collection</h2>
        <p>Use a player tag to account for owned cards and their reported levels. The tag fetch is read-only.</p>
      </div>
      <form onSubmit={onSubmit} className="player-seed-form">
        <label><span className="sr-only">Player tag</span><Search size={18} /><input value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="#PLAYER TAG" autoComplete="off" /></label>
        <button type="submit" className="pink-button" disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{loading ? "Loading" : "Personalize"}</button>
        {player ? <button type="button" className="quiet-button" onClick={onClear}><X size={16} />Clear</button> : null}
      </form>
      {player ? <p className="player-connected"><Check size={16} />Using {player.name} · #{player.tag} · {player.cards.length} owned cards reported</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}

type FilterProps = {
  cards: Card[];
  mode: MetaMode;
  setMode: (value: MetaMode) => void;
  windowDays: 1 | 7;
  setWindowDays: (value: 1 | 7) => void;
  sort: DiscoverySort;
  setSort: (value: DiscoverySort) => void;
  includeCardIds: number[];
  setIncludeCardIds: (value: number[]) => void;
  excludeCardIds: number[];
  setExcludeCardIds: (value: number[]) => void;
  minElixir: string;
  setMinElixir: (value: string) => void;
  maxElixir: string;
  setMaxElixir: (value: string) => void;
  minCycle: string;
  setMinCycle: (value: string) => void;
  maxCycle: string;
  setMaxCycle: (value: string) => void;
  minEvolutions: string;
  setMinEvolutions: (value: string) => void;
  maxEvolutions: string;
  setMaxEvolutions: (value: string) => void;
  trophyBand: TrophyBand;
  setTrophyBand: (value: TrophyBand) => void;
  arenaName: string;
  setArenaName: (value: string) => void;
};

function DiscoveryFilters(props: FilterProps) {
  return (
    <section className="discovery-filter-panel" aria-labelledby="filters-heading">
      <div className="section-heading discovery-heading"><div><span className="eyebrow">Search the sample</span><h2 id="filters-heading">Deck filters</h2></div></div>
      <div className="discovery-filter-grid">
        <label><span>Mode</span><select value={props.mode} onChange={(event) => props.setMode(event.target.value as MetaMode)}>{META_MODES.map((item) => <option key={item} value={item}>{modeLabel(item)}</option>)}</select></label>
        <label><span>Time window</span><select value={props.windowDays} onChange={(event) => props.setWindowDays(Number(event.target.value) as 1 | 7)}><option value={1}>Last day</option><option value={7}>Last 7 days</option></select></label>
        <label><span>Sort by</span><select value={props.sort} onChange={(event) => props.setSort(event.target.value as DiscoverySort)}><option value="rating">Rating</option><option value="popularity">Popularity</option><option value="winRate">Win rate</option></select></label>
        <label><span>Trophy band</span><select value={props.trophyBand} onChange={(event) => props.setTrophyBand(event.target.value as TrophyBand)}><option value="all">All observed</option><option value="under5000">Under 5,000</option><option value="5000to6999">5,000–6,999</option><option value="7000to8999">7,000–8,999</option><option value="9000plus">9,000+</option></select></label>
        <label><span>Arena contains</span><input value={props.arenaName} onChange={(event) => props.setArenaName(event.target.value)} placeholder="e.g. Legendary" /></label>
        <RangeFields label="Average elixir" min={props.minElixir} max={props.maxElixir} onMin={props.setMinElixir} onMax={props.setMaxElixir} step="0.1" />
        <RangeFields label="4-card cycle" min={props.minCycle} max={props.maxCycle} onMin={props.setMinCycle} onMax={props.setMaxCycle} step="1" />
        <RangeFields label="Evolution count" min={props.minEvolutions} max={props.maxEvolutions} onMin={props.setMinEvolutions} onMax={props.setMaxEvolutions} step="1" />
      </div>
      <div className="card-rule-grid">
        <CardRule label="Must include" cards={props.cards} selected={props.includeCardIds} blocked={props.excludeCardIds} onChange={props.setIncludeCardIds} />
        <CardRule label="Must exclude" cards={props.cards} selected={props.excludeCardIds} blocked={props.includeCardIds} onChange={props.setExcludeCardIds} />
      </div>
    </section>
  );
}

function RangeFields({ label, min, max, onMin, onMax, step }: { label: string; min: string; max: string; onMin: (value: string) => void; onMax: (value: string) => void; step: string }) {
  return <fieldset className="range-fields"><legend>{label}</legend><label><span>Min</span><input type="number" inputMode="decimal" min="0" step={step} value={min} onChange={(event) => onMin(event.target.value)} /></label><label><span>Max</span><input type="number" inputMode="decimal" min="0" step={step} value={max} onChange={(event) => onMax(event.target.value)} /></label></fieldset>;
}

function CardRule({ label, cards, selected, blocked, onChange }: { label: string; cards: Card[]; selected: number[]; blocked: number[]; onChange: (value: number[]) => void }) {
  const [choice, setChoice] = useState("");
  const indexed = new Map(cards.filter((card): card is Card & { id: number } => typeof card.id === "number").map((card) => [card.id, card]));
  function add() {
    const id = Number(choice);
    if (!Number.isFinite(id) || selected.includes(id) || blocked.includes(id)) return;
    onChange([...selected, id]);
    setChoice("");
  }
  return <div className="card-rule"><label><span>{label}</span><select value={choice} onChange={(event) => setChoice(event.target.value)}><option value="">Choose a card</option>{cards.filter((card) => typeof card.id === "number" && !selected.includes(card.id) && !blocked.includes(card.id)).sort((left, right) => left.name.localeCompare(right.name)).map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></label><button type="button" onClick={add} disabled={!choice}>Add</button><div className="filter-chips">{selected.map((cardId) => <button type="button" key={cardId} onClick={() => onChange(selected.filter((id) => id !== cardId))} aria-label={`Remove ${indexed.get(cardId)?.name ?? cardId} filter`}>{indexed.get(cardId)?.name ?? `Card ${cardId}`}<X size={12} /></button>)}</div></div>;
}

function CoverageNotes({ discovery, trophyBand, arenaName, player }: { discovery: NonNullable<ReturnType<typeof useConvexQuery<typeof discoverDecksQuery>>>; trophyBand: TrophyBand; arenaName: string; player?: Player }) {
  return (
    <div className="coverage-notes">
      {player ? <p><Sparkles size={15} /><strong>Personal score:</strong> 50 points observed rating + 30 ownership + 20 level readiness. Level readiness uses each card’s reported level as a share of its max level.</p> : <p><Info size={15} /><strong>Rating:</strong> 80% conservative win-rate estimate + 20% relative popularity. Small samples are intentionally penalized.</p>}
      {trophyBand !== "all" && !discovery.trophyFilterApplied ? <p className="coverage-alert"><AlertCircle size={15} />Trophy data has not reached this ranking window yet, so the requested trophy band was not applied.</p> : null}
      {trophyBand !== "all" && discovery.trophyFilterApplied ? <p><ShieldCheck size={15} />Trophy band applied to decks with observed starting-trophy samples ({discovery.trophyCoverage.decks}/{discovery.totalRanked} ranked decks covered).</p> : null}
      {arenaName.trim() && !discovery.arenaFilterApplied ? <p className="coverage-alert"><AlertCircle size={15} />Arena data is not available in this window yet, so the arena filter was not applied.</p> : null}
    </div>
  );
}

function ObservedDeckCard({ deck, displayRank, catalog, player, observed, onCopy, onUse }: { deck: DiscoveryDeck | PersonalizedDeck; displayRank: number; catalog: Map<number, Card>; player?: Player; observed: DiscoveryDeck[]; onCopy: (deck: DiscoveryDeck) => void; onUse: (deck: DiscoveryDeck) => void }) {
  const cost = deckCost(deck.cardIds, catalog);
  const isPersonal = "personalScore" in deck;
  const replacements = isPersonal && player ? findReplacements(deck, observed, player) : [];
  return (
    <article className="observed-deck-card">
      <div className="observed-deck-rank"><span>#{displayRank}</span><strong>{isPersonal ? `${deck.personalScore.toFixed(0)}/100` : `${(deck.rating * 100).toFixed(0)}/100`}</strong><small>{isPersonal ? "personal score" : "observed rating"}</small></div>
      <DeckCards deck={deck} catalog={catalog} />
      <div className="observed-deck-metrics"><div><span>Win rate</span><strong>{(deck.winRate * 100).toFixed(1)}%</strong><small>{deck.wins}/{deck.uses} games won</small></div><div><span>Popularity</span><strong>{(deck.usageRate * 100).toFixed(2)}%</strong><small>{deck.uses.toLocaleString()} observations</small></div><div><span>Elixir / cycle</span><strong>{cost ? `${cost.average.toFixed(1)} / ${cost.cycle}` : "Unavailable"}</strong><small>{deck.evolutionIds.length} evolution{deck.evolutionIds.length === 1 ? "" : "s"}</small></div></div>
      {isPersonal ? <PersonalFit deck={deck} catalog={catalog} replacements={replacements} /> : null}
      <div className="deck-result-actions"><button type="button" onClick={() => onUse(deck)}>Use in builder</button><button type="button" className="pink-button" onClick={() => onCopy(deck)}><Copy size={15} />Copy to game</button></div>
    </article>
  );
}

function DeckCards({ deck, catalog }: { deck: DiscoveryDeck; catalog: Map<number, Card> }) {
  const evolutions = new Set(deck.evolutionIds);
  return <div className="observed-card-grid" aria-label="Deck cards">{deck.cardIds.map((cardId) => { const card = catalog.get(cardId); const evolved = evolutions.has(cardId); return <div key={cardId} title={card?.name ?? `Card ${cardId}`}><CardArt src={evolved ? card?.evolutionImage ?? card?.image ?? UNKNOWN_CARD_IMAGE : card?.image ?? UNKNOWN_CARD_IMAGE} alt={card?.name ?? `Unknown card ${cardId}`} width={68} height={84} />{evolved ? <span>EVO</span> : null}</div>; })}</div>;
}

function PersonalFit({ deck, catalog, replacements }: { deck: PersonalizedDeck; catalog: Map<number, Card>; replacements: ReturnType<typeof findReplacements> }) {
  return <details className="personal-fit"><summary>Why this score and what to swap</summary><div className="score-breakdown"><span>Observed <strong>{(deck.rating * 50).toFixed(1)}/50</strong></span><span>Owned <strong>{(deck.ownershipScore * 30).toFixed(1)}/30</strong></span><span>Level-ready <strong>{(deck.readinessScore * 20).toFixed(1)}/20</strong></span></div>{deck.missingCardIds.length === 0 && deck.underleveledCardIds.length === 0 ? <p className="fit-good"><Check size={15} />All eight cards are owned and none falls materially below this collection’s typical level ratio.</p> : replacements.map((suggestion) => { const weak = catalog.get(suggestion.cardId); return <div className="replacement-row" key={suggestion.cardId}><strong>{deck.missingCardIds.includes(suggestion.cardId) ? "Missing" : "Underleveled"}: {weak?.name ?? `Card ${suggestion.cardId}`}</strong>{suggestion.options.length ? <ul>{suggestion.options.map((option) => <li key={option.cardId}>{catalog.get(option.cardId)?.name ?? `Card ${option.cardId}`} — appears in an observed deck sharing {option.sharedCards} of the other 7 cards ({option.observedUses} games in that deck’s sample).</li>)}</ul> : <p>No owned replacement appeared in a sufficiently similar observed deck. The data does not support a reliable swap.</p>}</div>; })}</details>;
}

function WarDiscovery({ player, loading, dataAvailable, warSet, observed, catalog, onCopy, onUse }: { player?: Player; loading: boolean; dataAvailable: boolean; warSet: ReturnType<typeof selectWarDecks>; observed: PersonalizedDeck[]; catalog: Map<number, Card>; onCopy: (deck: DiscoveryDeck) => void; onUse: (deck: DiscoveryDeck) => void }) {
  return <section className="profile-section discovery-results"><div className="section-heading discovery-heading"><div><span className="eyebrow">Clan War collection</span><h2>Four-deck war set</h2></div><p>7-day Clan War observations · no card overlaps</p></div>{!player ? <div className="discovery-empty"><ShieldCheck size={34} /><h3>Connect a player tag first</h3><p>War sets must be built from cards the player actually owns, so there is no generic or pretend result.</p></div> : loading ? <DiscoveryLoading /> : !dataAvailable ? <div className="discovery-empty"><AlertCircle size={34} /><h3>No ranked Clan War decks yet</h3><p>The battle crawler has not produced enough five-game deck samples for this window. Try Discovery in another mode while the war sample grows.</p></div> : !warSet.complete ? <div className="discovery-empty"><AlertCircle size={34} /><h3>Only {warSet.decks.length} non-overlapping deck{warSet.decks.length === 1 ? "" : "s"} found</h3><p>{warSet.eligibleDecks} observed Clan War decks use only owned cards, but the current sample cannot form four disjoint eight-card decks. Showing a partial set would not be a valid war recommendation.</p></div> : <><div className="coverage-notes"><p><Info size={15} />Selected by exact search over the strongest {Math.min(warSet.eligibleDecks, 40)} fully-owned observed decks. Scores use observed results, ownership, and reported card levels.</p></div><div className="discovery-deck-list">{warSet.decks.map((deck, index) => <ObservedDeckCard key={deck.deckHash} deck={deck} displayRank={index + 1} catalog={catalog} player={player} observed={observed} onCopy={onCopy} onUse={onUse} />)}</div></>}</section>;
}

function DiscoveryLoading() {
  return <div className="data-state discovery-state"><LoaderCircle className="state-spinner" size={38} /><h2>Ranking observed decks</h2><p>Reading the bounded battle-log sample and applying your filters.</p></div>;
}

function EmptyResults({ hasRanked, hasCatalog }: { hasRanked: boolean; hasCatalog: boolean }) {
  return <div className="discovery-empty"><AlertCircle size={34} /><h3>{hasRanked ? "No decks match every filter" : "No ranked decks in this sample"}</h3><p>{!hasCatalog ? "The card catalog is unavailable, so elixir and cycle filters cannot be evaluated." : hasRanked ? "Remove one include/exclude rule or widen the elixir, cycle, evolution, trophy, or arena range." : "A deck needs at least five observations before it enters discovery. Try a 7-day window or another mode."}</p></div>;
}
