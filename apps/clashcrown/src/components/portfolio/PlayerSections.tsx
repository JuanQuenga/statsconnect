import Image from "@/components/Image";
import Link from "@/components/Link";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { Crown, RefreshCcw, Shield, Swords, Trophy } from "lucide-react";
import { NO_CLAN_BADGE_IMAGE } from "@/lib/clash/assets";
import { analyzePlayerBattles } from "@/lib/clash/battles";
import { cardSlug } from "@/lib/clash/cards";
import { isConvexConfigured, profileHistoryQuery } from "@/lib/convex";
import { CardArt } from "@/components/portfolio/CardArt";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import { DeckActions } from "@/components/portfolio/DeckActions";
import { PlayerCardCollection } from "@/components/portfolio/PlayerCardCollection";
import { PlayerShareActions } from "@/components/portfolio/PlayerShareActions";
import { Badge } from "@/components/ui/badge";
import { Card as UiCard, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Battle, Card, Chest, PathOfLegendsResult, Player } from "@/lib/mock-data";
import type { ProfileHistoryPoint } from "@/lib/clash/types";
import { useI18n, type Locale, type MessageKey } from "@/lib/i18n";

const tabItems = [
  { label: "Statistics", message: "player.statistics", icon: "/images/icons/trophy.png" },
  { label: "Battles", message: "player.battles", icon: "/images/icons/sword.png" },
  { label: "Decks", message: "player.decks", icon: "/images/icons/cardsq.png" },
  { label: "Cards", message: "player.cards", icon: "/images/icons/book-cards.png" }
] satisfies Array<{ label: PlayerTab; message: MessageKey; icon: string }>;

export function PlayerHero({ player, actions }: { player: Player; actions?: ReactNode }) {
  const { formatNumber, locale, t } = useI18n();
  const wins = player.stats.Wins;
  const battles = player.stats.Battles ?? combinedStat(player.stats.Wins, player.stats.Losses, formatNumber);

  return (
    <section className="profile-hero">
      <div className="profile-hero-glow" aria-hidden="true" />
      <div className="profile-identity-art">
        <Image src={player.arenaImage} alt="" width={150} height={150} priority />
        {player.level !== undefined ? (
          <span className="profile-level-badge" aria-label={`${locale === "es" ? "Nivel" : "Level"} ${player.level}`}>
            <small>{locale === "es" ? "Nivel" : "Level"}</small>
            {player.level}
          </span>
        ) : null}
      </div>
      <div className="profile-identity-copy">
        <h1>{player.name}</h1>
        <div className="profile-identity-meta">
          <strong>#{player.tag}</strong>
          <span aria-hidden="true">•</span>
          {player.clanTag ? (
            <Link href={`/clans/${player.clanTag.replace(/^#/, "")}`}>
              <CardArt src={player.clanBadge ?? NO_CLAN_BADGE_IMAGE} alt="" width={24} height={28} fallback={NO_CLAN_BADGE_IMAGE} />
              {player.clan}
            </Link>
          ) : player.clan && player.clan !== "No clan" ? (
            <span className="profile-no-clan"><Shield size={14} /> {player.clan}</span>
          ) : (
            <span className="profile-no-clan"><Shield size={14} /> Independent player</span>
          )}
        </div>
        <div className="card-detail-meta hero-chips">
          <span className="status-chip">{player.arena}</span>
          {player.pathOfLegends?.current?.trophies !== undefined ? (
            <span className="status-chip">
              Path of Legends · {formatNumber(player.pathOfLegends.current.trophies)}
              {player.pathOfLegends.current.rank ? ` · #${formatNumber(player.pathOfLegends.current.rank)}` : ""}
            </span>
          ) : null}
          {player.clanTag ? <Link className="status-chip" href={`/clans/${player.clanTag.replace(/^#/, "")}/war`}>{t("clan.war")}</Link> : null}
        </div>
        <div className="profile-hero-actions">
          {actions}
          <PlayerShareActions player={player} compact />
        </div>
      </div>
      <div className="profile-hero-metrics" aria-label="Player highlights">
        <HeroMetric icon={<Trophy />} label="Trophies" value={player.trophies === undefined ? "—" : formatNumber(player.trophies)} />
        <HeroMetric icon={<Crown />} label="Personal best" value={player.bestTrophies === undefined ? "—" : formatNumber(player.bestTrophies)} />
        <HeroMetric icon={<Swords />} label="Wins" value={wins ?? "—"} />
        <HeroMetric icon={<Shield />} label="Battles" value={battles ?? "—"} />
      </div>
    </section>
  );
}

function HeroMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="profile-hero-metric"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function combinedStat(first: string | undefined, second: string | undefined, formatNumber: (value: number) => string) {
  if (!first || !second) return undefined;
  const firstValue = Number(first.replace(/[^\d.-]/g, ""));
  const secondValue = Number(second.replace(/[^\d.-]/g, ""));
  return Number.isFinite(firstValue) && Number.isFinite(secondValue) ? formatNumber(firstValue + secondValue) : undefined;
}

export type PlayerTab = "Statistics" | "Battles" | "Decks" | "Cards";

export function PlayerTabs({ active, onChange }: { active: PlayerTab; onChange: (tab: PlayerTab) => void }) {
  const { t } = useI18n();
  return (
    <nav className="profile-tabs" aria-label={t("player.sections")}>
      {tabItems.map((tab) => (
        <button key={tab.label} type="button" className={active === tab.label ? "active" : ""} aria-current={active === tab.label ? "page" : undefined} onClick={() => onChange(tab.label as PlayerTab)}>
          <Image src={tab.icon} alt="" width={28} height={28} />
          <span>{t(tab.message)}</span>
        </button>
      ))}
    </nav>
  );
}

export function PlayerStats({ player, onRefresh, isRefreshing }: { player: Player; onRefresh: () => void; isRefreshing: boolean }) {
  const { formatNumber, locale, t } = useI18n();
  const rows = [
    ...(player.bestTrophies !== undefined ? [[locale === "es" ? "Máximo de trofeos" : "Highest trophies", formatNumber(player.bestTrophies)]] : []),
    ...Object.entries(player.stats)
  ];

  return (
    <section className="profile-section">
      <div className="profile-section-heading">
        <h2>Career snapshot</h2>
        <div className="update-tools"><span>{updatedLabel(player.fetchedAt, locale)}</span><button type="button" onClick={onRefresh} disabled={isRefreshing}><RefreshCcw className={isRefreshing ? "spin" : ""} size={16} />{isRefreshing ? t("common.refreshing") : t("common.refresh")}</button></div>
      </div>
      {rows.length ? (
        <div className="stat-matrix">
          {rows.map(([label, value]) => (
            <div key={label} className="stat-cell">
              <span className="stat-cell-icon"><Image src={statIcon(label, player.arenaImage)} alt="" width={32} height={32} /></span>
              <div>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="empty-results">The API did not report player statistics for this profile.</p>}
    </section>
  );
}

export function PerformanceSection({ battles }: { battles: Battle[] }) {
  const { locale } = useI18n();
  const performance = analyzePlayerBattles(battles);
  if (!performance.games) return <EmptyPanel title={locale === "es" ? "Sin rendimiento de batallas" : "No battle performance yet"} copy={locale === "es" ? "El rendimiento aparecerá cuando el registro de este jugador tenga resultados." : "Performance will appear when this player's battle log has a result."} />;

  return (
    <section className="profile-section performance-section">
      <div className="section-heading">
        <span className="filter-button static">Last {performance.games} battles</span>
        <h2>Performance</h2>
        <span />
      </div>
      <div className="stat-matrix performance-stats">
        <PerformanceStat
          icon="/images/icons/sword.png"
          value={performance.draws ? `${performance.wins}–${performance.losses}–${performance.draws}` : `${performance.wins}–${performance.losses}`}
          label={performance.draws ? "W / L / D record" : "W / L record"}
        />
        <PerformanceStat icon="/images/icons/trophy.png" value={`${performance.winRate.toFixed(1)}%`} label="Win rate" />
        <PerformanceStat icon="/images/icons/crown-gold.png" value={`${performance.threeCrownRate.toFixed(1)}%`} label={`${performance.threeCrownWins} three-crown wins`} />
        <PerformanceStat icon="/images/icons/sword.png" value={`${performance.currentWinStreak} / ${performance.bestWinStreak}`} label="Current / best streak" />
      </div>
      <div className="performance-grid">
        <div className="performance-card">
          <h3>Win rate by mode</h3>
          <div className="members-table-wrap">
            <table className="members-table">
              <thead><tr><th>Mode</th><th>Record</th><th>Win rate</th></tr></thead>
              <tbody>
                {performance.modes.map((mode) => (
                  <tr key={mode.mode}>
                    <td>{mode.mode}</td>
                    <td>{mode.wins}–{mode.losses}</td>
                    <td>{mode.winRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="performance-card recent-form-card">
          <h3>Recent form</h3>
          <div className="form-pips" role="list" aria-label={`Last ${performance.recent.length} battles, newest first`}>
            {performance.recent.map((battle, index) => (
              <span
                key={`${battle.date}-${battle.opponent}-${index}`}
                className={`form-pip ${battle.result.toLowerCase()}`}
                role="listitem"
                title={`${battle.result} · ${battle.mode}`}
                aria-label={`${battle.result}, ${battle.mode}`}
              >
                {battle.result === "Win" ? "W" : battle.result === "Draw" ? "D" : "L"}
              </span>
            ))}
          </div>
          <div className="form-legend"><span><i className="form-pip win">W</i> Win</span><span><i className="form-pip loss">L</i> Loss</span><span><i className="form-pip draw">D</i> Draw</span></div>
          <p className="table-note">Newest first · {performance.recent.length} of {performance.games} battles shown</p>
        </div>
      </div>
      <p className="table-note">All figures are calculated from this player's last {performance.games} battles, so small samples can swing quickly.</p>
      <PerformanceStyles />
    </section>
  );
}

function PerformanceStat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="stat-cell">
      <Image src={icon} alt="" width={46} height={46} />
      <div><strong>{value}</strong><span>{label}</span></div>
    </div>
  );
}

function PerformanceStyles() {
  return (
    <style>{`
      .performance-stats { margin-bottom: 34px; }
      .performance-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(260px, .85fr); gap: 28px; }
      .performance-card { min-width: 0; padding: 18px; border: 1px solid rgba(62, 88, 128, .2); border-radius: 7px; background: rgba(8, 24, 44, .52); }
      .performance-card h3 { margin: 0 0 16px; color: #dfe8f8; font-size: 14px; }
      .performance-card .members-table-wrap { margin: 0 -18px -18px; }
      .performance-card .members-table td { height: 52px; }
      .recent-form-card { display: flex; flex-direction: column; justify-content: center; }
      .form-pips { display: flex; gap: 7px; flex-wrap: wrap; }
      .form-pip { width: 28px; height: 28px; display: inline-grid; place-items: center; border-radius: 50%; color: white; font: 700 11px var(--font-ui); font-style: normal; }
      .form-pip.win { background: #218b61; box-shadow: 0 0 0 1px rgba(83, 220, 151, .3) inset; }
      .form-pip.loss { background: #a63c5b; box-shadow: 0 0 0 1px rgba(255, 126, 153, .3) inset; }
      .form-pip.draw { background: #4a5a78; box-shadow: 0 0 0 1px rgba(142, 162, 196, .3) inset; }
      .form-legend { display: flex; gap: 16px; margin-top: 18px; color: #8ea2c4; font: 11px var(--font-ui); }
      .form-legend span { display: inline-flex; align-items: center; gap: 6px; }
      .form-legend .form-pip { width: 18px; height: 18px; font-size: 9px; }
      @media (max-width: 680px) {
        .performance-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}

function statIcon(label: string, arenaImage: string) {
  if (label === "Arena") return arenaImage;
  if (label.includes("card")) return "/images/icons/cardsq.png";
  if (label.includes("3 crown")) return "/images/icons/crown-gold.png";
  if (label.includes("donation")) return "/images/icons/crown-2d.png";
  if (label.includes("win") || label === "Losses" || label === "Battles") return "/images/icons/sword.png";
  return "/images/icons/trophy.png";
}

/**
 * This season, last season, and this player's personal best — the only three
 * Path of Legends snapshots Supercell exposes. Not a season history, so the
 * copy here never implies one. Absent entirely (see `mapPathOfLegends`) for a
 * player who has never queued Path of Legends.
 */
export function PathOfLegendsSeasons({ player }: { player: Player }) {
  const { formatNumber, locale } = useI18n();
  const seasons = player.pathOfLegends;
  if (!seasons) return null;

  const rows: Array<{ label: string; result?: PathOfLegendsResult }> = [
    { label: locale === "es" ? "Esta temporada" : "This season", result: seasons.current },
    { label: locale === "es" ? "Temporada anterior" : "Last season", result: seasons.last },
    { label: locale === "es" ? "Mejor marca" : "Personal best", result: seasons.best }
  ];

  return (
    <section className="profile-section">
      <div className="section-heading compact-heading">
        <span className="filter-button static">Path of Legends</span>
        <h2>{locale === "es" ? "Comparación de temporadas" : "Season Comparison"}</h2>
        <span />
      </div>
      <div className="pol-columns">
        {rows.map(({ label, result }) => (
          <div key={label} className="pol-card">
            <span className="pol-label">{label}</span>
            <strong>{result?.trophies !== undefined ? formatNumber(result.trophies) : "—"}</strong>
            <span>{result?.rank ? `#${formatNumber(result.rank)}` : (locale === "es" ? "Sin clasificación" : "Unranked")}</span>
          </div>
        ))}
      </div>
      <p className="table-note">
        These are the only three Path of Legends snapshots the API returns — not a full season history.
      </p>
    </section>
  );
}

export function DeckOverview({ cards, supportCards = [] }: { cards: Card[]; supportCards?: Card[] }) {
  const { locale, t } = useI18n();
  if (!cards.length) return <EmptyPanel title={t("player.noDeck")} copy={t("player.noDeckCopy")} />;
  const average = cards.reduce((sum, card) => sum + card.elixir, 0) / cards.length;
  const cycle = [...cards].map((card) => card.elixir).filter((cost) => cost > 0).sort((a, b) => a - b).slice(0, 4).reduce((total, cost) => total + cost, 0);
  return (
    <section className="profile-section deck-overview">
      <div className="profile-section-heading current-deck-heading">
        <div>
          <h2>{locale === "es" ? "Mazo actual" : "Current deck"}</h2>
          <p className="deck-cost-summary">{average.toFixed(1)} elixir · {cycle} {locale === "es" ? "de ciclo" : "cycle"}</p>
        </div>
        <DeckActions cards={cards} label="current deck" compact />
      </div>
      <div className="current-deck-cluster" aria-label="Current eight-card deck">
        {cards.map((card, index) => <DeckCardLink key={`${card.name}-${index}`} card={card} />)}
      </div>
      {supportCards.length ? (
        <div className="current-deck-support">
          <h3>Tower Troop</h3>
          <div className="current-deck-support-cards">
            {supportCards.map((card, index) => <DeckCardLink key={`${card.name}-${index}`} card={card} />)}
          </div>
        </div>
      ) : null}
      <CurrentDeckStyles />
    </section>
  );
}

function DeckCardLink({ card }: { card: Card }) {
  const label = card.variant ? `${card.name} (${card.variant})` : card.name;
  return <Link href={`/cards/${cardSlug(card.name)}`} className="current-deck-card" title={label}><GameCardArt card={card} size="deck" /></Link>;
}

function CurrentDeckStyles() {
  return <style>{`
    .current-deck-heading > div:first-child { display: grid; gap: 5px; }
    .deck-cost-summary { margin: 0; color: var(--muted-foreground); font: 11px var(--font-ui); }
    .current-deck-heading > [aria-label] { flex: none; }
    .current-deck-cluster { width: min(100%, 760px); display: grid; grid-template-columns: repeat(4, minmax(0, 168px)); justify-content: center; gap: 14px; margin: 8px auto 0; padding: 24px; border: 1px solid var(--border); border-radius: 18px; background: radial-gradient(circle at 50% 25%, rgba(59, 111, 180, .2), transparent 68%), color-mix(in srgb, var(--secondary) 36%, transparent); }
    .current-deck-card { min-width: 0; display: grid; place-items: center; border-radius: 13px; transition: background .18s ease, transform .18s ease; }
    .current-deck-card:hover { background: rgba(217, 107, 243, .08); transform: translateY(-3px); }
    .current-deck-support { display: flex; align-items: center; justify-content: center; gap: 20px; margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--border); }
    .current-deck-support h3 { margin: 4px 0 0; font-size: 16px; }
    .current-deck-support-cards { display: flex; gap: 8px; }
    .current-deck-support-cards .current-deck-card { width: 112px; }
    .current-deck-support-cards .game-card-art { width: 112px; --game-card-cost-size: 26px; --game-card-cost-font: 16px; --game-card-level-font: 13px; }
    @media (max-width: 680px) {
      .current-deck-heading { align-items: flex-start; }
      .current-deck-heading > [aria-label] { width: 100%; }
      .current-deck-cluster { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px; padding: 12px 8px; }
      .current-deck-card .game-card-art { width: 100%; }
      .current-deck-support { align-items: flex-start; }
    }
  `}</style>;
}

export function DeckAnalyticsSection({ battles }: { battles: Battle[] }) {
  const decks = analyzePlayerBattles(battles).decks;
  if (!decks.length) return <EmptyPanel title="No complete decks in this log" copy="The API has not returned enough eight-card battles to compare this player's decks yet." />;

  return (
    <section className="profile-section deck-analytics-section">
      <div className="profile-section-heading deck-analytics-heading">
        <div>
          <h2>Recent deck rotation</h2>
          <p>Each lineup groups battles played with the same eight-card deck. {decks.length} lineups found.</p>
        </div>
      </div>
      <div className="personal-deck-grid">
        {decks.map((deck, index) => (
          <UiCard className="personal-deck-card" key={deck.key}>
            <CardHeader className="personal-deck-header">
              <div>
                <span className="personal-deck-index">#{index + 1}</span>
                <CardTitle>{index === 0 ? "Most played lineup" : `Deck ${index + 1}`}</CardTitle>
              </div>
              <Badge variant="outline">{deck.uses} {deck.uses === 1 ? "battle" : "battles"}</Badge>
            </CardHeader>
            <CardContent className="personal-deck-content">
              <div className="personal-deck-cards" aria-label={`Cards in deck ${index + 1}`}>
                {deck.cards.map((card, cardIndex) => <DeckThumbnail key={`${card.name}-${cardIndex}`} card={card} />)}
              </div>
              <div className="personal-deck-metrics">
                <DeckMetric label="Win rate" value={`${deck.winRate.toFixed(1)}%`} emphasis={winRateTone(deck.winRate)} note={`${deck.wins}–${deck.uses - deck.wins} record`} />
                <DeckMetric label="Average crowns" value={deck.averageCrowns.toFixed(2)} note="per battle" />
                <DeckMetric label="Usage" value={`${Math.round((deck.uses / battles.length) * 100)}%`} note={`${deck.uses} of ${battles.length} battles`} />
              </div>
              <div className="personal-deck-modes" aria-label="Modes played">
                {deck.modes.map((mode) => <Badge variant="secondary" key={mode}>{battleModeLabel(mode)}</Badge>)}
              </div>
            </CardContent>
            <CardFooter className="personal-deck-footer">
              <DeckActions cards={deck.cards} label={`deck ${index + 1}`} compact />
            </CardFooter>
          </UiCard>
        ))}
      </div>
      <p className="table-note">Sorted by usage across the last {battles.length} battles. Evolution and Hero slots are treated as distinct lineups.</p>
      <DeckAnalyticsStyles />
    </section>
  );
}

function DeckMetric({ label, value, note, emphasis = "" }: { label: string; value: string; note: string; emphasis?: string }) {
  return <div className="personal-deck-metric"><small>{label}</small><strong className={emphasis}>{value}</strong><span>{note}</span></div>;
}

function winRateTone(winRate: number) {
  if (winRate >= 60) return "positive";
  if (winRate < 45) return "negative";
  return "";
}

const BATTLE_MODE_LABELS: Record<string, string> = {
  Ranked1v1_NewArena: "Ranked 1v1",
  Ranked1v1: "Ranked 1v1",
  Friendly: "Friendly battle",
  clanWarCollectionDay: "Clan War collection",
  clanWarWarDay: "Clan War battle",
};

function battleModeLabel(mode: string) {
  return BATTLE_MODE_LABELS[mode] ?? mode
    .replaceAll("_", " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/\bNew Arena\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function DeckThumbnail({ card }: { card: Card }) {
  const label = card.variant ? `${card.name} (${card.variant})` : card.name;
  return <CardArt src={card.image} alt={label} width={64} height={80} />;
}

function DeckAnalyticsStyles() {
  return (
    <style>{`
      .deck-analytics-heading { align-items: end; }
      .deck-analytics-heading p { max-width: 620px; margin: 2px 0 0; color: var(--muted-foreground); font: 12px/1.5 var(--font-ui); }
      .personal-deck-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .personal-deck-card { min-width: 0; gap: 0; padding: 0; border-radius: 16px; background: color-mix(in srgb, var(--card) 94%, #142a47); box-shadow: none; transition: border-color .18s ease, transform .18s ease; }
      .personal-deck-card:hover { border-color: color-mix(in srgb, var(--primary) 38%, var(--border)); transform: translateY(-2px); }
      .personal-deck-header { min-height: 66px; grid-template-columns: minmax(0, 1fr) auto; align-items: center; padding-block: 14px; border-bottom: 1px solid var(--border); }
      .personal-deck-header > div { min-width: 0; display: flex; align-items: center; gap: 10px; }
      .personal-deck-header [data-slot="card-title"] { overflow: hidden; font: 700 14px/1.2 var(--font-ui); text-overflow: ellipsis; white-space: nowrap; }
      .personal-deck-index { width: 28px; height: 28px; display: grid; flex: none; place-items: center; border-radius: 9px; color: var(--primary); background: rgba(217, 107, 243, .1); font: 800 10px var(--font-ui); }
      .personal-deck-header [data-slot="badge"] { height: 26px; border-color: var(--border); color: var(--muted-foreground); background: var(--secondary); }
      .personal-deck-content { display: grid; gap: 16px; padding-block: 18px; }
      .personal-deck-cards { width: min(100%, 408px); display: grid; grid-template-columns: repeat(4, minmax(0, 96px)); justify-content: center; gap: 8px; align-items: center; margin-inline: auto; }
      .personal-deck-cards img { width: 100%; height: 118px; object-fit: contain; margin: 0; filter: drop-shadow(0 9px 11px rgba(0, 0, 0, .32)); }
      .personal-deck-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-block: 1px solid var(--border); }
      .personal-deck-metric { min-width: 0; display: grid; align-content: center; gap: 3px; padding: 13px 10px; }
      .personal-deck-metric + .personal-deck-metric { border-left: 1px solid var(--border); }
      .personal-deck-metric small, .personal-deck-metric span { overflow: hidden; color: var(--muted-foreground); font: 9px/1.25 var(--font-ui); text-overflow: ellipsis; white-space: nowrap; }
      .personal-deck-metric strong { color: var(--foreground); font: 750 20px/1.1 var(--font-ui); }
      .personal-deck-metric strong.positive { color: #63d99b; }
      .personal-deck-metric strong.negative { color: #ff7e99; }
      .personal-deck-modes { min-height: 26px; display: flex; flex-wrap: wrap; gap: 6px; }
      .personal-deck-modes [data-slot="badge"] { max-width: 100%; overflow: hidden; color: #c4d1e5; text-overflow: ellipsis; }
      .personal-deck-footer { min-height: 54px; justify-content: flex-end; padding-block: 10px; background: color-mix(in srgb, var(--secondary) 24%, transparent); }
      .personal-deck-footer > div { width: 100%; }
      @media (max-width: 980px) {
        .personal-deck-grid { grid-template-columns: 1fr; }
        .personal-deck-cards { width: min(100%, 472px); grid-template-columns: repeat(4, minmax(0, 112px)); }
        .personal-deck-cards img { height: 138px; }
      }
      @media (max-width: 680px) {
        .deck-analytics-heading h2 { max-width: 100%; font-size: clamp(23px, 7vw, 28px); line-height: 1.05; text-wrap: balance; }
        .personal-deck-grid { gap: 10px; }
        .personal-deck-card { border-radius: 14px; }
        .personal-deck-header { padding-inline: 12px; }
        .personal-deck-cards { width: 100%; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px; }
        .personal-deck-cards img { height: 88px; }
        .personal-deck-metric { padding-inline: 8px; }
        .personal-deck-metric strong { font-size: 17px; }
        .personal-deck-metric span { display: none; }
      }
    `}</style>
  );
}

export function CardCollection({
  player,
  catalogCards,
  catalogLoading,
  catalogError
}: {
  player: Player;
  catalogCards?: Card[];
  catalogLoading?: boolean;
  catalogError?: boolean;
}) {
  return <PlayerCardCollection player={player} catalogCards={catalogCards} catalogLoading={catalogLoading} catalogError={catalogError} />;
}

function CollectionCard({ card }: { card: Card }) {
  return (
    <Link href={`/cards/${cardSlug(card.name)}`} className="collection-card">
      {card.variant ? <span className="evo-flag">{card.variant === "Hero" ? "HERO" : "EVO"}</span> : null}
      {card.level ? <i className="card-level">{card.level}{card.maxLevel ? `/${card.maxLevel}` : ""}</i> : null}
      <CardArt src={card.image} alt={card.name} width={82} height={100} />
      <strong>{card.name}</strong>
      <span>{card.rarity} · {card.elixir || "?"} elixir</span>
    </Link>
  );
}

function EmptyPanel({ title, copy }: { title: string; copy: string }) {
  return <section className="profile-section empty-panel"><h2>{title}</h2><p>{copy}</p></section>;
}

function updatedLabel(fetchedAt: number | undefined, locale: Locale) {
  if (!fetchedAt) return locale === "es" ? "datos de demostración" : "demo data";
  const minutes = Math.max(0, Math.floor((Date.now() - fetchedAt) / 60_000));
  if (locale === "es") return minutes < 1 ? "actualizado ahora" : `actualizado hace ${minutes} min`;
  return minutes < 1 ? "updated just now" : `updated ${minutes}m ago`;
}

/** A single real snapshot is still more trustworthy than an inferred battle curve. */
const MIN_OBSERVED_POINTS = 1;

/**
 * Trophy chart for the Statistics tab. Prefers the real, visit-triggered
 * snapshots Convex has recorded for this player (`convex/cache.ts`'s
 * `history` query) and only falls back to a battle-derived guess when there
 * are no observed snapshots yet.
 *
 * `useQuery` needs the Convex provider `_app.tsx` only mounts when
 * `isConvexConfigured` (same constraint as `useCardCatalog.ts`), so the
 * branch that calls it is a separate component chosen here rather than a
 * conditional hook call.
 */
export function ProgressionChart({ player }: { player: Player }) {
  if (isConvexConfigured) return <ProgressionChartWithHistory player={player} />;
  return <InferredProgressionChart player={player} />;
}

function ProgressionChartWithHistory({ player }: { player: Player }) {
  const history = useQuery(profileHistoryQuery, { kind: "player", tag: player.tag });
  if (history && history.length >= MIN_OBSERVED_POINTS) return <ObservedProgressionChart history={history} />;
  return <InferredProgressionChart player={player} />;
}

function formatSnapshotDate(recordedAt: number, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(recordedAt));
}

function formatObservationWindow(spanMs: number, locale: Locale) {
  const days = spanMs / 86_400_000;
  if (days < 1) return locale === "es" ? "menos de un día" : "under a day";
  const rounded = Math.round(days);
  if (locale === "es") return `${rounded} día${rounded === 1 ? "" : "s"}`;
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

/**
 * Plots the real snapshots Convex recorded for this profile. Each one was
 * taken the moment somebody viewed it and the trophy count had moved since
 * the last view, so the gaps between points are however long it took for
 * someone to look again — irregular and not meaningful. The line is a compact
 * trend guide between observed points, not a claim of continuous tracking.
 */
function ObservedProgressionChart({ history }: { history: ProfileHistoryPoint[] }) {
  const { formatNumber, locale } = useI18n();
  const values = history.map((point) => point.value);
  const times = history.map((point) => point.recordedAt);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1, maximum - minimum);
  const earliest = Math.min(...times);
  const mostRecent = Math.max(...times);
  const timeRange = Math.max(1, mostRecent - earliest);

  const coordinates = history.map((point) => ({
    x: history.length === 1 ? 470 : 22 + ((point.recordedAt - earliest) / timeRange) * 898,
    y: 210 - ((point.value - minimum) / range) * 170,
    value: point.value
  }));
  const linePath = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const latest = coordinates.at(-1) ?? { x: 470, y: 125, value: values.at(-1) ?? 0 };

  return (
    <section className="profile-section chart-section">
      <div className="section-heading">
        <FilterButton label="Observed" />
        <h2>Trophy Activity</h2>
        <span className="chart-range">
          {history.length} {locale === "es" ? "instantáneas" : "snapshots"} · {formatObservationWindow(mostRecent - earliest, locale)}
        </span>
      </div>
      <div className="line-chart">
        <div className="y-axis">
          <Image src="/images/icons/trophy.png" alt="" width={24} height={24} />
          <span>{formatNumber(maximum)}</span><span>{formatNumber(Math.round((maximum + minimum) / 2))}</span><span>{formatNumber(minimum)}</span>
        </div>
        <svg viewBox="0 0 930 250" aria-label="Observed trophy snapshots trend">
          {Array.from({ length: 10 }).map((_, index) => (
            <line key={index} x1={70 + index * 86} x2={70 + index * 86} y1="18" y2="205" className="grid-line" />
          ))}
          {linePath ? <path d={linePath} /> : null}
          {coordinates.slice(0, -1).map((point, index) => (
            <circle key={index} cx={point.x} cy={point.y} r="5" className="chart-dot" />
          ))}
          <circle cx={latest.x} cy={latest.y} r="8" />
          <foreignObject x={Math.max(0, Math.min(820, latest.x - 50))} y={Math.max(0, latest.y - 58)} width="110" height="42">
            <div className="chart-popover"><Image src="/images/icons/trophy.png" alt="" width={21} height={21} />{latest.value}</div>
          </foreignObject>
        </svg>
        <div className="x-axis">
          <span>{formatSnapshotDate(earliest, locale)}</span>
          <span>{formatSnapshotDate(mostRecent, locale)}</span>
        </div>
      </div>
      <p className="table-note">
        Each dot is a snapshot recorded when someone viewed this profile and the trophy count had changed since
        the last view — not continuous tracking, so the gaps between points don&apos;t show when a rise or fall
        actually happened.
      </p>
    </section>
  );
}

/**
 * Fallback curve, walking the last 10 battles' `trophyChange` deltas
 * backwards from the current trophy count. This is a guess, not observed
 * history, and the note under the chart says so.
 */
function InferredProgressionChart({ player }: { player: Player }) {
  const { formatNumber } = useI18n();
  if (player.trophies === undefined) {
    return <EmptyPanel title="No trophy activity available" copy="The API did not report a current trophy count for this player." />;
  }
  const recentBattles = player.battles.filter((battle) => battle.trophyChange !== undefined).slice(0, 10).reverse();
  const startingTrophies = player.trophies - recentBattles.reduce((total, battle) => total + (battle.trophyChange ?? 0), 0);
  const values = recentBattles.reduce<number[]>((points, battle) => {
    points.push((points.at(-1) ?? startingTrophies) + (battle.trophyChange ?? 0));
    return points;
  }, [startingTrophies]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1, maximum - minimum);
  const coordinates = values.map((value, index) => ({
    x: values.length === 1 ? 470 : 22 + (index / (values.length - 1)) * 898,
    y: 210 - ((value - minimum) / range) * 170,
    value
  }));
  const linePath = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coordinates.at(-1)?.x ?? 920} 228 L${coordinates[0]?.x ?? 22} 228 Z`;
  const latest = coordinates.at(-1) ?? { x: 470, y: 125, value: player.trophies };
  const labels = ["Start", ...recentBattles.map((battle) => battle.date)];

  return (
    <section className="profile-section chart-section">
      <div className="section-heading">
        <FilterButton label="Inferred" />
        <h2>Trophy Activity</h2>
        <span className="chart-range">Last {recentBattles.length} battles</span>
      </div>
      <div className="line-chart">
        <div className="y-axis">
          <Image src="/images/icons/trophy.png" alt="" width={24} height={24} />
          <span>{formatNumber(maximum)}</span><span>{formatNumber(Math.round((maximum + minimum) / 2))}</span><span>{formatNumber(minimum)}</span>
        </div>
        <svg viewBox="0 0 930 250" aria-label="Recent trophy activity line chart">
          <defs>
            <linearGradient id="chart-fill-trophies" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1b8cff" stopOpacity=".36" />
              <stop offset="100%" stopColor="#1b8cff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {Array.from({ length: 10 }).map((_, index) => (
            <line key={index} x1={70 + index * 86} x2={70 + index * 86} y1="18" y2="205" className="grid-line" />
          ))}
          <path className="chart-fill" d={areaPath} fill="url(#chart-fill-trophies)" />
          <path d={linePath} />
          <circle cx={latest.x} cy={latest.y} r="8" />
          <foreignObject x={Math.max(0, Math.min(820, latest.x - 50))} y={Math.max(0, latest.y - 58)} width="110" height="42">
            <div className="chart-popover"><Image src="/images/icons/trophy.png" alt="" width={21} height={21} />{latest.value}</div>
          </foreignObject>
        </svg>
        {/* Ten ladder battles are usually one sitting, so every tick carried the
            same date. Print a date only when it changes; the rest stay blank. */}
        <div className="x-axis">
          {labels.map((date, index) => {
            const short = index === 0 ? date : date.replace(/, \d{4}$/, "");
            const repeat = index > 1 && short === labels[index - 1].replace(/, \d{4}$/, "");
            return <span key={`${date}-${index}`}>{repeat ? "" : short}</span>;
          })}
        </div>
      </div>
      <p className="table-note">
        Inferred from this player&apos;s last {recentBattles.length} battles&apos; trophy changes — not observed
        history.
      </p>
    </section>
  );
}

export function ChestList({ chests }: { chests: Chest[] }) {
  const { t } = useI18n();
  if (!chests.length) return null;
  return (
    <section className="profile-section chest-footer">
      {/* "My Chests" on someone else's profile read as the viewer's own. */}
      <div className="profile-section-heading"><h2>{t("player.upcomingChests")}</h2></div>
      <div className="chest-row">
        {chests.map((chest, index) => (
          <div key={`${chest.name}-${index}`} className="chest-item" title={chest.name}>
            <Image src={chest.image} alt={chest.name} width={58} height={58} />
            <strong>+{chest.index}</strong>
          </div>
        ))}
      </div>
      <p className="chest-note">{t("player.chestExplanation")}</p>
    </section>
  );
}

function FilterButton({ label = "Trophies" }: { label?: string } = {}) {
  return (
    <span className="filter-button static">{label}</span>
  );
}
