import { useQuery } from "convex/react";
import Link from "./Link";
import { DeckCardGrid } from "./portfolio/DeckCardGrid";
import { GameCardArt } from "./portfolio/GameCardArt";
import { TrendChart } from "./TrendChart";
import { cardDetailQuery, type DeckSummary, type RelatedCardStat } from "@/lib/analytics";
import { cardSlug } from "@/lib/clash/cards";
import { modeLabel, type MetaMode } from "@/lib/clash/battles";
import { UNKNOWN_CARD_IMAGE } from "@/lib/clash/assets";
import type { Card } from "@/lib/clash/domain";

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function unknownCard(id: number): Card {
  return { id, name: "Unknown Card", elixir: 0, rarity: "Common", image: UNKNOWN_CARD_IMAGE };
}

function MiniDeck({ deck, byId }: { deck: DeckSummary; byId: Map<number, Card> }) {
  const cards = deck.cardIds.map((id) => byId.get(id) ?? unknownCard(id));
  return (
    <article className="analytics-deck-card">
      <DeckCardGrid cards={cards} evolutionIds={deck.evolutionIds} label="Top deck containing this card" size="compact" />
      <p><strong>{pct(deck.winRate)}</strong> win rate <span>·</span> {deck.uses.toLocaleString()} games <span>·</span> {pct(deck.usageRate)} usage</p>
    </article>
  );
}

function RelatedStats({ title, note, rows, byId, empty }: { title: string; note: string; rows: RelatedCardStat[]; byId: Map<number, Card>; empty: string }) {
  return (
    <div className="related-stats-panel">
      <h3>{title}</h3>
      <p>{note}</p>
      {rows.length ? <div>{rows.map((row) => {
        const card = byId.get(row.cardId);
        return <Link key={row.cardId} href={card ? `/cards/${cardSlug(card.name)}` : "/cards"} className="related-stat-row">
          <GameCardArt card={card ?? unknownCard(row.cardId)} size="mini" />
          <span><strong>{card?.name ?? `Card ${row.cardId}`}</strong><small>{row.uses.toLocaleString()} shared games</small></span>
          <b>{pct(row.winRate)}</b>
        </Link>;
      })}</div> : <p className="analytics-empty">{empty}</p>}
    </div>
  );
}

export function CardDeepAnalytics({ card, mode, byId }: { card: Card; mode: MetaMode; byId: Map<number, Card> }) {
  const report = useQuery(cardDetailQuery, typeof card.id === "number" ? { cardId: card.id, mode, windowDays: 7 } : "skip");

  if (typeof card.id !== "number") return null;
  if (report === undefined) {
    return <section className="profile-section"><h2>Deeper analytics</h2><p className="empty-results">Loading daily trends, decks, pairings, and counters…</p></section>;
  }

  return (
    <>
      <section className="profile-section">
        <div className="section-heading"><h2>Seven-day trend</h2><span>{modeLabel(mode)}</span></div>
        {report.trend.some((point) => point.uses > 0) ? <div className="card-trend-grid">
          <div><h3>Daily usage</h3><TrendChart points={report.trend} metric="usageRate" label={card.name} /></div>
          <div><h3>Daily win rate</h3><TrendChart points={report.trend} metric="winRate" label={card.name} /></div>
        </div> : <p className="empty-results">{card.name} was not observed in this mode during the last seven daily aggregates.</p>}
        <p className="table-note">A missing day means no observation, not a 0% win rate. Usage is the share of observed decks containing this card.</p>
      </section>

      <section className="profile-section">
        <div className="section-heading"><h2>Top decks containing {card.name}</h2></div>
        {report.topDecks.length ? <div className="analytics-deck-list">{report.topDecks.map((deck) => <MiniDeck key={deck.deckHash} deck={deck} byId={byId} />)}</div> : <p className="empty-results">No deck containing {card.name} reached the ranked-deck sample floor in {modeLabel(mode)}.</p>}
        <p className="table-note">These are the highest-usage ranked decks, not hand-picked recommendations.</p>
      </section>

      <section className="profile-section">
        <div className="section-heading"><h2>Pairings and counters</h2></div>
        <div className="related-stats-grid">
          <RelatedStats title="Frequent partners" note={`Cards most often played alongside ${card.name}. The percentage is that shared deck's win rate.`} rows={report.pairings} byId={byId} empty={`No partner clears the ${report.minPairUses}-game floor.`} />
          <RelatedStats title="Counters" note={`Opponent cards with the best results against decks containing ${card.name}. The percentage is the opponent's win rate.`} rows={report.counters} byId={byId} empty={`No opponent card clears the ${report.minCounterUses}-matchup floor in mode-aware data yet.`} />
        </div>
      </section>

      {card.evolutionImage || report.evolution ? <section className="profile-section">
        <div className="section-heading"><h2>Evolution performance</h2></div>
        {report.evolution ? <div className="beta-grid">
          <div className="beta-tile"><span>Evolved games</span><strong>{report.evolution.uses.toLocaleString()}</strong><small>Evolution slot recorded</small></div>
          <div className="beta-tile"><span>Evolved win rate</span><strong>{pct(report.evolution.winRate)}</strong><small>{report.evolution.wins.toLocaleString()} wins</small></div>
          <div className="beta-tile"><span>Base win rate</span><strong>{report.evolution.baseWinRate === null ? "—" : pct(report.evolution.baseWinRate)}</strong><small>{report.evolution.baseUses.toLocaleString()} non-Evolution games</small></div>
        </div> : <p className="empty-results">The catalog confirms this Evolution exists, but no battle in this sample recorded {card.name} in an Evolution slot. No performance number is shown.</p>}
        <p className="table-note">Evolution status comes from the battle log's Evolution slot, not from artwork or an inferred deck name.</p>
      </section> : null}

      {report.truncated ? <p className="analytics-caveat">Pairing or counter analysis reached its bounded daily read cap. Results describe the scanned sample and are not claimed as exhaustive.</p> : null}
    </>
  );
}
