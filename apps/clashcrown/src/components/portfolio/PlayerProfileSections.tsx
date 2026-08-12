import { Award, Sparkles, Star } from "lucide-react";
import { CardArt } from "@/components/portfolio/CardArt";
import Link from "@/components/Link";
import { cardSlug } from "@/lib/clash/cards";
import type { Card, Player, PlayerAchievement, PlayerBadge } from "@/lib/mock-data";

type Detail = {
  label: string;
  value: string;
  note?: string;
};

function numberDetail(label: string, value: number | undefined, note?: string): Detail | undefined {
  return value === undefined ? undefined : { label, value: value.toLocaleString(), note };
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
      <div className="section-heading compact-heading">
        <span className="filter-button static">Profile</span>
        <h2>Account Details</h2>
        <span />
      </div>
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
      <span className="eyebrow"><Star size={13} /> Favorite card</span>
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
        <span className="eyebrow">Tower Troops</span>
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
      <div className="section-heading compact-heading">
        <span className="filter-button static">{badges.length} badges</span>
        <h2>Badges</h2>
        <span />
      </div>
      <div className="profile-badge-grid">
        {badges.map((badge, index) => <BadgeCard badge={badge} key={`${badge.name}-${index}`} />)}
      </div>
      <ProfileFeatureStyles />
    </section>
  );
}

function BadgeCard({ badge }: { badge: PlayerBadge }) {
  const levelProgress = badge.level !== undefined && badge.maxLevel !== undefined && badge.maxLevel > 0
    ? Math.min(100, Math.max(0, (badge.level / badge.maxLevel) * 100))
    : undefined;
  return (
    <article className="profile-badge-card">
      <div className="profile-badge-art">
        {badge.image ? <CardArt src={badge.image} alt="" width={54} height={54} fallback="/images/icons/crown-gold.png" /> : <Award size={32} />}
      </div>
      <div>
        <strong>{badge.name}</strong>
        {badge.level !== undefined ? (
          <span>Level {badge.level}{badge.maxLevel !== undefined ? ` of ${badge.maxLevel}` : ""}</span>
        ) : null}
        {badge.progress !== undefined ? <small>{badge.progress.toLocaleString()} progress</small> : null}
        {levelProgress !== undefined ? (
          <span className="badge-level-track" role="progressbar" aria-label={`${badge.name} badge level`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(levelProgress)}>
            <i style={{ width: `${levelProgress}%` }} />
          </span>
        ) : null}
      </div>
    </article>
  );
}

export function PlayerAchievementsSection({ achievements = [] }: { achievements?: PlayerAchievement[] }) {
  if (!achievements.length) return null;
  return (
    <section className="profile-section achievements-section">
      <div className="section-heading compact-heading">
        <span className="filter-button static">{achievements.length} milestones</span>
        <h2>Achievements</h2>
        <span />
      </div>
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
  const hasProgress = achievement.value !== undefined && achievement.target !== undefined && achievement.target > 0;
  const percentage = hasProgress ? Math.min(100, Math.max(0, (achievement.value! / achievement.target!) * 100)) : undefined;
  return (
    <article className="achievement-row">
      <span className="achievement-icon"><Sparkles size={20} /></span>
      <span className="achievement-copy">
        <strong>{achievement.name}</strong>
        {achievement.info ? <small>{achievement.info}</small> : null}
      </span>
      {achievement.stars !== undefined ? (
        <span className="achievement-stars" aria-label={`${achievement.stars} stars`}>
          <Star size={13} fill="currentColor" /> {achievement.stars}
        </span>
      ) : null}
      {hasProgress && percentage !== undefined ? (
        <span className="achievement-progress">
          <span><small>{achievement.value!.toLocaleString()} / {achievement.target!.toLocaleString()}</small><small>{Math.round(percentage)}%</small></span>
          <span className="achievement-track" role="progressbar" aria-label={`${achievement.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percentage)}>
            <i style={{ width: `${percentage}%` }} />
          </span>
        </span>
      ) : achievement.value !== undefined ? (
        <strong className="achievement-value">{achievement.value.toLocaleString()}</strong>
      ) : null}
    </article>
  );
}

function ProfileFeatureStyles() {
  return <style>{`
    .profile-detail-layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 18px; align-items: stretch; }
    .profile-detail-layout-wide { grid-template-columns: 1fr; }
    .favorite-card-panel { display: grid; grid-template-columns: 92px 1fr; grid-template-rows: auto 1fr; gap: 8px 16px; align-items: center; padding: 18px; border: 1px solid rgba(238, 102, 239, .3); border-radius: 10px; color: white; background: linear-gradient(145deg, rgba(100, 32, 115, .55), rgba(8, 24, 44, .82)); }
    .favorite-card-panel:hover { border-color: rgba(238, 102, 239, .72); transform: translateY(-2px); }
    .favorite-card-panel > .eyebrow { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; }
    .favorite-card-panel > img { width: 92px; height: 112px; object-fit: contain; }
    .favorite-card-copy { display: grid; gap: 6px; }
    .favorite-card-copy strong { font-size: 17px; }
    .favorite-card-copy small { color: #9aacca; font: 10px var(--font-ui); }
    .profile-detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .profile-detail-card { min-height: 98px; display: grid; align-content: center; gap: 6px; padding: 15px 16px; border: 1px solid rgba(62, 88, 128, .25); border-radius: 8px; background: rgba(8, 24, 44, .72); }
    .profile-detail-card span, .profile-detail-card small { color: #8ea2c4; font: 10px/1.35 var(--font-ui); }
    .profile-detail-card strong { font-size: 20px; }
    .support-collection { display: grid; grid-template-columns: minmax(210px, .65fr) 1.35fr; gap: 24px; align-items: center; margin-top: 18px; padding: 18px; border: 1px solid rgba(62, 88, 128, .22); border-radius: 9px; background: rgba(8, 24, 44, .5); }
    .support-collection h3 { margin: 5px 0; font-size: 17px; }
    .support-collection p { margin: 0; color: #8ea2c4; font: 11px/1.5 var(--font-ui); }
    .support-card-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(94px, 1fr)); gap: 10px; }
    .support-card-list a { min-width: 0; display: grid; justify-items: center; gap: 4px; padding: 9px; border: 1px solid rgba(62, 88, 128, .2); border-radius: 7px; background: rgba(3, 16, 28, .5); text-align: center; }
    .support-card-list a:hover { border-color: rgba(238, 102, 239, .55); }
    .support-card-list img { width: 54px; height: 68px; object-fit: contain; }
    .support-card-list span { overflow: hidden; max-width: 100%; color: white; font: 700 10px var(--font-ui); text-overflow: ellipsis; white-space: nowrap; }
    .support-card-list small { color: #8ea2c4; font: 9px var(--font-ui); }
    .profile-badge-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(205px, 1fr)); gap: 12px; }
    .profile-badge-card { min-width: 0; display: grid; grid-template-columns: 62px 1fr; gap: 12px; align-items: center; min-height: 92px; padding: 14px; border: 1px solid rgba(62, 88, 128, .23); border-radius: 9px; background: rgba(8, 24, 44, .7); }
    .profile-badge-art { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 16px; color: #ffd45c; background: rgba(24, 63, 108, .8); }
    .profile-badge-art img { max-width: 54px; max-height: 54px; object-fit: contain; }
    .profile-badge-card > div:last-child { min-width: 0; display: grid; gap: 5px; }
    .profile-badge-card strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .profile-badge-card span, .profile-badge-card small { color: #8ea2c4; font: 10px var(--font-ui); }
    .badge-level-track { height: 5px; overflow: hidden; border-radius: 999px; background: rgba(47, 76, 113, .52); }
    .badge-level-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #1b8cff, #7ae0ff); }
    .achievement-list { display: grid; gap: 9px; }
    .achievement-row { min-height: 82px; display: grid; grid-template-columns: 42px minmax(160px, 1fr) auto minmax(190px, .8fr); gap: 14px; align-items: center; padding: 12px 16px; border: 1px solid rgba(62, 88, 128, .2); border-radius: 8px; background: rgba(8, 24, 44, .68); }
    .achievement-icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 50%; color: #ffd45c; background: rgba(255, 212, 92, .1); }
    .achievement-copy { min-width: 0; display: grid; gap: 4px; }
    .achievement-copy strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .achievement-copy small, .achievement-progress small { color: #8ea2c4; font: 10px/1.35 var(--font-ui); }
    .achievement-stars { display: inline-flex; align-items: center; gap: 4px; color: #ffd45c; font: 700 11px var(--font-ui); }
    .achievement-progress { display: grid; gap: 7px; }
    .achievement-progress > span:first-child { display: flex; justify-content: space-between; gap: 12px; }
    .achievement-track { height: 7px; overflow: hidden; border-radius: 999px; background: rgba(47, 76, 113, .52); }
    .achievement-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #1b8cff, #ee66ef); }
    .achievement-value { justify-self: end; font-size: 16px; }
    @media (max-width: 760px) {
      .profile-detail-layout, .support-collection { grid-template-columns: 1fr; }
      .achievement-row { grid-template-columns: 42px minmax(0, 1fr) auto; }
      .achievement-progress, .achievement-value { grid-column: 2 / -1; width: 100%; }
    }
    @media (max-width: 480px) {
      .favorite-card-panel { grid-template-columns: 74px 1fr; }
      .favorite-card-panel > img { width: 74px; height: 94px; }
      .profile-detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `}</style>;
}
