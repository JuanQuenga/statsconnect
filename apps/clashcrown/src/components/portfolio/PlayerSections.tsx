import Image from "@/components/Image";
import Link from "@/components/Link";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { Crown, RefreshCcw, Shield, Trophy } from "lucide-react";
import { leagueImage, NO_CLAN_BADGE_IMAGE } from "@/lib/clash/assets";
import { analyzePlayerBattles } from "@/lib/clash/battles";
import { cardSlug } from "@/lib/clash/cards";
import { isConvexConfigured, profileHistoryQuery } from "@/lib/convex";
import { CardArt } from "@/components/portfolio/CardArt";
import { ArenaHeroFrame } from "@/components/portfolio/ArenaRouteHero";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import { DeckActions, deckLinkForCards } from "@/components/portfolio/DeckActions";
import { DeckCardGrid } from "@/components/portfolio/DeckCardGrid";
import { PlayerCardCollection } from "@/components/portfolio/PlayerCardCollection";
import { PlayerShareActions } from "@/components/portfolio/PlayerShareActions";
import { TrophyActivityChart } from "@/components/portfolio/TrophyActivityChart";
import { Badge } from "@/components/ui/badge";
import { Card as UiCard, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Battle, Card, Chest, PathOfLegendsResult, Player } from "@/lib/clash/domain";
import type { ProfileHistoryPoint } from "@/lib/clash/types";
import { useI18n, type Locale, type MessageKey } from "@/lib/i18n";

const tabItems = [
  { label: "Statistics", message: "player.statistics", icon: "/images/ui-icons/trophies.png" },
  { label: "Battles", message: "player.battles", icon: "/images/icons/sword.png" },
  { label: "Decks", message: "player.decks", icon: "/images/icons/cardsq.png" },
  { label: "Cards", message: "player.cards", icon: "/images/icons/book-cards.png" },
  { label: "Chests", message: "player.upcomingChests", icon: "/images/chests/goldenchest.png" }
] satisfies Array<{ label: PlayerTab; message: MessageKey; icon: string }>;

export function PlayerHero({ player, actions }: { player: Player; actions?: ReactNode }) {
  const { formatNumber, locale } = useI18n();
  const currentLeague = player.pathOfLegends?.current;
  const recentBattles = player.battles.slice(0, 10);
  const performance = analyzePlayerBattles(recentBattles);
  const deck = player.deck.slice(0, 8);
  const averageElixir = deck.length
    ? deck.reduce((total, card) => total + card.elixir, 0) / deck.length
    : undefined;
  const deckHasActions = deckLinkForCards(deck) !== undefined;
  const leagueLabel = currentLeague?.leagueNumber === undefined
    ? locale === "es" ? "Clasificatoria" : "Ranked"
    : `${locale === "es" ? "Liga" : "League"} ${currentLeague.leagueNumber}`;
  const clanLabel = player.clan && player.clan !== "No clan"
    ? player.clan
    : locale === "es" ? "Sin clan" : "No clan";

  return (
    <ArenaHeroFrame className="profile-hero">
      <div className="profile-hero-glow" aria-hidden="true" />
      <div className="profile-hero-proposal">
        <header className="profile-hero-identity">
          <div className="profile-hero-nameplate">
            <h1>{player.name}</h1>
            <p>
              <strong>#{player.tag}</strong>
              <span aria-hidden="true">·</span>
              {player.clanTag ? (
                <Link href={`/clans/${player.clanTag.replace(/^#/, "")}`}>
                  <CardArt src={player.clanBadge ?? NO_CLAN_BADGE_IMAGE} alt="" width={20} height={22} fallback={NO_CLAN_BADGE_IMAGE} />
                  {clanLabel}
                </Link>
              ) : <span><Shield size={13} /> {clanLabel}</span>}
            </p>
          </div>
          <div className="profile-hero-freshness">
            {player.level !== undefined ? <strong>{locale === "es" ? "Rey" : "King"} {player.level}</strong> : null}
            <span>{updatedLabel(player.fetchedAt, locale)}</span>
          </div>
        </header>

        <section className="profile-competitive-status" aria-label={locale === "es" ? "Estado competitivo" : "Competitive status"}>
          <div className="profile-ranked-lead">
            {currentLeague ? <Image src={leagueImage(currentLeague.leagueNumber)} alt="" width={78} height={78} priority /> : <Trophy aria-hidden="true" />}
            <div>
              <small>{currentLeague ? "Path of Legends" : "Trophy Road"}</small>
              <strong>{currentLeague ? leagueLabel : player.arena}</strong>
              {currentLeague?.trophies !== undefined ? (
                <span>
                  {formatNumber(currentLeague.trophies)}
                  {currentLeague.rank ? ` · #${formatNumber(currentLeague.rank)}` : ""}
                </span>
              ) : <span>{locale === "es" ? "Sin posición clasificatoria registrada" : "No Ranked standing recorded"}</span>}
            </div>
          </div>
          <div className="profile-trophy-road">
            <HeroMetric icon={<Trophy />} label="Trophy Road" value={player.trophies === undefined ? "—" : formatNumber(player.trophies)} />
            <HeroMetric icon={<Crown />} label={locale === "es" ? "Mejor marca" : "Personal best"} value={player.bestTrophies === undefined ? "—" : formatNumber(player.bestTrophies)} />
            <div className="profile-arena-context">
              <Image src={player.arenaImage} alt="" width={48} height={48} priority />
              <span><small>{locale === "es" ? "Arena actual" : "Current arena"}</small><strong>{player.arena}</strong></span>
            </div>
          </div>
        </section>

        <section className="profile-recent-form" aria-label={locale === "es" ? "Forma reciente" : "Recent form"}>
          <header>
            <div><small>{locale === "es" ? "Forma reciente" : "Recent form"}</small><strong>{performance.games ? `${performance.wins}–${performance.losses}${performance.draws ? `–${performance.draws}` : ""}` : "—"}</strong></div>
            <div><small>{locale === "es" ? "Victorias" : "Win rate"}</small><strong>{performance.games ? `${performance.winRate.toFixed(0)}%` : "—"}</strong></div>
            <div><small>{locale === "es" ? "Racha" : "Streak"}</small><strong>{resultStreak(recentBattles)}</strong></div>
          </header>
          {performance.recent.length ? (
            <div className="profile-form-pips" role="list" aria-label={`${locale === "es" ? "Últimas" : "Last"} ${performance.recent.length} ${locale === "es" ? "batallas registradas" : "recorded battles"}`}>
              {performance.recent.map((battle, index) => (
                <span key={`${battle.date}-${battle.opponent}-${index}`} className={battle.result.toLowerCase()} role="listitem" aria-label={battle.result}>
                  {battle.result === "Win" ? "W" : battle.result === "Draw" ? "D" : "L"}
                </span>
              ))}
            </div>
          ) : <p>{locale === "es" ? "Sin batallas recientes registradas" : "No recent battles recorded"}</p>}
          <p>{locale === "es" ? `Últimas ${performance.recent.length} batallas registradas` : `Last ${performance.recent.length} recorded battles`}</p>
        </section>

        <section className="profile-hero-deck" aria-label={locale === "es" ? "Mazo actual" : "Current deck"}>
          <header>
            <div><small>{locale === "es" ? "Mazo actual" : "Current deck"}</small><strong>{deck.length === 8 ? `${deck.length} ${locale === "es" ? "cartas" : "cards"}` : locale === "es" ? "No disponible" : "Unavailable"}</strong></div>
            <div className="profile-hero-deck-tools">
              {averageElixir !== undefined ? <span><Image src="/images/ui-icons/elixir.png" alt="" width={16} height={19} />{averageElixir.toFixed(1)}</span> : null}
              {deckHasActions ? <DeckActions cards={deck} label={locale === "es" ? "mazo actual" : "current deck"} compact /> : null}
            </div>
          </header>
          {deck.length ? (
            <DeckCardGrid cards={deck} label={locale === "es" ? "Cartas del mazo actual" : "Current deck cards"} size="compact" priorityCount={4} className="profile-hero-deck-grid" />
          ) : <p>{locale === "es" ? "El perfil no incluye un mazo actual." : "This profile does not include a current deck."}</p>}
        </section>

        <div className="profile-hero-actions" aria-label={locale === "es" ? "Acciones del perfil" : "Profile actions"}>
          {actions ? <div className="profile-primary-actions">{actions}</div> : null}
          <PlayerShareActions player={player} compact />
        </div>
      </div>
    </ArenaHeroFrame>
  );
}

function resultStreak(battles: Battle[]) {
  const latest = battles[0]?.result;
  if (!latest) return "—";
  let count = 0;
  for (const battle of battles) {
    if (battle.result !== latest) break;
    count += 1;
  }
  const prefix = latest === "Win" ? "W" : latest === "Loss" ? "L" : "D";
  return `${prefix}${count}`;
}

function HeroMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="profile-hero-metric"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

export type PlayerTab = "Statistics" | "Battles" | "Decks" | "Cards" | "Chests";

export function PlayerTabs({ active, onChange }: { active: PlayerTab; onChange: (tab: PlayerTab) => void }) {
  const { t } = useI18n();
  return (
    <nav className="profile-tabs mobile-page-tabs mobile-page-tabs--profile" aria-label={t("player.sections")}>
      {tabItems.map((tab) => (
        <button key={tab.label} type="button" className={active === tab.label ? "active" : ""} aria-current={active === tab.label ? "page" : undefined} onClick={() => onChange(tab.label as PlayerTab)}>
          <Image src={tab.icon} alt="" width={28} height={28} />
          <span>{t(tab.message)}</span>
        </button>
      ))}
    </nav>
  );
}

type ProfileStat = {
  label: string;
  value: string;
  icon: string;
  note?: string;
};

type ProfileStatGroup = {
  title: string;
  icon: string;
  stats: ProfileStat[];
};

export function PlayerStats({
  player,
  catalogCards = [],
  onRefresh,
  isRefreshing
}: {
  player: Player;
  catalogCards?: Card[];
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const { formatNumber, locale, t } = useI18n();
  const groups = profileStatGroups(player, catalogCards, formatNumber, locale);

  return (
    <section className="profile-section profile-stats-section">
      <header className="profile-editorial-heading profile-editorial-heading-tools">
        <div>
          <span>{locale === "es" ? "Perfil del jugador" : "Player profile"}</span>
          <h2>{locale === "es" ? "Estadísticas" : "Statistics"}</h2>
        </div>
        <div className="update-tools"><span>{updatedLabel(player.fetchedAt, locale)}</span><button type="button" onClick={onRefresh} disabled={isRefreshing}><RefreshCcw className={isRefreshing ? "spin" : ""} size={16} />{isRefreshing ? t("common.refreshing") : t("common.refresh")}</button></div>
      </header>
      {groups.length ? (
        <div className="profile-stat-groups">
          {groups.map((group) => (
            <section className="profile-stat-group" key={group.title} aria-labelledby={`profile-stat-${group.title.toLowerCase().replaceAll(" ", "-")}`}>
              <header className="profile-stat-group-heading">
                <Image src={group.icon} alt="" width={34} height={34} />
                <h3 id={`profile-stat-${group.title.toLowerCase().replaceAll(" ", "-")}`}>{group.title}</h3>
              </header>
              <dl className="profile-stat-grid">
                {group.stats.map((stat) => (
                  <div className="profile-stat-card" key={stat.label}>
                    <Image src={stat.icon} alt="" width={30} height={30} />
                    <div>
                      <dt>{stat.label}</dt>
                      <dd>{stat.value}</dd>
                      {stat.note ? <small>{stat.note}</small> : null}
                    </div>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      ) : <p className="empty-results">{locale === "es" ? "No hay estadísticas disponibles para este perfil." : "No player statistics are available for this profile."}</p>}
      <p className="table-note">{locale === "es" ? "Estos valores son los totales que informa el perfil del juego." : "These values are the totals reported by the in-game player profile."}</p>
    </section>
  );
}

function profileStatGroups(
  player: Player,
  catalogCards: Card[],
  formatNumber: (value: number) => string,
  locale: Locale
): ProfileStatGroup[] {
  const spanish = locale === "es";
  const numberStat = (label: string, value: number | undefined, icon: string, note?: string): ProfileStat | undefined => (
    value === undefined ? undefined : { label, value: formatNumber(value), icon, note }
  );
  const stringStat = (label: string, value: string | undefined, icon: string, note?: string): ProfileStat | undefined => (
    value ? { label, value, icon, note } : undefined
  );
  const stat = (label: string) => readPlayerStat(player.stats, label);
  const streak = currentStreak(player, formatNumber, spanish);
  const cardsFound = player.cardCollectionAvailable === false
    ? undefined
    : stringStat(
        spanish ? "Cartas encontradas" : "Cards found",
        catalogCards.length ? `${formatNumber(player.cards.length)} / ${formatNumber(catalogCards.length)}` : formatNumber(player.cards.length),
        "/images/icons/cardsq.png",
        catalogCards.length
          ? (spanish ? "Cartas propias / catálogo" : "Owned / catalog")
          : (spanish ? "Total del catálogo no disponible" : "Catalog total unavailable")
      );

  const core = [
    numberStat(spanish ? "Máximo de trofeos" : "Highest trophies", player.bestTrophies, "/images/icons/trophy.png"),
    numberStat(spanish ? "Victorias" : "Wins", stat("Wins"), "/images/icons/sword.png"),
    numberStat(spanish ? "Derrotas" : "Losses", stat("Losses"), "/images/icons/sword.png"),
    numberStat(spanish ? "Victorias de 3 coronas" : "Three-crown wins", stat("3 crown wins"), "/images/icons/crown-gold.png"),
    numberStat(spanish ? "Batallas" : "Battles", stat("Battles"), "/images/icons/sword.png"),
    numberStat(spanish ? "Donaciones totales" : "Total donations", stat("Total donations"), "/images/icons/crown-2d.png"),
    streak ? { label: spanish ? "Racha actual" : "Current streak", value: streak.value, icon: "/images/icons/crown-gold.png", note: streak.note } : undefined,
    cardsFound,
    stringStat(spanish ? "Carta favorita" : "Favorite card", player.favoriteCard?.name, "/images/icons/cardsq.png")
  ].filter((value): value is ProfileStat => value !== undefined);

  const groups: ProfileStatGroup[] = [
    { title: spanish ? "Estadísticas principales" : "Core stats", icon: "/images/icons/trophy.png", stats: core },
    {
      title: spanish ? "Guerras de clanes" : "Clan Wars",
      icon: "/images/icons/clans.png",
      stats: [
        numberStat(spanish ? "Victorias del día de guerra" : "War day wins", stat("War day wins"), "/images/icons/sword.png"),
        numberStat(spanish ? "Cartas de clan recolectadas" : "Clan cards collected", player.clanCardsCollected, "/images/icons/cardsq.png")
      ].filter((value): value is ProfileStat => value !== undefined)
    },
    {
      title: spanish ? "Desafíos" : "Challenges",
      icon: "/images/icons/battle.png",
      stats: [
        numberStat(spanish ? "Máximo de victorias" : "Max wins", stat("Challenge max wins"), "/images/icons/trophy.png"),
        numberStat(spanish ? "Cartas ganadas" : "Cards won", stat("Challenge cards won"), "/images/icons/cardsq.png")
      ].filter((value): value is ProfileStat => value !== undefined)
    },
    {
      title: spanish ? "Torneos" : "Tournaments",
      icon: "/images/icons/battle-tournament.png",
      stats: [
        numberStat(spanish ? "Batallas de torneo" : "Tournament battles", player.tournamentBattleCount, "/images/icons/sword.png"),
        numberStat(spanish ? "Cartas ganadas en torneos" : "Tournament cards won", stat("Tourney cards won"), "/images/icons/cardsq.png")
      ].filter((value): value is ProfileStat => value !== undefined)
    }
  ];

  return groups.filter((group) => group.stats.length);
}

function readPlayerStat(stats: Record<string, string>, label: string) {
  const raw = stats[label];
  if (raw === undefined) return undefined;
  const value = Number(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

function currentStreak(player: Player, formatNumber: (value: number) => string, spanish: boolean): { value: string; note: string } | undefined {
  const verified = player.currentWinLoseStreak;
  if (typeof verified === "number" && Number.isFinite(verified)) {
    if (verified === 0) return { value: "0", note: spanish ? "Sin racha" : "No active streak" };
    const count = Math.abs(verified);
    const kind = verified > 0 ? (spanish ? "victorias" : "wins") : (spanish ? "derrotas" : "losses");
    return { value: `${verified > 0 ? "+" : "−"}${formatNumber(count)}`, note: `${formatNumber(count)} ${kind}` };
  }

  const fallback = analyzePlayerBattles(player.battles).currentWinStreak;
  return fallback > 0
    ? { value: `+${formatNumber(fallback)}`, note: spanish ? "Victorias seguidas del registro de batallas" : "Consecutive wins in battle log" }
    : undefined;
}

export function PerformanceSection({ battles }: { battles: Battle[] }) {
  const { locale } = useI18n();
  const performance = analyzePlayerBattles(battles);
  if (!performance.games) return <EmptyPanel title={locale === "es" ? "Sin rendimiento de batallas" : "No battle performance yet"} copy={locale === "es" ? "El rendimiento aparecerá cuando el registro de este jugador tenga resultados." : "Performance will appear when this player's battle log has a result."} />;

  return (
    <section className="profile-section performance-section">
      <header className="profile-editorial-heading">
        <div><h2>Performance</h2></div>
        <p>A short-term read of results, streaks, and the modes this player has been playing.</p>
      </header>
      <div className="stat-matrix performance-stats">
        <PerformanceStat
          icon="/images/icons/sword.png"
          value={performance.draws ? `${performance.wins}–${performance.losses}–${performance.draws}` : `${performance.wins}–${performance.losses}`}
          label={performance.draws ? "W / L / D record" : "W / L record"}
        />
        <PerformanceStat icon="/images/ui-icons/trophies.png" value={`${performance.winRate.toFixed(1)}%`} label="Win rate" />
        <PerformanceStat icon="/images/icons/three.png" value={`${performance.threeCrownRate.toFixed(1)}%`} label={`${performance.threeCrownWins} three-crown wins`} />
        <PerformanceStat icon="/images/icons/sword.png" value={`${performance.currentWinStreak} / ${performance.bestWinStreak}`} label="Current / best streak" />
      </div>
      <div className="performance-grid">
        <div className="performance-mode-table">
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
        <div className="performance-timeline recent-form-card">
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
      <p className="table-note">Calculated from the latest {performance.games} recorded battles. Small samples can swing quickly.</p>
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
      <header className="profile-editorial-heading">
        <div><h2>{locale === "es" ? "Comparación de temporadas" : "Season comparison"}</h2></div>
        <p>Compare this Ranked season with last season and the player&rsquo;s best recorded finish.</p>
      </header>
      <div className="pol-columns">
        {rows.map(({ label, result }) => (
          <div key={label} className="pol-card">
            {result ? <Image className="pol-league-icon" src={leagueImage(result.leagueNumber)} alt="" width={64} height={64} /> : null}
            <span className="pol-label">{label}</span>
            <strong>{result?.trophies !== undefined ? formatNumber(result.trophies) : "—"}</strong>
            <span>{result?.rank ? `#${formatNumber(result.rank)}` : (locale === "es" ? "Sin clasificación" : "Unranked")}</span>
          </div>
        ))}
      </div>
      <p className="table-note">Ranked resets each season. A rank appears only when this player has a recorded leaderboard placement.</p>
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
      <DeckCardGrid cards={cards} label="Current eight-card deck" size="large" className="current-deck-cluster" />
      {supportCards.length ? (
        <div className="current-deck-support">
          <h3>Tower Troop</h3>
          <div className="current-deck-support-cards">
            {supportCards.map((card, index) => <DeckCardLink key={`${card.name}-${index}`} card={card} />)}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DeckCardLink({ card }: { card: Card }) {
  const label = card.variant ? `${card.name} (${card.variant})` : card.name;
  return <Link href={`/cards/${cardSlug(card.name)}`} className="current-deck-card" title={label}><GameCardArt card={card} size="deck" /></Link>;
}

export function DeckAnalyticsSection({ battles }: { battles: Battle[] }) {
  const decks = analyzePlayerBattles(battles).decks;
  if (!decks.length) return <EmptyPanel title="No complete decks in this log" copy="Recent battles do not include enough complete eight-card decks to compare yet." />;

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
              <DeckCardGrid cards={deck.cards} label={`Cards in deck ${index + 1}`} size="standard" className="personal-deck-cards" />
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
  const snapshots = [...history].sort((a, b) => a.recordedAt - b.recordedAt);
  const earliest = snapshots[0]?.recordedAt ?? 0;
  const mostRecent = snapshots.at(-1)?.recordedAt ?? earliest;
  const data = snapshots.map((point) => ({
    label: formatSnapshotDate(point.recordedAt, locale),
    trophies: point.value,
  }));

  return (
    <section className="profile-section chart-section">
      <header className="profile-editorial-heading">
        <div><h2>Trophy activity</h2></div>
        <p className="chart-range">
          {history.length} {locale === "es" ? "instantáneas" : "snapshots"} · {formatObservationWindow(mostRecent - earliest, locale)}
        </p>
      </header>
      <TrophyActivityChart data={data} label="Observed trophy snapshots trend" formatNumber={formatNumber} />
      <p className="table-note">
        Trophy Road standing is recorded when this profile is viewed and its trophy count has changed. Gaps between
        points are not a complete battle-by-battle history.
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
    return <EmptyPanel title="No trophy activity available" copy="A current Trophy Road total is not available for this player." />;
  }
  const recentBattles = player.battles.filter((battle) => battle.trophyChange !== undefined).slice(0, 10).reverse();
  const startingTrophies = player.trophies - recentBattles.reduce((total, battle) => total + (battle.trophyChange ?? 0), 0);
  const values = recentBattles.reduce<number[]>((points, battle) => {
    points.push((points.at(-1) ?? startingTrophies) + (battle.trophyChange ?? 0));
    return points;
  }, [startingTrophies]);
  const labels = ["Start", ...recentBattles.map((battle) => battle.date)];
  const data = values.map((trophies, index) => {
    const label = labels[index] ?? "Battle";
    return {
      label: index === 0 ? label : label.replace(/, \d{4}$/, ""),
      trophies,
    };
  });

  return (
    <section className="profile-section chart-section">
      <header className="profile-editorial-heading">
        <div><h2>Trophy activity</h2></div>
        <p className="chart-range">Last {recentBattles.length} battles</p>
      </header>
      <TrophyActivityChart data={data} label="Recent trophy activity line chart" formatNumber={formatNumber} />
      <p className="table-note">
        Recent trophy changes reconstruct this {recentBattles.length}-battle run. It may not include battles outside the current log.
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
      <header className="profile-editorial-heading">
        <div><h2>{t("player.upcomingChests")}</h2></div>
        <p>+N shows how many reward chests are ahead in this player&rsquo;s cycle. +0 is next.</p>
      </header>
      <div className="chest-row">
        {chests.map((chest, index) => (
          <div key={`${chest.name}-${index}`} className="chest-item" title={chest.name}>
            <Image src={chest.image} alt={chest.name} width={58} height={58} />
            <strong>+{chest.index}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
