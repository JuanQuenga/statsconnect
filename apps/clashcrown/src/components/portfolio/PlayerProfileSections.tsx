import { Award, Sparkles, Star } from "lucide-react";
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
      <div className="profile-section-heading"><h2>Account details</h2></div>
      <div className={player.favoriteCard ? "profile-detail-layout" : "profile-detail-layout profile-detail-layout-wide"}>
        {player.favoriteCard ? <FavoriteCard card={player.favoriteCard} /> : null}
        {details.length ? (
          <div className="profile-detail-grid">
            {details.map((detail) => (
              <div className="profile-detail-card" key={detail.label}>
                <span>{detail.label}</span>
                <strong>{detail.value}</strong>
                {detail.note ? <small>{detail.note}</small> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {player.supportCardCollection?.length ? <SupportCardCollection cards={player.supportCardCollection} /> : null}
      <ProfileFeatureStyles />
    </section>
  );
}

function FavoriteCard({ card }: { card: Card }) {
  return (
    <Link className="favorite-card-panel" href={`/cards/${cardSlug(card.name)}`}>
      <strong className="favorite-card-label"><Star size={13} /> Favorite card</strong>
      <CardArt src={card.image} alt={card.name} width={104} height={128} />
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
      <div>
        <h3>Support-card collection</h3>
        <p>The API returned these separately from the player&rsquo;s standard card collection.</p>
      </div>
      <div className="support-card-list">
        {cards.map((card) => (
          <Link href={`/cards/${cardSlug(card.name)}`} key={card.id ?? card.name} aria-label={card.name}>
            <CardArt src={card.image} alt={card.name} width={64} height={80} />
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
  return (
    <section className="profile-section">
      <div className="profile-section-heading"><h2>Badges ({badges.length})</h2></div>
      <div className="profile-badge-grid">
        {badges.map((badge, index) => <BadgeCard badge={badge} key={`${badge.name}-${index}`} />)}
      </div>
      <ProfileFeatureStyles />
    </section>
  );
}

function BadgeCard({ badge }: { badge: PlayerBadge }) {
  const label = humanizeBadgeName(badge.name);
  const level = optionalNumber(badge.level);
  const maxLevel = optionalNumber(badge.maxLevel);
  const progress = formatOptionalNumber(badge.progress);
  const levelProgress = level !== undefined && maxLevel !== undefined && maxLevel > 0
    ? Math.min(100, Math.max(0, (level / maxLevel) * 100))
    : undefined;
  return (
    <article className="profile-badge-card">
      <div className="profile-badge-art">
        {badge.image ? <CardArt src={badge.image} alt="" width={96} height={96} fallback="/images/icons/crown-gold.png" /> : <Award size={42} />}
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
      <div className="profile-section-heading"><h2>Achievements ({achievements.length})</h2></div>
      <div className="achievement-list">
        {achievements.map((achievement, index) => (
          <AchievementRow achievement={achievement} key={`${achievement.name}-${index}`} />
        ))}
      </div>
      <p className="table-note">Achievement progress is shown exactly as returned by the player API.</p>
      <ProfileFeatureStyles />
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
      <span className="achievement-icon"><Sparkles size={20} /></span>
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

function ProfileFeatureStyles() {
  return <style>{`
    .profile-detail-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 14px; align-items: stretch; }
    .profile-detail-layout-wide { grid-template-columns: 1fr; }
    .favorite-card-panel { display: grid; grid-template-columns: 96px 1fr; grid-template-rows: auto 1fr; gap: 8px 16px; align-items: center; padding: 18px; border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border)); border-radius: 16px; color: var(--foreground); background: linear-gradient(145deg, rgba(95, 52, 119, .42), rgba(13, 29, 49, .9)); }
    .favorite-card-panel:hover { border-color: color-mix(in srgb, var(--accent) 70%, white); transform: translateY(-2px); }
    .favorite-card-label { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; color: var(--muted-foreground); font: 700 11px var(--font-ui); }
    .favorite-card-panel > img { width: 92px; height: 112px; object-fit: contain; }
    .favorite-card-copy { display: grid; gap: 6px; }
    .favorite-card-copy strong { font-size: 17px; }
    .favorite-card-copy small { color: var(--muted-foreground); font: 10px var(--font-ui); }
    .profile-detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .profile-detail-card { min-height: 104px; display: grid; align-content: center; gap: 6px; padding: 16px; border: 1px solid var(--border); border-radius: 14px; background: color-mix(in srgb, var(--secondary) 44%, transparent); }
    .profile-detail-card span, .profile-detail-card small { color: var(--muted-foreground); font: 10px/1.35 var(--font-ui); }
    .profile-detail-card strong { font-size: 20px; }
    .support-collection { display: grid; grid-template-columns: minmax(210px, .65fr) 1.35fr; gap: 24px; align-items: center; margin-top: 14px; padding: 18px; border: 1px solid var(--border); border-radius: 14px; background: color-mix(in srgb, var(--secondary) 32%, transparent); }
    .support-collection h3 { margin: 5px 0; font-size: 17px; }
    .support-collection p { margin: 0; color: #8ea2c4; font: 11px/1.5 var(--font-ui); }
    .support-card-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(94px, 1fr)); gap: 10px; }
    .support-card-list a { min-width: 0; display: grid; justify-items: center; gap: 4px; padding: 9px; border: 1px solid rgba(62, 88, 128, .2); border-radius: 7px; background: rgba(3, 16, 28, .5); text-align: center; }
    .support-card-list a:hover { border-color: rgba(238, 102, 239, .55); }
    .support-card-list img { width: 54px; height: 68px; object-fit: contain; }
    .support-card-list span { overflow: hidden; max-width: 100%; color: white; font: 700 10px var(--font-ui); text-overflow: ellipsis; white-space: nowrap; }
    .support-card-list small { color: #8ea2c4; font: 9px var(--font-ui); }
    .profile-badge-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); column-gap: 24px; row-gap: 2px; }
    .profile-badge-card { min-width: 0; display: grid; grid-template-columns: 92px 1fr; gap: 12px; align-items: center; min-height: 116px; padding: 10px 4px; background: radial-gradient(circle at 42px 50%, rgba(94, 172, 255, .09), transparent 72px); box-shadow: inset 0 -1px rgba(88, 118, 157, .2); }
    .profile-badge-art { width: 92px; height: 92px; position: relative; display: grid; place-items: center; color: var(--primary); }
    .profile-badge-art::before { content: ""; width: 64px; height: 64px; position: absolute; border-radius: 50%; background: rgba(74, 151, 255, .22); filter: blur(18px); }
    .profile-badge-art img { z-index: 1; width: 96px; max-width: none; height: 96px; max-height: none; object-fit: contain; filter: drop-shadow(0 8px 10px rgba(0, 0, 0, .34)); }
    .profile-badge-card > div:last-child { min-width: 0; display: grid; gap: 5px; }
    .profile-badge-card strong { overflow: hidden; font-size: 13px; line-height: 1.25; text-overflow: ellipsis; }
    .profile-badge-card span, .profile-badge-card small { color: var(--muted-foreground); font: 10px var(--font-ui); }
    .badge-level-track { height: 5px; overflow: hidden; border-radius: 999px; background: var(--secondary); }
    .badge-level-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #498fff, #7ae0ff); }
    .achievement-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .achievement-row { min-height: 112px; display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; gap: 10px 14px; align-items: center; padding: 15px 16px; border: 1px solid var(--border); border-radius: 14px; background: color-mix(in srgb, var(--secondary) 38%, transparent); }
    .achievement-icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 12px; color: var(--primary); background: rgba(217, 107, 243, .1); }
    .achievement-copy { min-width: 0; display: grid; gap: 4px; }
    .achievement-copy strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .achievement-copy small, .achievement-progress small { color: var(--muted-foreground); font: 10px/1.35 var(--font-ui); }
    .achievement-stars { display: inline-flex; align-items: center; gap: 4px; color: var(--primary); font: 700 11px var(--font-ui); }
    .achievement-progress { grid-column: 2 / -1; display: grid; gap: 7px; }
    .achievement-progress > span:first-child { display: flex; justify-content: space-between; gap: 12px; }
    .achievement-track { height: 7px; overflow: hidden; border-radius: 999px; background: var(--secondary); }
    .achievement-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #498fff, var(--accent)); }
    .achievement-value { justify-self: end; font-size: 16px; }
    @media (max-width: 760px) {
      .profile-detail-layout, .support-collection { grid-template-columns: 1fr; }
      .achievement-list { grid-template-columns: 1fr; }
      .achievement-row { grid-template-columns: 42px minmax(0, 1fr) auto; }
      .achievement-progress, .achievement-value { grid-column: 2 / -1; width: 100%; }
    }
    @media (max-width: 480px) {
      .favorite-card-panel { grid-template-columns: 74px 1fr; }
      .favorite-card-panel > img { width: 74px; height: 94px; }
      .profile-detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .profile-badge-grid { grid-template-columns: 1fr; }
      .profile-badge-card { grid-template-columns: 82px 1fr; min-height: 104px; }
      .profile-badge-art { width: 82px; height: 82px; }
      .profile-badge-art img { width: 88px; height: 88px; }
    }
  `}</style>;
}
