import { Award, Star } from "lucide-react";
import { CardArt } from "@/components/portfolio/CardArt";
import Link from "@/components/Link";
import { cardSlug } from "@/lib/clash/cards";
import type { Card, Player, PlayerAchievement, PlayerBadge } from "@/lib/clash/domain";
import { formatOptionalNumber, optionalNumber } from "@/lib/numbers";

type Detail = {
  label: string;
  value: string;
  note?: string;
};

function numberDetail(label: string, value: number | null | undefined, note?: string): Detail | undefined {
  const formatted = formatOptionalNumber(value);
  return formatted === undefined ? undefined : { label, value: formatted, note };
}

function profileDetails(player: Player): Detail[] {
  return [
    player.role ? { label: "Clan role", value: player.role } : undefined,
    numberDetail("Star points", player.starPoints, "Available for star levels"),
    numberDetail("Experience points", player.experiencePoints, "Current level progress"),
    numberDetail("Lifetime experience", player.totalExperiencePoints),
    numberDetail("Legacy trophy high", player.legacyTrophyRoadHighScore, "Retired Trophy Road record"),
    numberDetail("Tournament battles", player.tournamentBattleCount),
    numberDetail("Clan cards collected", player.clanCardsCollected),
    numberDetail("Donations received", player.donationsReceived)
  ].filter((detail): detail is Detail => detail !== undefined);
}

export function PlayerProfileDetails({ player }: { player: Player }) {
  const details = profileDetails(player);
  if (!player.favoriteCard && !details.length && !player.supportCardCollection?.length) return null;

  return (
    <section className="profile-section profile-details-section">
      <header className="profile-editorial-heading">
        <div><h2>Account details</h2></div>
        <p>Favorite card, clan role, and collection progress show how this account is built and where it has invested.</p>
      </header>
      <div className={player.favoriteCard ? "profile-detail-layout" : "profile-detail-layout profile-detail-layout-wide"}>
        {player.favoriteCard ? <FavoriteCard card={player.favoriteCard} /> : null}
        {details.length ? (
          <dl className="profile-detail-grid">
            {details.map((detail) => (
              <div className="profile-detail-row" key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
                {detail.note ? <small>{detail.note}</small> : null}
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {player.supportCardCollection?.length ? <SupportCardCollection cards={player.supportCardCollection} /> : null}
    </section>
  );
}

function FavoriteCard({ card }: { card: Card }) {
  return (
    <Link className="favorite-card-panel" href={`/cards/${cardSlug(card.name)}`}>
      <strong className="favorite-card-label"><Star size={13} /> Favorite card</strong>
      <CardArt src={card.image} alt={card.name} width={142} height={174} />
      <span className="favorite-card-copy">
        <strong>{card.name}</strong>
        <small>{card.rarity} · {card.elixir || "?"} elixir</small>
      </span>
    </Link>
  );
}

function SupportCardCollection({ cards }: { cards: Card[] }) {
  return (
    <div className="support-collection">
      <div className="support-collection-copy">
        <h3>Support-card collection</h3>
        <p>Tower Troops defend the Crown Towers without taking one of the deck&rsquo;s eight card slots. Levels show this player&rsquo;s available choices.</p>
      </div>
      <div className="support-card-list">
        {cards.map((card) => (
          <Link href={`/cards/${cardSlug(card.name)}`} key={card.id ?? card.name} aria-label={card.name}>
            <CardArt src={card.image} alt={card.name} width={88} height={108} />
            <span>{card.name}</span>
            {card.level !== undefined ? <small>Level {card.level}</small> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function PlayerBadgeSection({ badges = [] }: { badges?: PlayerBadge[] }) {
  if (!badges.length) return null;
  const featured = badges.slice(0, 8);
  const remaining = badges.slice(featured.length);

  return (
    <section className="profile-section profile-badges-section">
      <header className="profile-editorial-heading">
        <div><h2>Badge cabinet</h2></div>
        <p>{badges.length} collectible milestones earned through play, including Card Mastery. Higher levels show further progress.</p>
      </header>
      <div className="profile-badge-featured">
        {featured.map((badge, index) => <BadgeCard badge={badge} key={`${badge.name}-${index}`} />)}
      </div>
      {remaining.length ? (
        <details className="profile-badge-archive">
          <summary><span>Complete cabinet</span><strong>View {remaining.length} more badges</strong></summary>
          <div className="profile-badge-grid">
            {remaining.map((badge, index) => <BadgeCard badge={badge} compact key={`${badge.name}-${index}`} />)}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function BadgeCard({ badge, compact = false }: { badge: PlayerBadge; compact?: boolean }) {
  const label = humanizeBadgeName(badge.name);
  const level = optionalNumber(badge.level);
  const maxLevel = optionalNumber(badge.maxLevel);
  const progress = formatOptionalNumber(badge.progress);
  const levelProgress = level !== undefined && maxLevel !== undefined && maxLevel > 0
    ? Math.min(100, Math.max(0, (level / maxLevel) * 100))
    : undefined;
  return (
    <article className={compact ? "profile-badge-card profile-badge-card-compact" : "profile-badge-card"}>
      <div className="profile-badge-art">
        {badge.image ? <CardArt src={badge.image} alt="" width={124} height={124} fallback="/images/icons/crown-gold.png" /> : <Award size={42} />}
      </div>
      <div>
        <strong>{label}</strong>
        {level !== undefined ? (
          <span>Level {level}{maxLevel !== undefined ? ` of ${maxLevel}` : ""}</span>
        ) : null}
        {progress !== undefined ? <small>{progress} progress</small> : null}
        {levelProgress !== undefined ? (
          <span className="badge-level-track" role="progressbar" aria-label={`${label} badge level`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(levelProgress)}>
            <i style={{ width: `${levelProgress}%` }} />
          </span>
        ) : null}
      </div>
    </article>
  );
}

function humanizeBadgeName(name: string) {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

export function PlayerAchievementsSection({ achievements = [] }: { achievements?: PlayerAchievement[] }) {
  if (!achievements.length) return null;
  return (
    <section className="profile-section achievements-section">
      <header className="profile-editorial-heading">
        <div><h2>Achievements</h2></div>
        <p>{achievements.length} classic goals across clan play, collection growth, challenges, and friendly battles.</p>
      </header>
      <div className="achievement-list">
        {achievements.map((achievement, index) => (
          <AchievementRow achievement={achievement} key={`${achievement.name}-${index}`} />
        ))}
      </div>
      <p className="table-note">Progress compares this player&rsquo;s recorded total with each goal&rsquo;s completion target.</p>
    </section>
  );
}

function AchievementRow({ achievement }: { achievement: PlayerAchievement }) {
  const stars = optionalNumber(achievement.stars);
  const value = optionalNumber(achievement.value);
  const target = optionalNumber(achievement.target);
  const hasProgress = value !== undefined && target !== undefined && target > 0;
  const percentage = hasProgress ? Math.min(100, Math.max(0, (value / target) * 100)) : undefined;
  return (
    <article className="achievement-row">
      <span className="achievement-copy">
        <strong>{achievement.name}</strong>
        {achievement.info ? <small>{achievement.info}</small> : null}
      </span>
      {stars !== undefined ? (
        <span className="achievement-stars" aria-label={`${stars} stars`}>
          <Star size={13} fill="currentColor" /> {stars}
        </span>
      ) : null}
      {hasProgress && percentage !== undefined ? (
        <span className="achievement-progress">
          <span><small>{value.toLocaleString()} / {target.toLocaleString()}</small><small>{Math.round(percentage)}%</small></span>
          <span className="achievement-track" role="progressbar" aria-label={`${achievement.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percentage)}>
            <i style={{ width: `${percentage}%` }} />
          </span>
        </span>
      ) : value !== undefined ? (
        <strong className="achievement-value">{value.toLocaleString()}</strong>
      ) : null}
    </article>
  );
}
