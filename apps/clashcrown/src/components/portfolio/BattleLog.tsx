import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Image from "@/components/Image";
import Link from "@/components/Link";
import { DeckActions } from "@/components/portfolio/DeckActions";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import { battleModeLabel } from "@/lib/clash/battles";
import { cardSlug } from "@/lib/clash/cards";
import type { Battle, Card } from "@/lib/clash/domain";
import styles from "./BattleLog.module.css";

type Result = "all" | "Win" | "Loss";

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

/**
 * One compact row per battle: result, both decks face to face, score, and
 * trophy change. Tower hit points and deck actions open on demand.
 */
export function BattleHistory({ battles, playerName }: { battles: Battle[]; playerName: string }) {
  const [result, setResult] = useState<Result>("all");
  const [mode, setMode] = useState("all");

  if (!battles.length) {
    return <section className="profile-section empty-panel"><h2>No recent battles</h2><p>The API did not return any battles for this player.</p></section>;
  }

  const modes = [...new Set(battles.map((battle) => battleModeLabel(battle.mode)))];
  const visible = battles.filter((battle) =>
    (result === "all" || battle.result === result) && (mode === "all" || battleModeLabel(battle.mode) === mode));
  const wins = battles.filter((battle) => battle.result === "Win").length;
  const losses = battles.filter((battle) => battle.result === "Loss").length;

  return (
    <section className="profile-section">
      <div className="section-heading">
        <h2>Battle log</h2>
        <span>{battles.length} recent · {wins}W {losses}L</span>
      </div>
      <div className={styles.filters}>
        <div className="cr-tabs" role="group" aria-label="Result">
          {(["all", "Win", "Loss"] as const).map((item) => (
            <button key={item} type="button" aria-pressed={result === item} onClick={() => setResult(item)}>
              {item === "all" ? "All" : item === "Win" ? "Wins" : "Losses"}
            </button>
          ))}
        </div>
        {modes.length > 1 ? (
          <label className={styles.modeSelect}>
            <span>Mode</span>
            <select value={mode} onChange={(event) => setMode(event.currentTarget.value)}>
              <option value="all">All modes</option>
              {modes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      {visible.length ? (
        <ol className={styles.list}>
          {visible.map((battle, index) => <BattleRow key={`${battle.date}-${battle.time}-${battle.opponent}-${index}`} battle={battle} playerName={playerName} />)}
        </ol>
      ) : <p className={styles.none}>No battles match these filters.</p>}
    </section>
  );
}

function BattleRow({ battle, playerName }: { battle: Battle; playerName: string }) {
  const [open, setOpen] = useState(false);
  const change = formatTrophyChange(battle.trophyChange);
  const result = battle.result.toLowerCase();
  const ownTowers = towerHitPointsSummary(battle.kingTowerHitPoints, battle.princessTowersHitPoints);
  const theirTowers = towerHitPointsSummary(battle.opponentKingTowerHitPoints, battle.opponentPrincessTowersHitPoints);

  return (
    <li className={styles.row} data-result={result}>
      <div className={styles.summary}>
        <div className={styles.outcome}>
          <strong>{battle.result}</strong>
          <span>{battleModeLabel(battle.mode)}</span>
          <time>{battle.date}{battle.time ? ` · ${battle.time}` : ""}</time>
        </div>

        <MiniDeck cards={battle.deck} support={battle.supportCards} label={`${playerName}'s deck`} />

        <div className={styles.score}>
          <span className={styles.crowns}>
            <Image src="/images/icons/crown-left.png" alt="" width={22} height={22} />
            <b>{battle.crowns[0]}</b>
            <i>–</i>
            <b>{battle.crowns[1]}</b>
            <Image src="/images/icons/crown-right.png" alt="" width={22} height={22} />
          </span>
          {change ? <span className={styles.change} data-sign={Math.sign(battle.trophyChange ?? 0)}>{change}</span> : null}
        </div>

        <div className={styles.opponent}>
          <MiniDeck cards={battle.opponentDeck ?? []} support={battle.opponentSupportCards} label={`${battle.opponent}'s deck`} />
          <span className={styles.opponentName}>
            {battle.opponentTag ? <Link href={`/players/${battle.opponentTag.replace(/^#/, "")}`}>{battle.opponent}</Link> : battle.opponent}
            {battle.opponentClan ? <small>{battle.opponentClan}</small> : null}
          </span>
        </div>

        <button type="button" className={styles.more} aria-expanded={open} aria-label={open ? "Hide battle details" : "Show battle details"} onClick={() => setOpen((value) => !value)}>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </div>

      {open ? (
        <div className={styles.details}>
          <div>
            <strong>{playerName}</strong>
            {battle.startingTrophies !== undefined ? <span>Started at {battle.startingTrophies.toLocaleString()} trophies</span> : null}
            {ownTowers ? <span>Towers left: {ownTowers}</span> : null}
            {battle.deck.length ? <DeckActions cards={battle.deck} label={`${playerName}'s deck`} compact /> : null}
          </div>
          <div>
            <strong>{battle.opponent}</strong>
            {battle.opponentStartingTrophies !== undefined ? <span>Started at {battle.opponentStartingTrophies.toLocaleString()} trophies</span> : null}
            {theirTowers ? <span>Towers left: {theirTowers}</span> : null}
            {battle.opponentDeck?.length ? <DeckActions cards={battle.opponentDeck} label={`${battle.opponent}'s deck`} compact /> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function MiniDeck({ cards, support = [], label }: { cards: Card[]; support?: Card[]; label: string }) {
  if (!cards.length) return <span className={styles.noDeck}>Deck not shown</span>;
  return (
    <div className={styles.deck} role="group" aria-label={label}>
      {cards.map((card, index) => (
        <Link key={`${card.id ?? card.name}-${index}`} href={`/cards/${cardSlug(card.name)}`} title={card.name} className={styles.card}>
          <GameCardArt card={card} size="mini" showLevel={false} />
        </Link>
      ))}
      {support[0] ? (
        <Link href={`/cards/${cardSlug(support[0].name)}`} title={`Tower Troop: ${support[0].name}`} className={`${styles.card} ${styles.tower}`}>
          <GameCardArt card={support[0]} size="mini" showLevel={false} />
        </Link>
      ) : null}
    </div>
  );
}
