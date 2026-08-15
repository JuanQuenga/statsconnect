import Head from "@/components/Head";
import { CardArt } from "@/components/portfolio/CardArt";
import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Layout } from "@/components/portfolio/Layout";
import { SetupState } from "@/components/portfolio/AsyncState";
import { EntityCell, RankCell, TableShell, TrophyCell } from "@/components/portfolio/DataTable";
import { META_MODES, modeLabel, type MetaMode } from "@/lib/clash/battles";
import { cardSlug } from "@/lib/clash/cards";
import { variantArt, UNKNOWN_CARD_IMAGE } from "@/lib/clash/assets";
import { useCardCatalog } from "@/lib/useCardCatalog";
import type { Card } from "@/lib/mock-data";
import type { PipelineRun, PipelineStatusPayload } from "@/lib/clash/types";
import {
  isConvexConfigured,
  pipelineStatusQuery,
  seedTagMutation,
  topCardsQuery,
  topDecksQuery
} from "@/lib/convex";

/**
 * Internal dashboard for the battle-log pipeline. It ships to production on
 * purpose — the crawler only runs against the deployed Convex instance, so the
 * only honest way to watch it is from the deployed site. Kept out of the nav
 * and out of search indexes.
 */
export default function BetaPage() {
  if (!isConvexConfigured) {
    return (
      <Layout>
        <Head>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <SetupState feature="the pipeline dashboard" />
      </Layout>
    );
  }
  return <Beta />;
}

const WINDOWS = [1, 7] as const;

function Beta() {
  const [mode, setMode] = useState<MetaMode>("ladder");
  const [windowDays, setWindowDays] = useState<(typeof WINDOWS)[number]>(7);

  const status = useQuery(pipelineStatusQuery, {});
  const decks = useQuery(topDecksQuery, { mode, windowDays, limit: 20 });
  const cards = useQuery(topCardsQuery, { mode, windowDays, limit: 24 });

  // The catalog is only needed to turn card ids into art, so it goes through
  // the same shared query the rest of the site uses.
  const byId = useCardCatalog();

  return (
    <Layout>
      <Head>
        <title>Beta | Royale Stats</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="profile-page">
        <section className="decks-hero">
          <h1>Pipeline beta</h1>
          <p>
            The official API only exposes battles one player at a time, so deck statistics are built by crawling
            battle logs and folding them into daily aggregates. This page shows what the crawler has managed so far.
          </p>
        </section>

        <PipelineHealth status={status} />
        <RunLog runs={status?.lastRuns} />

        <section className="profile-section">
          <div className="beta-controls">
            <div className="beta-tabs" role="group" aria-label="Battle mode">
              {META_MODES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={item === mode ? "beta-tab beta-tab-on" : "beta-tab"}
                  onClick={() => setMode(item)}
                >
                  {modeLabel(item)}
                </button>
              ))}
            </div>
            <div className="beta-tabs" role="group" aria-label="Time window">
              {WINDOWS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={item === windowDays ? "beta-tab beta-tab-on" : "beta-tab"}
                  onClick={() => setWindowDays(item)}
                >
                  {item}d
                </button>
              ))}
            </div>
          </div>
        </section>

        <TopDecks decks={decks?.decks} byId={byId} mode={mode} windowDays={windowDays} />
        <TopCards
          cards={cards?.cards}
          decksObserved={cards?.decksObserved ?? 0}
          byId={byId}
          mode={mode}
          windowDays={windowDays}
        />

        <Playground byId={byId} />
        <SeedTag />
      </div>
    </Layout>
  );
}

// --- Health ---------------------------------------------------------------

function count(probe?: { count: number; capped: boolean }) {
  if (!probe) return "—";
  return probe.capped ? `${probe.count.toLocaleString()}+` : probe.count.toLocaleString();
}

function ago(timestamp?: number | null) {
  if (!timestamp) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="beta-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function PipelineHealth({ status }: { status: PipelineStatusPayload | undefined }) {
  if (!status) {
    return (
      <section className="profile-section">
        <h2>Pipeline health</h2>
        <p className="empty-results">Connecting to Convex…</p>
      </section>
    );
  }

  const counters = status.counters;
  const failureRate = status.apiCalls.lastHour ? status.apiCalls.failures / status.apiCalls.lastHour : 0;

  return (
    <section className="profile-section">
      <div className="section-heading">
        <h2>Pipeline health</h2>
      </div>
      <div className="beta-grid">
        <Tile label="Tags tracked" value={(counters.crawlTargets ?? 0).toLocaleString()} sub="players in the crawl queue" />
        <Tile label="Due now" value={count(status.due)} sub="waiting to be fetched" />
        <Tile
          label="Battles ingested"
          value={(counters.battlesIngested ?? 0).toLocaleString()}
          sub="unique battles, all time"
        />
        <Tile
          label="Deck observations"
          value={(counters.observationsIngested ?? 0).toLocaleString()}
          sub="two per battle, one per side"
        />
        <Tile label="Battles today" value={status.battlesToday.toLocaleString()} sub={`${count(status.decksToday)} distinct decks`} />
        <Tile
          label="API calls / hour"
          value={status.apiCalls.capped ? `${status.apiCalls.lastHour}+` : `${status.apiCalls.lastHour}`}
          sub={`${status.apiCalls.failures} failed (${Math.round(failureRate * 100)}%)`}
        />
        <Tile label="Rankings computed" value={ago(status.rankingsComputedAt)} sub="rollup cron, every 30m" />
        <Tile
          label="Fetch failures"
          value={(counters.playerFetchFailures ?? 0).toLocaleString()}
          sub={`of ${(counters.playerFetches ?? 0).toLocaleString()} battle-log reads`}
        />
      </div>
      <p className="table-note">
        Counts marked with a “+” come from a bounded read — Convex has no count operator, so the page shows the cap
        rather than guessing past it.
      </p>
    </section>
  );
}

function duration(run: PipelineRun) {
  if (!run.finishedAt) return "running…";
  const ms = run.finishedAt - run.startedAt;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function RunLog({ runs }: { runs?: PipelineRun[] }) {
  return (
    <TableShell
      title="Recent cron runs"
      head={["Job", "Started", "Took", "Result", "Detail"]}
      empty={runs?.length === 0}
      note="Discovery every 6h, crawl every 2m, rollup every 30m, prune every 6h."
    >
      {(runs ?? []).map((run) => (
        <tr key={run._id}>
          <td>
            <strong>{run.job}</strong>
          </td>
          <td>{ago(run.startedAt)}</td>
          <td>{duration(run)}</td>
          <td className={run.ok ? "decks-done" : "decks-none"}>{run.ok ? "ok" : "failed"}</td>
          <td>{run.note ?? "—"}</td>
        </tr>
      ))}
    </TableShell>
  );
}

// --- Meta preview ---------------------------------------------------------

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

/** Mirrors the deck thumb on /meta: a variant slot renders its own art. */
function CardThumb({ card, id, evolved }: { card?: Card; id: number; evolved?: boolean }) {
  const name = card?.name ?? `Card ${id}`;
  const variant = evolved ? variantArt(card) : undefined;
  const label = variant ? `${name} (${variant.label})` : name;
  const marked = evolved && !variant;
  return (
    <span className={marked ? "beta-thumb beta-thumb-evo" : "beta-thumb"} title={label}>
      {marked ? <i className="evo-dot" aria-hidden="true" /> : null}
      <CardArt src={variant?.src ?? card?.image ?? UNKNOWN_CARD_IMAGE} alt={label} width={46} height={56} />
    </span>
  );
}

/** Shown whenever a table has no rows yet, so nobody reads "0" as "nothing wins". */
function NotEnoughData({ mode, windowDays }: { mode: MetaMode; windowDays: number }) {
  return (
    <p className="empty-results">
      No {modeLabel(mode)} data in the last {windowDays === 1 ? "day" : `${windowDays} days`} yet. The crawler needs
      to observe a deck at least five times before it is ranked.
    </p>
  );
}

function TopDecks({
  decks,
  byId,
  mode,
  windowDays
}: {
  decks?: Array<{
    _id: string;
    rank: number;
    cardIds: number[];
    evolutionIds: number[];
    uses: number;
    winRate: number;
    usageRate: number;
  }>;
  byId: Map<number, Card>;
  mode: MetaMode;
  windowDays: number;
}) {
  if (!decks) {
    return (
      <section className="profile-section">
        <h2>Top decks</h2>
        <p className="empty-results">Loading…</p>
      </section>
    );
  }

  if (!decks.length) {
    return (
      <section className="profile-section">
        <div className="section-heading">
          <h2>Top decks</h2>
        </div>
        <NotEnoughData mode={mode} windowDays={windowDays} />
      </section>
    );
  }

  return (
    <TableShell
      title="Top decks"
      head={["#", "Deck", "Uses", "Win rate", "Usage"]}
      note={`${modeLabel(mode)}, last ${windowDays === 1 ? "24 hours" : `${windowDays} days`}. Ranked by how often the deck was played.`}
    >
      {decks.map((deck) => {
        const evolved = new Set(deck.evolutionIds);
        return (
          <tr key={deck._id}>
            <td>
              <RankCell rank={deck.rank} />
            </td>
            <td>
              <span className="beta-deck">
                {deck.cardIds.map((id, index) => (
                  <CardThumb key={`${id}-${index}`} id={id} card={byId.get(id)} evolved={evolved.has(id)} />
                ))}
              </span>
            </td>
            <td>{deck.uses.toLocaleString()}</td>
            <td className={deck.winRate >= 0.5 ? "decks-done" : "decks-none"}>{pct(deck.winRate)}</td>
            <td>{pct(deck.usageRate)}</td>
          </tr>
        );
      })}
    </TableShell>
  );
}

function TopCards({
  cards,
  decksObserved,
  byId,
  mode,
  windowDays
}: {
  cards?: Array<{ cardId: number; uses: number; winRate: number; usageRate: number }>;
  decksObserved: number;
  byId: Map<number, Card>;
  mode: MetaMode;
  windowDays: number;
}) {
  if (!cards?.length) {
    return (
      <section className="profile-section">
        <div className="section-heading">
          <h2>Top cards</h2>
        </div>
        {cards ? <NotEnoughData mode={mode} windowDays={windowDays} /> : <p className="empty-results">Loading…</p>}
      </section>
    );
  }

  return (
    <TableShell
      title="Top cards"
      head={["Card", "Uses", "Win rate", "Usage"]}
      note={`Usage is the share of the ${Math.round(decksObserved).toLocaleString()} decks observed that included the card.`}
    >
      {cards.map((row) => {
        const card = byId.get(row.cardId);
        return (
          <tr key={row.cardId}>
            <td>
              <EntityCell
                href={card ? `/cards/${cardSlug(card.name)}` : undefined}
                name={card?.name ?? `Card ${row.cardId}`}
                badge={card?.image ?? UNKNOWN_CARD_IMAGE}
                badgeFallback={UNKNOWN_CARD_IMAGE}
                sub={card ? `${card.rarity} · ${card.elixir} elixir` : "Not in the catalog"}
              />
            </td>
            <td>{row.uses.toLocaleString()}</td>
            <td className={row.winRate >= 0.5 ? "decks-done" : "decks-none"}>{pct(row.winRate)}</td>
            <td>{pct(row.usageRate)}</td>
          </tr>
        );
      })}
    </TableShell>
  );
}

// --- Component playground -------------------------------------------------

/** Renders the shared table primitives against fixed inputs so regressions are visible. */
function Playground({ byId }: { byId: Map<number, Card> }) {
  const sample = [...byId.values()].slice(0, 8);

  return (
    <section className="profile-section">
      <div className="section-heading">
        <h2>Component playground</h2>
      </div>
      <div className="beta-playground">
        <div>
          <span>RankCell</span>
          <div>
            <RankCell rank={1} previousRank={4} />
            <RankCell rank={12} previousRank={3} />
            <RankCell rank={7} previousRank={7} />
            <RankCell />
          </div>
        </div>
        <div>
          <span>TrophyCell</span>
          <div>
            <TrophyCell value={9421} />
            <TrophyCell value={0} />
          </div>
        </div>
        <div>
          <span>EntityCell</span>
          <div>
            <EntityCell name="Royale Stats" sub="#2PP · 48 members" href="/clans/search" />
            <EntityCell name="No badge" sub="fallback layout" />
          </div>
        </div>
        <div>
          <span>Chips</span>
          <div>
            <span className="rarity-chip rarity-legendary">Legendary</span>
            <span className="elixir-chip">4 elixir</span>
            <span className="evo-chip">Evolution</span>
            <span className="status-chip status-inprogress">In progress</span>
            <span className="status-chip status-ended">Ended</span>
          </div>
        </div>
        <div>
          <span>Card thumbs</span>
          <div>
            <span className="beta-deck">
              {sample.length ? (
                sample.map((card, index) => (
                  <CardThumb key={card.id ?? index} id={card.id ?? 0} card={card} evolved={index === 0} />
                ))
              ) : (
                <CardThumb id={0} />
              )}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// --- Admin ----------------------------------------------------------------

/** Pushes a specific player to the front of the crawl queue, for testing a tag on demand. */
function SeedTag() {
  const seed = useMutation(seedTagMutation);
  const [tag, setTag] = useState("");
  const [key, setKey] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      setResult(await seed({ tag, key }));
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : "Request failed." });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="profile-section">
      <div className="section-heading">
        <h2>Queue a player</h2>
      </div>
      <form className="beta-admin" onSubmit={submit}>
        <label className="card-search">
          <input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder="Player tag (#2PP0LYQ)"
            aria-label="Player tag"
          />
        </label>
        <label className="card-search">
          <input
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="Admin key"
            aria-label="Admin key"
          />
        </label>
        <button type="submit" className="pink-button" disabled={pending || !tag || !key}>
          {pending ? "Queueing…" : "Queue"}
        </button>
      </form>
      {result ? <p className={result.ok ? "table-note decks-done" : "table-note decks-none"}>{result.message}</p> : null}
      <p className="table-note">
        Requires BETA_ADMIN_KEY from the Convex environment. The key is only sent with the request; nothing is stored.
      </p>
    </section>
  );
}
