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

function DeckResult({ deck, byId }: { deck: DeckSummary; byId: Map<number, Card> }) {
  const cards = deck.cardIds.map((id) => byId.get(id) ?? unknownCard(id));
  return (
    <article className="card-report-deck">
      <DeckCardGrid cards={cards} evolutionIds={deck.evolutionIds} label="Top deck containing this card" size="compact" />
      <dl className="card-report-deck-metrics">
        <div><dt>Win rate</dt><dd>{pct(deck.winRate)}</dd></div>
        <div><dt>Games</dt><dd>{deck.uses.toLocaleString()}</dd></div>
        <div><dt>Usage</dt><dd>{pct(deck.usageRate)}</dd></div>
      </dl>
    </article>
  );
}

function RelatedStats({
  title,
  note,
  metricLabel,
  rows,
  byId,
  empty
}: {
  title: string;
  note: string;
  metricLabel: string;
  rows: RelatedCardStat[];
  byId: Map<number, Card>;
  empty: string;
}) {
  return (
    <section className="card-report-related-group">
      <header>
        <h3>{title}</h3>
        <p>{note}</p>
      </header>
      {rows.length ? (
        <div className="card-report-related-list">
          {rows.map((row) => {
            const relatedCard = byId.get(row.cardId);
            return (
              <Link
                key={row.cardId}
                href={relatedCard ? `/cards/${cardSlug(relatedCard.name)}` : "/cards"}
                className="card-report-related-row"
              >
                <GameCardArt card={relatedCard ?? unknownCard(row.cardId)} size="mini" />
                <span>
                  <strong>{relatedCard?.name ?? `Card ${row.cardId}`}</strong>
                  <small>{row.uses.toLocaleString()} shared games</small>
                </span>
                <span className="card-report-related-metric">
                  <strong>{pct(row.winRate)}</strong>
                  <small>{metricLabel}</small>
                </span>
              </Link>
            );
          })}
        </div>
      ) : <p className="analytics-empty">{empty}</p>}
    </section>
  );
}

export function CardDeepAnalytics({ card, mode, byId }: { card: Card; mode: MetaMode; byId: Map<number, Card> }) {
  const report = useQuery(cardDetailQuery, typeof card.id === "number" ? { cardId: card.id, mode, windowDays: 7 } : "skip");

  if (typeof card.id !== "number") return null;
  if (report === undefined) {
    return (
      <section className="profile-section card-report-section" aria-labelledby="card-analytics-loading-heading">
        <header className="card-report-heading">
          <p className="card-report-eyebrow">Detailed report</p>
          <h2 id="card-analytics-loading-heading">Deeper analytics</h2>
        </header>
        <p className="empty-results">Loading daily trends, decks, pairings, and counters…</p>
      </section>
    );
  }

  return (
    <>
      <section className="profile-section card-report-section" aria-labelledby="card-trend-heading">
        <header className="card-report-heading card-report-heading-with-context">
          <div>
            <p className="card-report-eyebrow">Movement</p>
            <h2 id="card-trend-heading">Seven-day trend</h2>
            <p>Daily usage and results across the latest battle sample.</p>
          </div>
          <p className="card-report-context">Mode <strong>{modeLabel(mode)}</strong></p>
        </header>
        {report.trend.some((point) => point.uses > 0) ? (
          <div className="card-report-trends">
            <div className="card-report-trend"><h3>Daily usage</h3><TrendChart points={report.trend} metric="usageRate" label={card.name} /></div>
            <div className="card-report-trend"><h3>Daily win rate</h3><TrendChart points={report.trend} metric="winRate" label={card.name} /></div>
          </div>
        ) : <p className="empty-results">{card.name} was not observed in this mode during the last seven daily aggregates.</p>}
        <p className="card-report-note">A missing day means no observation, not a 0% win rate. Usage is the share of observed decks containing this card.</p>
      </section>

      <section className="profile-section card-report-section" aria-labelledby="card-decks-heading">
        <header className="card-report-heading">
          <p className="card-report-eyebrow">Deck results</p>
          <h2 id="card-decks-heading">Top decks containing {card.name}</h2>
          <p>Ranked decks with the most observed play in {modeLabel(mode)}.</p>
        </header>
        {report.topDecks.length ? (
          <div className="card-report-deck-list">
            {report.topDecks.map((deck) => <DeckResult key={deck.deckHash} deck={deck} byId={byId} />)}
          </div>
        ) : <p className="empty-results">No deck containing {card.name} reached the ranked-deck sample floor in {modeLabel(mode)}.</p>}
        <p className="card-report-note">Ordered by observed usage. These are battle-log results, not hand-picked recommendations.</p>
      </section>

      <section className="profile-section card-report-section" aria-labelledby="card-pairings-heading">
        <header className="card-report-heading">
          <p className="card-report-eyebrow">Relationships</p>
          <h2 id="card-pairings-heading">Pairings and counters</h2>
          <p>Cards that commonly share a deck with {card.name}, and opponents that perform well against it.</p>
        </header>
        <div className="card-report-related-grid">
          <RelatedStats
            title="Frequent partners"
            note={`Cards most often played alongside ${card.name}.`}
            metricLabel="deck win rate"
            rows={report.pairings}
            byId={byId}
            empty={`No partner clears the ${report.minPairUses}-game floor.`}
          />
          <RelatedStats
            title="Counters"
            note={`Opponent cards with the best results against decks containing ${card.name}.`}
            metricLabel="opponent win rate"
            rows={report.counters}
            byId={byId}
            empty={`No opponent card clears the ${report.minCounterUses}-matchup floor in mode-aware data yet.`}
          />
        </div>
      </section>

      {card.evolutionImage || report.evolution ? (
        <section className="profile-section card-report-section" aria-labelledby="card-evolution-heading">
          <header className="card-report-heading">
            <p className="card-report-eyebrow">Card variant</p>
            <h2 id="card-evolution-heading">Evolution performance</h2>
            <p>Battle-log results split by whether the Evolution slot was active.</p>
          </header>
          {report.evolution ? (
            <dl className="card-report-metric-grid card-report-evolution-grid">
              <div className="card-report-metric"><dt>Evolved games</dt><dd><strong>{report.evolution.uses.toLocaleString()}</strong><span>Evolution slot recorded</span></dd></div>
              <div className="card-report-metric"><dt>Evolved win rate</dt><dd><strong>{pct(report.evolution.winRate)}</strong><span>{report.evolution.wins.toLocaleString()} wins</span></dd></div>
              <div className="card-report-metric"><dt>Base win rate</dt><dd><strong>{report.evolution.baseWinRate === null ? "Not available" : pct(report.evolution.baseWinRate)}</strong><span>{report.evolution.baseUses.toLocaleString()} non-Evolution games</span></dd></div>
            </dl>
          ) : <p className="empty-results">The catalog confirms this Evolution exists, but no battle in this sample recorded {card.name} in an Evolution slot. No performance number is shown.</p>}
          <p className="card-report-note">Evolution status comes from the battle log's Evolution slot, not from artwork or an inferred deck name.</p>
        </section>
      ) : null}

      {report.truncated ? <p className="card-report-caveat">Pairing or counter analysis reached its daily read cap. Results describe the scanned sample and may not be exhaustive.</p> : null}
    </>
  );
}
