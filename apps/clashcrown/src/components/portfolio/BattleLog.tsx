import Link from "@/components/Link";
import { CardArt } from "@/components/portfolio/CardArt";
import { DeckActions } from "@/components/portfolio/DeckActions";
import type { Battle, Card } from "@/lib/mock-data";
import styles from "./BattleLog.module.css";

type Side = {
  kind: "player" | "opponent";
  name: string;
  tag?: string;
  clan?: string;
  cards: Card[];
  supportCards: Card[];
  startingTrophies?: number;
  trophyChange?: number;
  kingTowerHitPoints?: number | null;
  princessTowersHitPoints?: number[] | null;
};

export function formatTrophyChange(value?: number): string | undefined {
  if (value === undefined) return undefined;
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

export function towerHitPointsSummary(king?: number | null, princess?: number[] | null): string | undefined {
  const parts: string[] = [];
  if (typeof king === "number") parts.push(`King ${king.toLocaleString()} HP`);
  if (princess?.length) parts.push(`Princess ${princess.map((value) => value.toLocaleString()).join(" / ")} HP`);
  return parts.length ? parts.join(" · ") : undefined;
}

export function BattleHistory({ battles, playerName }: { battles: Battle[]; playerName: string }) {
  if (!battles.length) {
    return <section className="profile-section empty-panel"><h2>No recent battles</h2><p>The API did not return any battles for this player.</p></section>;
  }

  return (
    <section className="profile-section">
      <div className="section-heading compact-heading"><span className="filter-button static">{battles.length} recent</span><h2>Battle Log</h2><span /></div>
      <div className={styles.history}>
        {battles.map((battle, index) => <BattleCard key={`${battle.date}-${battle.opponent}-${index}`} battle={battle} playerName={playerName} />)}
      </div>
    </section>
  );
}

function BattleCard({ battle, playerName }: { battle: Battle; playerName: string }) {
  const player: Side = {
    kind: "player",
    name: playerName,
    cards: battle.deck,
    supportCards: battle.supportCards ?? [],
    startingTrophies: battle.startingTrophies,
    trophyChange: battle.trophyChange,
    kingTowerHitPoints: battle.kingTowerHitPoints,
    princessTowersHitPoints: battle.princessTowersHitPoints
  };
  const opponent: Side = {
    kind: "opponent",
    name: battle.opponent,
    tag: battle.opponentTag,
    clan: battle.opponentClan,
    cards: battle.opponentDeck ?? [],
    supportCards: battle.opponentSupportCards ?? [],
    startingTrophies: battle.opponentStartingTrophies,
    trophyChange: battle.opponentTrophyChange,
    kingTowerHitPoints: battle.opponentKingTowerHitPoints,
    princessTowersHitPoints: battle.opponentPrincessTowersHitPoints
  };

  return (
    <article className={`${styles.card} ${styles[battle.result.toLowerCase() as "win" | "loss" | "draw"]}`}>
      <header className={styles.header}>
        <div className={styles.result}>
          <strong>{battle.result}</strong>
          <span>{battle.mode}</span>
        </div>
        <div className={styles.score} aria-label={`${battle.crowns[0]} crowns to ${battle.crowns[1]} crowns`}>
          <span>{battle.crowns[0]}</span><i>–</i><span>{battle.crowns[1]}</span>
        </div>
        <time className={styles.time}>{battle.date}{battle.time ? <><span aria-hidden="true"> · </span>{battle.time}</> : null}</time>
      </header>
      <div className={styles.matchup}>
        <BattleSide side={player} />
        <BattleSide side={opponent} />
      </div>
    </article>
  );
}

function BattleSide({ side }: { side: Side }) {
  const trophyChange = formatTrophyChange(side.trophyChange);
  const towerHitPoints = towerHitPointsSummary(side.kingTowerHitPoints, side.princessTowersHitPoints);
  const title = side.kind === "player" ? "Player deck" : `${side.name}'s deck`;

  return (
    <section className={styles.side} aria-label={title}>
      <div className={styles.sideHeader}>
        <div className={styles.identity}>
          <span>{side.kind === "player" ? "Player" : "Opponent"}</span>
          {side.kind === "opponent" && side.tag ? (
            <Link href={`/players/${side.tag}`}><strong>{side.name}</strong></Link>
          ) : (
            <strong>{side.name}</strong>
          )}
          {side.clan ? <small>{side.clan}</small> : null}
        </div>
        <DeckActions cards={side.cards} label={title.toLowerCase()} compact />
      </div>
      {(side.startingTrophies !== undefined || trophyChange !== undefined || towerHitPoints) ? (
        <dl className={styles.details}>
          {side.startingTrophies !== undefined ? <div><dt>Started</dt><dd>{side.startingTrophies.toLocaleString()} trophies</dd></div> : null}
          {trophyChange !== undefined ? <div><dt>Change</dt><dd className={side.trophyChange && side.trophyChange > 0 ? styles.positive : side.trophyChange && side.trophyChange < 0 ? styles.negative : undefined}>{trophyChange} trophies</dd></div> : null}
          {towerHitPoints ? <div><dt>Towers left</dt><dd>{towerHitPoints}</dd></div> : null}
        </dl>
      ) : null}
      <DeckGrid cards={side.cards} />
      {side.supportCards.length ? (
        <div className={styles.towerTroops}>
          <span>Tower troop</span>
          <DeckGrid cards={side.supportCards} support />
        </div>
      ) : null}
    </section>
  );
}

function DeckGrid({ cards, support = false }: { cards: Card[]; support?: boolean }) {
  if (!cards.length) return <p className={styles.unavailable}>Deck not returned by the API.</p>;
  return (
    <div className={`${styles.deck} ${support ? styles.supportDeck : ""}`} role="list" aria-label={support ? "Tower troop" : "Cards"}>
      {cards.map((card, index) => <BattleCardSlot key={`${card.id ?? card.name}-${index}`} card={card} />)}
    </div>
  );
}

function BattleCardSlot({ card }: { card: Card }) {
  const detail = [card.variant, card.level !== undefined ? `level ${card.level}` : undefined].filter(Boolean).join(", ");
  return (
    <div className={styles.slot} role="listitem" title={`${card.name}${detail ? `, ${detail}` : ""}`}>
      {card.variant ? <span className={styles.variant}>{card.variant === "Evolution" ? "EVO" : "HERO"}</span> : null}
      {card.level !== undefined ? <span className={styles.level}>Lv {card.level}</span> : null}
      <CardArt src={card.image} alt={`${card.name}${detail ? `, ${detail}` : ""}`} width={74} height={91} />
      <strong>{card.name}</strong>
    </div>
  );
}
