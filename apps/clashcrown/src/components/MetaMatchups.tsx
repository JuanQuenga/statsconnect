import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { DeckCardGrid } from "@/components/portfolio/DeckCardGrid";
import { UNKNOWN_CARD_IMAGE } from "@/lib/clash/assets";
import type { Card } from "@/lib/clash/domain";
import { clashBackend } from "@/lib/platformBackend";

const deckMatchupsQuery = clashBackend.meta.deckMatchups;
type DeckMatchupsPayload = FunctionReturnType<typeof deckMatchupsQuery>;
type Matchup = DeckMatchupsPayload["best"][number];

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function rateColor(value: number) {
  return value >= 0.5 ? "#7ae0ff" : "#ff9bba";
}

function unknownCard(id: number): Card {
  return { id, name: "Unknown Card", elixir: 0, rarity: "Common", image: UNKNOWN_CARD_IMAGE };
}

function MatchupDeck({ matchup, byId }: { matchup: Matchup; byId: Map<number, Card> }) {
  const evolutionIds = matchup.oppDeckHash
    .split("-")
    .filter((token) => token.endsWith("e"))
    .map((token) => Number(token.slice(0, -1)))
    .filter((id) => Number.isInteger(id));
  const cards = matchup.cardIds.map((id) => byId.get(id) ?? unknownCard(id));

  return (
    <div style={{ display: "grid", gap: 8, minWidth: 196 }}>
      <DeckCardGrid cards={cards} evolutionIds={evolutionIds} label="Opponent deck" size="compact" />
      <span style={{ color: rateColor(matchup.winRate), font: "12px var(--font-ui)" }}>
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
