import { useId, useState } from "react";
import { useQuery } from "convex/react";
import { Check, ChevronDown, Copy, Hammer, Swords } from "lucide-react";
import Link from "@/components/Link";
import { DeckCardGrid } from "@/components/portfolio/DeckCardGrid";
import { averageElixir, copyDeckLink } from "@/lib/clash/assets";
import { deckBuilderHref } from "@/lib/metaReport";
import { clashBackend } from "@/lib/platformBackend";
import { useMetaCopy } from "./metaCopy";
import { BlockSkeleton, cardFor, cardsFor, cx, rateTone, WinRateBar, type CardIndex } from "./shared";
import styles from "./meta.module.css";

export type TileDeck = {
  deckHash: string;
  cardIds: number[];
  evolutionIds: number[];
  uses: number;
  winRate: number;
  usageRate: number;
  rating?: number;
};

const deckMatchupsQuery = clashBackend.meta.deckMatchups;

function evolutionIdsFromHash(deckHash: string): number[] {
  return deckHash
    .split("-")
    .filter((token) => token.endsWith("e"))
    .map((token) => Number(token.slice(0, -1)))
    .filter((id) => Number.isInteger(id));
}

/**
 * One observed deck. `compact` is the overview flavour (no matchups, fewer
 * stats); `full` is the Decks view tile with every action.
 */
export function DeckTile({ deck, rank, byId, variant = "full" }: { deck: TileDeck; rank?: number; byId: CardIndex; variant?: "full" | "compact" }) {
  const { copy, pct, count } = useMetaCopy();
  const [showMatchups, setShowMatchups] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const panelId = useId();
  const link = copyDeckLink(deck.cardIds);
  const elixir = averageElixir(deck.cardIds.map((id) => ({ elixirCost: byId.get(id)?.elixir })));
  const label = rank ? copy.deckLabel(rank) : deck.cardIds.map((id) => cardFor(id, byId).name).join(", ");

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2200);
  }

  return (
    <article className={cx(styles.deckTile, variant === "compact" && styles.deckTileCompact)} aria-label={label}>
      <header className={styles.deckTileHead}>
        {rank ? <span className={styles.deckRank}>{copy.rank(rank)}</span> : null}
        {deck.rating !== undefined ? (
          <span className={styles.ratingBadge} title={copy.ratingTitle}>
            {copy.ratingValue(String(Math.round(deck.rating * 100)))}
          </span>
        ) : null}
      </header>

      <DeckCardGrid cards={cardsFor(deck.cardIds, byId)} evolutionIds={deck.evolutionIds} label={label} size="compact" className={styles.deckGrid} />

      <div className={styles.deckWin}>
        <span className={styles.statLabel}>{copy.winRate}</span>
        <strong className={rateTone(deck.winRate)}>{pct(deck.winRate)}</strong>
        <WinRateBar winRate={deck.winRate} />
      </div>

      <dl className={styles.deckStats}>
        <div><dt>{copy.games}</dt><dd>{count(deck.uses)}</dd></div>
        <div><dt>{copy.usage}</dt><dd>{pct(deck.usageRate, 2)}</dd></div>
        <div><dt>{copy.elixir}</dt><dd>{elixir ? elixir.toFixed(1) : "–"}</dd></div>
        {variant === "full" ? <div><dt>{copy.evolutions}</dt><dd>{deck.evolutionIds.length}</dd></div> : null}
      </dl>

      <div className={styles.deckActions}>
        {link ? (
          <a className={styles.goldButton} href={link} target="_blank" rel="noopener noreferrer">
            {copy.copyToGame}
          </a>
        ) : null}
        <button type="button" className={styles.iconButton} onClick={copyLink} disabled={!link} aria-label={copy.copyLink} title={copy.copyLink}>
          {copyState === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        </button>
        <Link href={deckBuilderHref(deck.cardIds)} className={styles.ghostButton} aria-label={copy.openBuilder} title={copy.openBuilder}>
          <Hammer size={15} aria-hidden="true" />
          <span>{copy.builderShort}</span>
        </Link>
        {variant === "full" ? (
          <button
            type="button"
            className={styles.ghostButton}
            aria-expanded={showMatchups}
            aria-controls={panelId}
            onClick={() => setShowMatchups((value) => !value)}
          >
            <Swords size={15} aria-hidden="true" />
            <span>{showMatchups ? copy.hideMatchups : copy.matchups}</span>
            <ChevronDown size={14} aria-hidden="true" className={cx(styles.chevron, showMatchups && styles.chevronOpen)} />
          </button>
        ) : null}
        <span className={styles.srStatus} role="status" aria-live="polite">
          {copyState === "copied" ? copy.linkCopied : copyState === "failed" ? copy.copyFailed : ""}
        </span>
      </div>

      {variant === "full" ? (
        <div id={panelId} hidden={!showMatchups}>
          {showMatchups ? <DeckMatchups deckHash={deck.deckHash} byId={byId} /> : null}
        </div>
      ) : null}
    </article>
  );
}

function DeckMatchups({ deckHash, byId }: { deckHash: string; byId: CardIndex }) {
  const { copy, pct, count } = useMetaCopy();
  const matchups = useQuery(deckMatchupsQuery, { deckHash });
  if (!matchups) return <div className={styles.matchups}><BlockSkeleton count={2} height={86} /></div>;

  const groups = [
    { key: "best", title: copy.bestMatchups, rows: matchups.best },
    { key: "worst", title: copy.worstMatchups, rows: matchups.worst }
  ];
  return (
    <div className={styles.matchups}>
      <div className={styles.matchupGroups}>
        {groups.map((group) => (
          <div key={group.key} className={styles.matchupGroup}>
            <h4>{group.title}</h4>
            {group.rows.length ? group.rows.map((row) => (
              <div key={row.oppDeckHash} className={styles.matchupRow}>
                <DeckCardGrid
                  cards={cardsFor(row.cardIds, byId)}
                  evolutionIds={evolutionIdsFromHash(row.oppDeckHash)}
                  label={copy.opponentDeck}
                  size="compact"
                  linkCards={false}
                  className={styles.matchupGrid}
                />
                <span className={styles.matchupRate}>
                  <strong className={rateTone(row.winRate)}>{pct(row.winRate)}</strong>
                  <small>{copy.matchupGames(count(row.uses))}</small>
                </span>
              </div>
            )) : <p className={styles.mutedLine}>{copy.matchupsEmpty(matchups.minUses)}</p>}
          </div>
        ))}
      </div>
      <p className={styles.mutedLine}>{copy.matchupsNote(matchups.windowDays, matchups.minUses)}</p>
    </div>
  );
}
