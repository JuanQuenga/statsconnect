import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import Link from "@/components/Link";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import { Skeleton } from "@/components/ui/skeleton";
import { UNKNOWN_CARD_IMAGE } from "@/lib/clash/assets";
import { cardSlug } from "@/lib/clash/cards";
import type { Card } from "@/lib/clash/domain";
import { centredBarExtent } from "@/lib/metaReport";
import type { CardMover, TierRow } from "@/lib/analytics";
import { useMetaCopy } from "./metaCopy";
import styles from "./meta.module.css";

export type CardIndex = Map<number, Card>;

export function cardFor(id: number, byId: CardIndex): Card {
  return byId.get(id) ?? { id, name: `Card ${id}`, elixir: 0, rarity: "Common", image: UNKNOWN_CARD_IMAGE };
}

export function cardsFor(ids: readonly number[], byId: CardIndex): Card[] {
  return ids.map((id) => cardFor(id, byId));
}

export function cardHref(id: number, byId: CardIndex): string {
  const card = byId.get(id);
  return card ? `/cards/${cardSlug(card.name)}` : "/cards";
}

export function archetypeName(coreCardIds: readonly number[], byId: CardIndex): string {
  return coreCardIds.map((id) => cardFor(id, byId).name).join(" + ");
}

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** One white report sheet with a title row. */
export function Sheet({
  title,
  aside,
  note,
  children,
  className,
  labelId
}: {
  title: ReactNode;
  aside?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
  labelId: string;
}) {
  return (
    <section className={cx(styles.sheet, className)} aria-labelledby={labelId}>
      <header className={styles.sheetHeader}>
        <h2 id={labelId} className={styles.sheetTitle}>{title}</h2>
        {aside ? <div className={styles.sheetAside}>{aside}</div> : null}
      </header>
      {children}
      {note ? <div className={styles.sheetFoot}>{note}</div> : null}
    </section>
  );
}

/** A single compact methodology line that expands on demand. */
export function DataNote({ children, warning }: { children: ReactNode; warning?: ReactNode }) {
  const { copy } = useMetaCopy();
  return (
    <details className={styles.note}>
      <summary>
        <Info size={14} aria-hidden="true" />
        {copy.aboutData}
        {warning ? <span className={styles.noteFlag}>{warning}</span> : null}
      </summary>
      <div className={styles.noteBody}>{children}</div>
    </details>
  );
}

export function BlockSkeleton({ count = 3, height = 120, className }: { count?: number; height?: number; className?: string }) {
  const { copy } = useMetaCopy();
  return (
    <div className={cx(styles.skeletonGrid, className)} role="status" aria-label={copy.loading}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={cx(styles.skeleton, "motion-reduce:animate-none")} style={{ height }} />
      ))}
    </div>
  );
}

export function EmptyBlock({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      {hint ? <p className={styles.emptyHint}>{hint}</p> : null}
      {action}
    </div>
  );
}

/** Horizontal win-rate bar with 50% at the centre: green grows right, red grows left. */
export function WinRateBar({ winRate }: { winRate: number }) {
  const { direction, extent } = centredBarExtent(winRate);
  return (
    <span className={styles.winBar} aria-hidden="true">
      <i
        className={direction === "down" ? styles.winBarDown : styles.winBarUp}
        style={direction === "down" ? { width: `${extent * 50}%`, right: "50%" } : { width: `${extent * 50}%`, left: "50%" }}
      />
    </span>
  );
}

export function rateTone(winRate: number) {
  return winRate >= 0.5 ? styles.up : styles.down;
}

/** Card art, name and a sub line, linking to the card report. */
export function CardRow({ id, byId, sub, value, valueTone }: { id: number; byId: CardIndex; sub?: ReactNode; value?: ReactNode; valueTone?: string }) {
  const card = cardFor(id, byId);
  return (
    <Link href={cardHref(id, byId)} className={styles.cardRow}>
      <span className={styles.cardRowArt}><GameCardArt card={card} size="mini" /></span>
      <span className={styles.cardRowText}>
        <strong>{card.name}</strong>
        {sub ? <small>{sub}</small> : null}
      </span>
      {value ? <span className={cx(styles.cardRowValue, valueTone)}>{value}</span> : null}
    </Link>
  );
}

const TIERS = ["S", "A", "B", "C"] as const;

export function TierRows({ tiers, byId, only, limitPerTier }: { tiers: readonly TierRow[]; byId: CardIndex; only?: ReadonlyArray<(typeof TIERS)[number]>; limitPerTier?: number }) {
  const { copy, pct, count } = useMetaCopy();
  return (
    <div className={styles.tierList}>
      {(only ?? TIERS).map((tier) => {
        const rows = tiers.filter((row) => row.tier === tier);
        const shown = limitPerTier ? rows.slice(0, limitPerTier) : rows;
        return (
          <div key={tier} className={styles.tierRow} data-tier={tier}>
            <span className={styles.tierBadge} aria-label={copy.tierLabel(tier)}>{tier}</span>
            <div className={styles.tierCards}>
              {shown.length ? shown.map((row) => {
                const card = cardFor(row.cardId, byId);
                const label = `${card.name}: ${pct(row.winRate)} ${copy.winRate.toLowerCase()}, ${copy.cardTooltipGames(count(row.uses))}`;
                return (
                  <Link key={row.cardId} href={cardHref(row.cardId, byId)} className={styles.tierCard} title={label} aria-label={label}>
                    <GameCardArt card={card} size="mini" />
                  </Link>
                );
              }) : <span className={styles.tierEmpty}>{copy.tierEmpty}</span>}
              {limitPerTier && rows.length > limitPerTier ? <span className={styles.tierMore}>+{rows.length - limitPerTier}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MoverColumns({ risers, decliners, byId, limit = 6 }: { risers: readonly CardMover[]; decliners: readonly CardMover[]; byId: CardIndex; limit?: number }) {
  const { copy, pts } = useMetaCopy();
  const groups = [
    { key: "up", title: copy.rising, rows: risers, Icon: ArrowUpRight, tone: styles.up },
    { key: "down", title: copy.falling, rows: decliners, Icon: ArrowDownRight, tone: styles.down }
  ];
  return (
    <div className={styles.movers}>
      {groups.map(({ key, title, rows, Icon, tone }) => (
        <div key={key} className={styles.moverColumn}>
          <h3 className={cx(styles.moverHeading, tone)}><Icon size={16} aria-hidden="true" />{title}</h3>
          {rows.length ? rows.slice(0, limit).map((row) => (
            <CardRow
              key={row.cardId}
              id={row.cardId}
              byId={byId}
              sub={copy.winPoints(pts(row.winRateDelta))}
              value={copy.usagePoints(pts(row.usageDelta))}
              valueTone={tone}
            />
          )) : <p className={styles.mutedLine}>{copy.emptyMovers}</p>}
        </div>
      ))}
    </div>
  );
}
