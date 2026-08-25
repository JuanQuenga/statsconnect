import Head from "@/components/Head";
import { CardArt } from "@/components/portfolio/CardArt";
import Link from "@/components/Link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { Copy } from "lucide-react";
import { ArenaRouteHero } from "@/components/portfolio/ArenaRouteHero";
import { Layout } from "@/components/portfolio/Layout";
import { DeckMatchupPanel } from "@/components/MetaMatchups";
import { MetaAnalytics } from "@/components/MetaAnalytics";
import { SetupState } from "@/components/portfolio/AsyncState";
import { EntityCell, RankCell, TableShell } from "@/components/portfolio/DataTable";
import { META_MODES, modeLabel, type MetaMode } from "@/lib/clash/battles";
import { cardSlug } from "@/lib/clash/cards";
import { averageElixir, copyDeckLink, variantArt, UNKNOWN_CARD_IMAGE } from "@/lib/clash/assets";
import { useCardCatalog } from "@/lib/useCardCatalog";
import type { Card } from "@/lib/clash/domain";
import { isConvexConfigured, topCardsQuery, topDecksQuery, topTowerTroopsQuery } from "@/lib/convex";
import { useI18n } from "@/lib/i18n";

/**
 * The public face of the battle-log pipeline.
 *
 * `/beta` shows the machinery; this page shows only what the machinery
 * produced, and always alongside the sample size it came from. Deck statistics
 * are not published by the official API — they exist here because the crawler
 * reads battle logs one player at a time and folds them into daily aggregates.
 */

const WINDOWS = [1, 7] as const;
type Window = (typeof WINDOWS)[number];

export default function MetaPage() {
  if (!isConvexConfigured) {
    return (
      <Layout>
        <SetupState feature="the meta report" />
      </Layout>
    );
  }
  return <MetaReport />;
}

function MetaReport() {
  const { formatNumber, locale, t } = useI18n();
  // Path of Legends is the default because it is where the crawl has by far
  // the deepest sample; the other modes are honest but thinner.
  const [mode, setMode] = useState<MetaMode>("pathOfLegends");
  const [windowDays, setWindowDays] = useState<Window>(7);

  const byId = useCardCatalog();
  const decks = useQuery(topDecksQuery, { mode, windowDays, limit: 30 });
  const cards = useQuery(topCardsQuery, { mode, windowDays, limit: 40 });
  const towerTroops = useQuery(topTowerTroopsQuery, { mode, windowDays, limit: 40 });

  const sample = cards?.decksObserved ?? 0;

  return (
    <Layout>
      <Head>
        <title>{t("meta.title")} | StatsConnect · Clash Royale statistics</title>
        <meta
          name="description"
          content={locale === "es" ? "Estadísticas en vivo de mazos y cartas de Clash Royale, agregadas desde registros de batalla observados." : "Live Clash Royale deck and card statistics, aggregated from real battle logs."}
        />
        <link rel="canonical" href="/meta" />
      </Head>
      <div className="profile-page">
        <ArenaRouteHero
          title={t("meta.title")}
          summary={
            <>
            {locale === "es" ? "La API de Clash Royale publica batallas jugador por jugador, pero no estadísticas agregadas. StatsConnect cuenta lo que se jugó y muestra siempre la muestra: " : "The Clash Royale API publishes battles one player at a time, but no aggregate statistics. StatsConnect counts what was actually played and always shows the sample: "}
            <strong>{formatNumber(Math.round(sample))}</strong> {locale === "es" ? "mazos observados" : "decks observed"} · {modeLabel(mode)} ·{" "}
            {windowDays === 1 ? (locale === "es" ? "24 horas" : "24 hours") : `${windowDays} ${locale === "es" ? "días" : "days"}`}.
            </>
          }
        />

        <div className="meta-controls">
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
                {item === 1 ? (locale === "es" ? "24 horas" : "24 hours") : `7 ${locale === "es" ? "días" : "days"}`}
              </button>
            ))}
          </div>
        </div>

        <TopDecks decks={decks?.decks} byId={byId} mode={mode} windowDays={windowDays} />
        <TopCards cards={cards?.cards} sample={sample} byId={byId} mode={mode} windowDays={windowDays} />
        <TopTowerTroops
          towerTroops={towerTroops?.towerTroops}
          sample={towerTroops?.decksObserved ?? 0}
          byId={byId}
          mode={mode}
          windowDays={windowDays}
        />
        <MetaAnalytics mode={mode} windowDays={windowDays} byId={byId} />
      </div>
    </Layout>
  );
}

// --- Shared bits ----------------------------------------------------------

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

/** Below 50% is a losing deck; the colour says so without a legend. */
function rateClass(value: number) {
  return value >= 0.5 ? "decks-done" : "decks-none";
}

/**
 * One card in a deck. An Evolution or Hero is its own artwork upstream, so a
 * variant slot renders that art rather than the base card — the ring and dot are
 * only needed when the card has no variant art to fall back on.
 */
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

function NotEnoughData({ mode, windowDays }: { mode: MetaMode; windowDays: number }) {
  const { locale, t } = useI18n();
  return (
    <p className="empty-results">
      {t("meta.notEnough")} {modeLabel(mode)} · {windowDays === 1 ? (locale === "es" ? "24 horas" : "24 hours") : `${windowDays} ${locale === "es" ? "días" : "days"}`}.
    </p>
  );
}

/**
 * Tower Troop tracking shipped after the rest of the meta report, and the
 * existing 30 days of aggregates were built without it — there is nothing to
 * backfill. So an empty table here is not "thin sample", it is "collection
 * only just started"; say that instead of reusing NotEnoughData's wording,
 * which would wrongly imply battles were happening but too few of them.
 */
function TowerTroopsStarting({ mode, windowDays }: { mode: MetaMode; windowDays: number }) {
  const { locale } = useI18n();
  return (
    <p className="empty-results">
      {locale === "es" ? "El seguimiento de Tropas de Torre acaba de empezar; no existe un historial que se pueda reconstruir. Vuelve cuando se acumulen más batallas." : "Tower Troop tracking just started; there is no history that can be backfilled. Check back as more battles accumulate."} {modeLabel(mode)} · {windowDays === 1 ? (locale === "es" ? "24 horas" : "24 hours") : `${windowDays} ${locale === "es" ? "días" : "days"}`}.
    </p>
  );
}

// --- Decks ----------------------------------------------------------------

function CopyDeckButton({ cardIds }: { cardIds: number[] }) {
  const { locale } = useI18n();
  const [copied, setCopied] = useState(false);
  const link = copyDeckLink(cardIds);
  if (!link) return null;

  return (
    <button
      type="button"
      className="meta-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard access can be blocked; the link below still works.
          window.open(link, "_blank", "noopener");
        }
      }}
    >
      <Copy size={14} />
      {copied ? (locale === "es" ? "Copiado" : "Copied") : (locale === "es" ? "Copiar" : "Copy")}
    </button>
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
    deckHash: string;
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
  const { formatNumber, locale, t } = useI18n();
  const [expandedDeckHash, setExpandedDeckHash] = useState<string | null>(null);

  if (!decks) {
    return (
      <section className="profile-section">
        <h2>{t("meta.topDecks")}</h2>
        <p className="empty-results">{t("meta.loading")}</p>
      </section>
    );
  }

  if (!decks.length) {
    return (
      <section className="profile-section">
        <div className="section-heading">
          <h2>{t("meta.topDecks")}</h2>
        </div>
        <NotEnoughData mode={mode} windowDays={windowDays} />
      </section>
    );
  }

  return (
    <TableShell
      title={t("meta.topDecks")}
      head={["#", locale === "es" ? "Mazo" : "Deck", "Elixir", locale === "es" ? "Partidas" : "Games", locale === "es" ? "% victoria" : "Win rate", locale === "es" ? "Uso" : "Usage", ""]}
      note={`${modeLabel(mode)}, last ${
        windowDays === 1 ? "24 hours" : `${windowDays} days`
      }. Ranked by how often the deck was played, not by how well it did — a deck has to be seen at least five times to appear.`}
    >
      {decks.map((deck) => {
        const evolved = new Set(deck.evolutionIds);
        const elixir = averageElixir(deck.cardIds.map((id) => ({ elixirCost: byId.get(id)?.elixir })));
        const expanded = expandedDeckHash === deck.deckHash;
        return [
          <tr key={deck._id}>
            <td>
              <RankCell rank={deck.rank} />
            </td>
            <td>
              <span className="beta-deck">
                {deck.cardIds.map((id, index) => (
                  <Link key={`${id}-${index}`} href={byId.get(id) ? `/cards/${cardSlug(byId.get(id)!.name)}` : "/cards"}>
                    <CardThumb id={id} card={byId.get(id)} evolved={evolved.has(id)} />
                  </Link>
                ))}
              </span>
            </td>
            <td>{elixir ? elixir.toFixed(1) : "—"}</td>
            <td>{formatNumber(deck.uses)}</td>
            <td className={rateClass(deck.winRate)}>{pct(deck.winRate)}</td>
            <td>{pct(deck.usageRate)}</td>
            <td>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  className="meta-copy"
                  aria-expanded={expanded}
                  onClick={() => setExpandedDeckHash(expanded ? null : deck.deckHash)}
                >
                  {expanded ? (locale === "es" ? "Ocultar" : "Hide") : (locale === "es" ? "Cruces" : "Matchups")}
                </button>
                <CopyDeckButton cardIds={deck.cardIds} />
              </span>
            </td>
          </tr>,
          expanded ? (
            <tr key={`${deck._id}-matchups`}>
              <td colSpan={7}>
                <DeckMatchupPanel deckHash={deck.deckHash} byId={byId} />
              </td>
            </tr>
          ) : null
        ];
      })}
    </TableShell>
  );
}

// --- Cards ----------------------------------------------------------------

function TopCards({
  cards,
  sample,
  byId,
  mode,
  windowDays
}: {
  cards?: Array<{ cardId: number; uses: number; winRate: number; usageRate: number }>;
  sample: number;
  byId: Map<number, Card>;
  mode: MetaMode;
  windowDays: number;
}) {
  const { formatNumber, locale, t } = useI18n();
  if (!cards?.length) {
    return (
      <section className="profile-section">
        <div className="section-heading">
          <h2>{t("meta.topCards")}</h2>
        </div>
        {cards ? <NotEnoughData mode={mode} windowDays={windowDays} /> : <p className="empty-results">{t("meta.loading")}</p>}
      </section>
    );
  }

  return (
    <TableShell
      title={t("meta.topCards")}
      head={["#", locale === "es" ? "Carta" : "Card", locale === "es" ? "Partidas" : "Games", locale === "es" ? "% victoria" : "Win rate", locale === "es" ? "Uso" : "Usage"]}
      note={`${t("meta.sourceNote")} ${formatNumber(Math.round(sample))} ${locale === "es" ? "mazos observados" : "decks observed"}.`}
    >
      {cards.map((row, index) => {
        const card = byId.get(row.cardId);
        return (
          <tr key={row.cardId}>
            <td>
              <RankCell rank={index + 1} />
            </td>
            <td>
              <EntityCell
                href={card ? `/cards/${cardSlug(card.name)}` : undefined}
                name={card?.name ?? `Card ${row.cardId}`}
                badge={card?.image ?? UNKNOWN_CARD_IMAGE}
                badgeFallback={UNKNOWN_CARD_IMAGE}
                sub={card ? `${card.rarity} · ${card.elixir} elixir` : "Not in the catalog"}
              />
            </td>
            <td>{formatNumber(row.uses)}</td>
            <td className={rateClass(row.winRate)}>{pct(row.winRate)}</td>
            <td>
              <span className="usage-bar" aria-hidden="true">
                <i style={{ width: `${Math.min(100, row.usageRate * 100)}%` }} />
              </span>
              {pct(row.usageRate)}
            </td>
          </tr>
        );
      })}
    </TableShell>
  );
}

// --- Tower Troops -----------------------------------------------------------

function TopTowerTroops({
  towerTroops,
  sample,
  byId,
  mode,
  windowDays
}: {
  towerTroops?: Array<{ towerCardId: number; uses: number; winRate: number; usageRate: number }>;
  sample: number;
  byId: Map<number, Card>;
  mode: MetaMode;
  windowDays: number;
}) {
  const { formatNumber, locale, t } = useI18n();
  if (!towerTroops?.length) {
    return (
      <section className="profile-section">
        <div className="section-heading">
          <h2>{locale === "es" ? "Mejores Tropas de Torre" : "Top Tower Troops"}</h2>
        </div>
        {towerTroops ? <TowerTroopsStarting mode={mode} windowDays={windowDays} /> : <p className="empty-results">{t("meta.loading")}</p>}
      </section>
    );
  }

  return (
    <TableShell
      title={locale === "es" ? "Mejores Tropas de Torre" : "Top Tower Troops"}
      head={["#", locale === "es" ? "Tropa de Torre" : "Tower Troop", locale === "es" ? "Partidas" : "Games", locale === "es" ? "% victoria" : "Win rate", locale === "es" ? "Uso" : "Usage"]}
      note={`${formatNumber(Math.round(sample))} ${locale === "es" ? "mazos observados con una Tropa de Torre registrada." : "observed decks with a recorded Tower Troop."}`}
    >
      {towerTroops.map((row, index) => {
        const card = byId.get(row.towerCardId);
        return (
          <tr key={row.towerCardId}>
            <td>
              <RankCell rank={index + 1} />
            </td>
            <td>
              <EntityCell
                href={card ? `/cards/${cardSlug(card.name)}` : undefined}
                name={card?.name ?? `Tower Troop ${row.towerCardId}`}
                badge={card?.image ?? UNKNOWN_CARD_IMAGE}
                badgeFallback={UNKNOWN_CARD_IMAGE}
                sub={card ? card.rarity : "Not in the catalog"}
              />
            </td>
            <td>{formatNumber(row.uses)}</td>
            <td className={rateClass(row.winRate)}>{pct(row.winRate)}</td>
            <td>
              <span className="usage-bar" aria-hidden="true">
                <i style={{ width: `${Math.min(100, row.usageRate * 100)}%` }} />
              </span>
              {pct(row.usageRate)}
            </td>
          </tr>
        );
      })}
    </TableShell>
  );
}
