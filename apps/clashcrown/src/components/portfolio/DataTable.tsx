import Image from "@/components/Image";
import Link from "@/components/Link";
import { CardArt } from "@/components/portfolio/CardArt";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import type { ReactNode } from "react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { stripSupercellColorTags } from "@/lib/clash/format";
import type { Card } from "@/lib/clash/domain";

/** Renders a rank with its movement since the previous ranking snapshot. */
export function RankCell({ rank, previousRank }: { rank?: number; previousRank?: number }) {
  const delta = typeof rank === "number" && typeof previousRank === "number" && previousRank > 0 ? previousRank - rank : 0;
  return (
    <span className="rank-cell">
      <strong>{rank ?? "—"}</strong>
      {delta !== 0 ? <i className={delta > 0 ? "rank-up" : "rank-down"}>{delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}</i> : null}
    </span>
  );
}

export function TrophyCell({ value, icon = "/images/ui-icons/trophies.png" }: { value?: number; icon?: string }) {
  return (
    <span className="trophy-cell">
      <Image src={icon} alt="" width={20} height={20} />
      {(value ?? 0).toLocaleString()}
    </span>
  );
}

export function EntityCell({
  href,
  name,
  badge,
  badgeFallback,
  sub,
  card
}: {
  href?: string;
  name: string;
  badge?: string;
  /**
   * Placeholder for a badge URL that 404s. Opt-in, because the right stand-in
   * differs per entity — a card wants the unknown-card art, a clan wants badge 0.
   */
  badgeFallback?: string;
  sub?: ReactNode;
  card?: Card;
}) {
  const displayName = stripSupercellColorTags(name);
  const art = card ? <GameCardArt card={card} size="micro" /> : badge ? (
    badgeFallback ? (
      <CardArt src={badge} alt="" width={30} height={36} fallback={badgeFallback} />
    ) : (
      <Image src={badge} alt="" width={30} height={36} />
    )
  ) : null;

  const body = (
    <span className="entity-cell">
      {art}
      <span>
        <strong>{displayName}</strong>
        {sub ? <small>{sub}</small> : null}
      </span>
    </span>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function TableShell({
  title,
  toolbar,
  head,
  children,
  note,
  empty,
  emptyMessage
}: {
  title: string;
  toolbar?: ReactNode;
  head: string[];
  children: ReactNode;
  note?: ReactNode;
  empty?: boolean;
  /** Say *why* the table is empty. "No results." leaves the reader guessing. */
  emptyMessage?: ReactNode;
}) {
  return (
    <section className="profile-section member-section">
      <div className="section-heading">
        <h2>{title}</h2>
        {toolbar ? <div className="update-tools">{toolbar}</div> : null}
      </div>
      {empty ? (
        <p className="empty-results">{emptyMessage ?? "No results."}</p>
      ) : (
        <div className="members-table-wrap rounded-xl border border-border bg-card/70">
          <Table className="members-table">
            <TableHeader>
              <TableRow>
                {head.map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>{children}</TableBody>
          </Table>
        </div>
      )}
      {note ? <p className="table-note">{note}</p> : null}
    </section>
  );
}
