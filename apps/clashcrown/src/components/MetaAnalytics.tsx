import { useState } from "react";
import { useQuery } from "convex/react";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "./Link";
import { DeckCardGrid } from "./portfolio/DeckCardGrid";
import { GameCardArt } from "./portfolio/GameCardArt";
import { TrendChart } from "./TrendChart";
import { cardSlug } from "@/lib/clash/cards";
import { modeLabel, type MetaMode } from "@/lib/clash/battles";
import { UNKNOWN_CARD_IMAGE } from "@/lib/clash/assets";
import { cardReportQuery, deckReportQuery, towerReportQuery, type Archetype, type CardReport, type DeckReport, type EntityTrend } from "@/lib/analytics";
import { useRouter } from "@/lib/router";
import type { Card } from "@/lib/clash/domain";

function pct(value: number, signed = false) {
  const number = value * 100;
  return `${signed && number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function nameFor(id: number, byId: Map<number, Card>) {
  return byId.get(id)?.name ?? `Card ${id}`;
}

function unknownCard(id: number): Card {
  return { id, name: "Unknown Card", elixir: 0, rarity: "Common", image: UNKNOWN_CARD_IMAGE };
}

function cardsForIds(ids: readonly number[], byId: Map<number, Card>): Card[] {
  return ids.map((id) => byId.get(id) ?? unknownCard(id));
}

function CardIdentity({ id, byId }: { id: number; byId: Map<number, Card> }) {
  const card = byId.get(id);
  return (
    <Link href={card ? `/cards/${cardSlug(card.name)}` : "/cards"} className="analytics-card-id">
      <GameCardArt card={card ?? unknownCard(id)} size="mini" />
      <span><strong>{nameFor(id, byId)}</strong>{card ? <small>{card.rarity}</small> : null}</span>
    </Link>
  );
}

function TrendList({ trends, byId, kind, metric }: { trends: EntityTrend[]; byId: Map<number, Card>; kind: "card" | "tower"; metric: "usageRate" | "winRate" }) {
  if (!trends.length) return <p className="empty-results">No daily observations are available for this selection yet.</p>;
  return (
    <div className="trend-list">
      {trends.map((trend) => (
        <article key={trend.id} className="trend-row">
          <CardIdentity id={Number(trend.id)} byId={byId} />
          <TrendChart points={trend.points} metric={metric} label={nameFor(Number(trend.id), byId)} />
          <div className="trend-numbers"><strong>{pct(trend.usageRate)}</strong><span>{pct(trend.winRate)} wins</span></div>
        </article>
      ))}
      {kind === "tower" ? <p className="table-note">Tower usage uses only battles where a Tower Troop was recorded.</p> : null}
    </div>
  );
}

function DeckTrendList({ trends, byId, metric }: { trends: EntityTrend[]; byId: Map<number, Card>; metric: "usageRate" | "winRate" }) {
  if (!trends.length) return <p className="empty-results">No deck has enough daily observations to chart yet.</p>;
  return (
    <div className="trend-list">
      {trends.map((trend) => {
        const parts = trend.id.split("-");
        const ids = parts.flatMap((part) => {
          const value = Number(part.replace(/e$/, ""));
          return Number.isFinite(value) ? [value] : [];
        });
        const evolutionIds = parts.flatMap((part) => {
          if (!part.endsWith("e")) return [];
          const value = Number(part.slice(0, -1));
          return Number.isFinite(value) ? [value] : [];
        });
        return (
          <article key={trend.id} className="trend-row trend-row-deck">
            <DeckCardGrid cards={cardsForIds(ids, byId)} evolutionIds={evolutionIds} label={ids.map((id) => nameFor(id, byId)).join(", ")} size="compact" />
            <TrendChart points={trend.points} metric={metric} label="Deck" />
            <div className="trend-numbers"><strong>{pct(trend.usageRate)}</strong><span>{pct(trend.winRate)} wins</span></div>
          </article>
        );
      })}
    </div>
  );
}

function Movers({ report, byId }: { report: CardReport; byId: Map<number, Card> }) {
  const groups = [
    { title: "Rising", rows: report.risers, icon: ArrowUpRight, className: "analytics-up" },
    { title: "Declining", rows: report.decliners, icon: ArrowDownRight, className: "analytics-down" }
  ];
  return (
    <section className="profile-section">
      <div className="section-heading"><h2>Meta movers</h2></div>
      <p className="table-note">Usage change versus the preceding {report.windowDays}-day window. Every card shown had at least {report.minMoverUses.toLocaleString()} games in both windows.</p>
      <div className="mover-grid">
        {groups.map((group) => (
          <div key={group.title} className="mover-panel">
            <h3><group.icon size={18} />{group.title}</h3>
            {group.rows.length ? group.rows.map((row) => (
              <div key={row.cardId} className="mover-row">
                <CardIdentity id={row.cardId} byId={byId} />
                <span className={group.className}>{pct(row.usageDelta, true)}<small>{pct(row.winRateDelta, true)} win rate</small></span>
              </div>
            )) : <p className="analytics-empty">No card cleared the two-window sample floor.</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function TierList({ report, byId }: { report: CardReport; byId: Map<number, Card> }) {
  return (
    <section className="profile-section">
      <div className="section-heading"><h2>Card tier list</h2></div>
      <p className="table-note">{report.methodology} Current floor: {report.minTierUses.toLocaleString()} games.</p>
      {report.tiers.length ? <div className="tier-list">
        {(["S", "A", "B", "C"] as const).map((tier) => (
          <div className={`tier-row tier-${tier.toLowerCase()}`} key={tier}>
            <strong className="tier-label">{tier}</strong>
            <div>{report.tiers.filter((row) => row.tier === tier).map((row) => {
              const card = byId.get(row.cardId);
              return <Link href={card ? `/cards/${cardSlug(card.name)}` : "/cards"} key={row.cardId} title={`${nameFor(row.cardId, byId)} · ${pct(row.winRate)} win rate · ${row.uses.toLocaleString()} games`}>
                <GameCardArt card={card ?? unknownCard(row.cardId)} size="mini" />
              </Link>;
            })}</div>
          </div>
        ))}
      </div> : <p className="empty-results">No card clears the sample floor for this mode and window.</p>}
    </section>
  );
}

function ArchetypeDeck({ deck, byId }: { deck: Archetype["representativeDecks"][number]; byId: Map<number, Card> }) {
  return (
    <div className="analytics-deck-card">
      <DeckCardGrid cards={cardsForIds(deck.cardIds, byId)} evolutionIds={deck.evolutionIds} label="Representative archetype deck" size="compact" />
      <span><strong>{deck.uses.toLocaleString()}</strong> games · {pct(deck.winRate)} wins</span>
    </div>
  );
}

function Archetypes({ report, byId, selected }: { report: DeckReport; byId: Map<number, Card>; selected?: string }) {
  const active = selected ? report.archetypes.find((item) => item.id === selected) : undefined;
  if (active) {
    const title = active.coreCardIds.map((id) => nameFor(id, byId)).join(" + ");
    return (
      <section className="profile-section archetype-detail" id="archetypes">
        <Link href="/meta#archetypes" className="breadcrumb">← All archetypes</Link>
        <div className="section-heading"><h2>{title}</h2><span>{pct(active.usageDelta, true)} vs prior window</span></div>
        <p className="table-note">This data-derived family groups decks whose two most distinctive cards are {title}. It contains {active.uses.toLocaleString()} observed games across the current window.</p>
        <div className="archetype-detail-chart"><TrendChart points={active.points} metric="usageRate" label={title} /><div><strong>{pct(active.usageRate)}</strong><span>usage</span><strong>{pct(active.winRate)}</strong><span>win rate</span></div></div>
        <h3>Most-played decks in this family</h3>
        <div className="analytics-deck-list">{active.representativeDecks.map((deck) => <ArchetypeDeck key={deck.deckHash} deck={deck} byId={byId} />)}</div>
      </section>
    );
  }
  return (
    <section className="profile-section" id="archetypes">
      <div className="section-heading"><h2>Data-derived archetypes</h2></div>
      <p className="table-note">{report.methodology} Families need at least {report.minArchetypeUses.toLocaleString()} games.</p>
      {report.archetypes.length ? <div className="archetype-grid">{report.archetypes.map((item) => {
        const title = item.coreCardIds.map((id) => nameFor(id, byId)).join(" + ");
        return <Link href={`/meta?archetype=${item.id}#archetypes`} key={item.id} className="archetype-card">
          <div className="archetype-core">{item.coreCardIds.map((id) => <GameCardArt key={id} card={byId.get(id) ?? unknownCard(id)} size="mini" />)}</div>
          <h3>{title}</h3>
          <TrendChart points={item.points} metric="usageRate" label={title} />
          <p><strong>{pct(item.usageRate)}</strong> usage <span>·</span> <strong>{pct(item.winRate)}</strong> wins</p>
          <small className={item.usageDelta >= 0 ? "analytics-up" : "analytics-down"}>{pct(item.usageDelta, true)} vs prior window</small>
          <span className="archetype-open">View family <ChevronRight size={15} /></span>
        </Link>;
      })}</div> : <p className="empty-results">No deterministic family clears the sample floor yet.</p>}
    </section>
  );
}

export function MetaAnalytics({ mode, windowDays, byId }: { mode: MetaMode; windowDays: number; byId: Map<number, Card> }) {
  const [trendKind, setTrendKind] = useState<"card" | "tower" | "deck">("card");
  const [trendMetric, setTrendMetric] = useState<"usageRate" | "winRate">("usageRate");
  const router = useRouter();
  const selectedArchetype = typeof router.query.archetype === "string" ? router.query.archetype : undefined;
  const cards = useQuery(cardReportQuery, { mode, windowDays });
  const towers = useQuery(towerReportQuery, { mode, windowDays });
  const decks = useQuery(deckReportQuery, { mode, windowDays });
  const truncated = cards?.truncated || towers?.truncated || decks?.truncated;

  return (
    <>
      <section className="profile-section">
        <div className="section-heading"><h2>Daily usage trends</h2><span>{modeLabel(mode)} · {windowDays === 1 ? "24 hours" : `${windowDays} days`}</span></div>
        <div className="analytics-trend-controls">
          <div className="beta-tabs" role="group" aria-label="Trend type">
            {(["card", "tower", "deck"] as const).map((kind) => <button key={kind} type="button" className={trendKind === kind ? "beta-tab beta-tab-on" : "beta-tab"} onClick={() => setTrendKind(kind)}>{kind === "tower" ? "Tower Troops" : `${kind}s`}</button>)}
          </div>
          <div className="beta-tabs" role="group" aria-label="Trend metric">
            <button type="button" className={trendMetric === "usageRate" ? "beta-tab beta-tab-on" : "beta-tab"} onClick={() => setTrendMetric("usageRate")}>Usage</button>
            <button type="button" className={trendMetric === "winRate" ? "beta-tab beta-tab-on" : "beta-tab"} onClick={() => setTrendMetric("winRate")}>Win rate</button>
          </div>
        </div>
        {trendKind === "card" ? cards ? <TrendList trends={cards.trends} byId={byId} kind="card" metric={trendMetric} /> : <p className="empty-results">Loading card trends…</p> : null}
        {trendKind === "tower" ? towers ? <TrendList trends={towers.trends} byId={byId} kind="tower" metric={trendMetric} /> : <p className="empty-results">Loading Tower Troop trends…</p> : null}
        {trendKind === "deck" ? decks ? <DeckTrendList trends={decks.deckTrends} byId={byId} metric={trendMetric} /> : <p className="empty-results">Loading deck trends…</p> : null}
        {truncated ? <p className="analytics-caveat">This view reached its bounded per-day read cap. Rankings describe the sampled rows and are not presented as complete coverage.</p> : null}
      </section>
      {cards ? <Movers report={cards} byId={byId} /> : null}
      {cards ? <TierList report={cards} byId={byId} /> : null}
      {decks ? <Archetypes report={decks} byId={byId} selected={selectedArchetype} /> : <section className="profile-section"><h2>Data-derived archetypes</h2><p className="empty-results">Loading archetypes…</p></section>}
    </>
  );
}
