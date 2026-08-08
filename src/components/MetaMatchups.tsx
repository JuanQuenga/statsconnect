import { makeFunctionReference } from "convex/server";
import { useQuery } from "convex/react";
import { CardArt } from "@/components/portfolio/CardArt";
import { UNKNOWN_CARD_IMAGE, variantArt } from "@/lib/clash/assets";
import type { Card } from "@/lib/mock-data";

type Matchup = {
  oppDeckHash: string;
  cardIds: number[];
  uses: number;
  wins: number;
  winRate: number;
};

type DeckMatchupsPayload = {
  windowDays: number;
  minUses: number;
  best: Matchup[];
  worst: Matchup[];
};

const deckMatchupsQuery = makeFunctionReference<"query", { deckHash: string }, DeckMatchupsPayload>(
  "meta:deckMatchups"
);

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function rateColor(value: number) {
  return value >= 0.5 ? "#7ae0ff" : "#ff9bba";
}

function MatchupCard({ id, card, evolved }: { id: number; card?: Card; evolved: boolean }) {
  const variant = evolved ? variantArt(card) : undefined;
  const name = card?.name ?? `Card ${id}`;
  const label = variant ? `${name} (${variant.label})` : name;
  const marked = evolved && !variant;

  return (
    <span className={marked ? "beta-thumb beta-thumb-evo" : "beta-thumb"} title={label}>
      {marked ? <i className="evo-dot" aria-hidden="true" /> : null}
      <CardArt src={variant?.src ?? card?.image ?? UNKNOWN_CARD_IMAGE} alt={label} width={46} height={56} />
    </span>
  );
}

function MatchupDeck({ matchup, byId }: { matchup: Matchup; byId: Map<number, Card> }) {
  const evolved = new Set(
    matchup.oppDeckHash
      .split("-")
      .filter((token) => token.endsWith("e"))
      .map((token) => Number(token.slice(0, -1)))
      .filter((id) => Number.isInteger(id))
  );

  return (
    <div style={{ display: "grid", gap: 8, minWidth: 196 }}>
      <div className="beta-deck">
        {matchup.cardIds.map((id, index) => (
          <MatchupCard key={`${id}-${index}`} id={id} card={byId.get(id)} evolved={evolved.has(id)} />
        ))}
      </div>
      <span style={{ color: rateColor(matchup.winRate), font: "12px Arial, sans-serif" }}>
        {pct(matchup.winRate)} <small style={{ color: "#8ea2c4" }}>({matchup.uses.toLocaleString()} games)</small>
      </span>
    </div>
  );
}

function MatchupGroup({
  label,
  rows,
  byId,
  minUses
}: {
  label: string;
  rows: Matchup[];
  byId: Map<number, Card>;
  minUses: number;
}) {
  return (
    <div>
      <span>{label}</span>
      <div>
        {rows.length ? (
          rows.map((matchup) => <MatchupDeck key={matchup.oppDeckHash} matchup={matchup} byId={byId} />)
        ) : (
          <p className="empty-results">No opponent deck has reached the {minUses}-game sample floor yet.</p>
        )}
      </div>
    </div>
  );
}

export function DeckMatchupPanel({ deckHash, byId }: { deckHash: string; byId: Map<number, Card> }) {
  const matchups = useQuery(deckMatchupsQuery, { deckHash });

  if (!matchups) return <p className="empty-results">Loading matchup history…</p>;

  return (
    <div>
      <p className="table-note">
        Best and worst results for this deck across all tracked modes over the last {matchups.windowDays} days. Only
        opponent decks with at least {matchups.minUses} games are shown.
      </p>
      <div className="beta-playground">
        <MatchupGroup label="Best matchups" rows={matchups.best} byId={byId} minUses={matchups.minUses} />
        <MatchupGroup label="Worst matchups" rows={matchups.worst} byId={byId} minUses={matchups.minUses} />
      </div>
    </div>
  );
}
