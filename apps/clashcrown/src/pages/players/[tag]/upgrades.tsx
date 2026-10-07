import Head from "@/components/Head";
import Link from "@/components/Link";
import { useRouter } from "@/lib/router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Image from "@/components/Image";
import styles from "./upgrades.module.css";
import { Layout } from "@/components/portfolio/Layout";
import { ArenaRouteHero } from "@/components/portfolio/ArenaRouteHero";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { cardSlug } from "@/lib/clash/cards";
import { buildUpgradePlans, MAX_CARD_LEVEL, type CardUpgradePlan, type UpgradeRarity } from "@/lib/clash/upgradeCosts";
import { isConvexConfigured } from "@/lib/convex";
import { usePlayerAcquisition } from "@/lib/clash/profileAcquisition";
import type { Player } from "@/lib/clash/domain";
import { player as mockPlayer } from "@/lib/mock-data";
import { usePersonalization } from "@/components/personalization/PersonalizationProvider";

const RARITIES: readonly UpgradeRarity[] = ["Common", "Rare", "Epic", "Legendary", "Champion"];
const SORTS = [
  { key: "Closest", label: "Closest to upgrade" },
  { key: "Level", label: "Level" },
  { key: "Rarity", label: "Rarity" },
  { key: "Name", label: "Name A–Z" }
] as const;
type Sort = (typeof SORTS)[number]["key"];
type RarityFilter = "All" | UpgradeRarity;
const READY_PREVIEW = 16;

export default function UpgradesPage() {
  const router = useRouter();
  const tag = typeof router.query.tag === "string" ? router.query.tag : "";

  if (!router.isReady) return <Layout><LoadingState label="player upgrades" /></Layout>;
  if (tag.toUpperCase() === "CCDEMO") return <UpgradePlanner player={mockPlayer} />;
  if (!isConvexConfigured) return <Layout><SetupState feature="player upgrades" /></Layout>;
  return <LiveUpgrades tag={tag} />;
}

function LiveUpgrades({ tag }: { tag: string }) {
  const query = usePlayerAcquisition(tag);

  if (query.isLoading) return <Layout><LoadingState label="player upgrades" /></Layout>;
  if (query.errorMessage) return <Layout><ErrorState message={query.errorMessage} /></Layout>;
  if (!query.data) return <Layout><ErrorState message="No player data was returned." /></Layout>;
  return <UpgradePlanner player={query.data} />;
}

function UpgradePlanner({ player }: { player: Player }) {
  const personalization = usePersonalization();
  const [rarity, setRarity] = useState<RarityFilter>("All");
  const [sort, setSort] = useState<Sort>("Closest");
  const [hideMaxed, setHideMaxed] = useState(true);
  const [showAllReady, setShowAllReady] = useState(false);
  const plans = useMemo(() => buildUpgradePlans(player.cards), [player.cards]);

  useEffect(() => {
    if (player.tag) void personalization.remember({ kind: "players", tag: player.tag, name: player.name, clan: player.clan }).catch(() => undefined);
  }, [player.tag, player.name, player.clan]);

  const known = plans.filter((plan) => plan.level !== undefined);
  const maxed = known.filter((plan) => plan.level === MAX_CARD_LEVEL);
  const ready = useMemo(
    () => plans.filter((plan) => plan.ready).sort((a, b) => (a.next?.gold ?? 0) - (b.next?.gold ?? 0) || a.card.name.localeCompare(b.card.name)),
    [plans]
  );
  // Not ready yet, not maxed: ordered by how close the next level is.
  const nextUp = useMemo(
    () => plans
      .filter((plan) => !plan.ready && plan.next && plan.level !== undefined && plan.level < MAX_CARD_LEVEL)
      .sort((a, b) => copiesShare(b) - copiesShare(a) || a.card.name.localeCompare(b.card.name))
      .slice(0, 8),
    [plans]
  );
  const totals = useMemo(
    () => plans.reduce((total, plan) => ({ cards: total.cards + plan.cardsStillNeeded, gold: total.gold + plan.goldStillNeeded }), { cards: 0, gold: 0 }),
    [plans]
  );
  const readyGold = ready.reduce((total, plan) => total + (plan.next?.gold ?? 0), 0);

  const collection = useMemo(() => {
    const filtered = plans.filter((plan) => (rarity === "All" || plan.rarity === rarity) && (!hideMaxed || plan.level !== MAX_CARD_LEVEL));
    return [...filtered].sort((a, b) => {
      if (sort === "Closest") return Number(b.ready) - Number(a.ready) || copiesShare(b) - copiesShare(a) || a.card.name.localeCompare(b.card.name);
      if (sort === "Level") return (b.level ?? -1) - (a.level ?? -1) || a.card.name.localeCompare(b.card.name);
      if (sort === "Rarity") return RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.card.name.localeCompare(b.card.name);
      return a.card.name.localeCompare(b.card.name);
    });
  }, [plans, rarity, sort, hideMaxed]);

  const profileTag = player.tag.replace(/^#/, "");
  const maxedShare = known.length ? maxed.length / known.length : 0;

  return (
    <Layout>
      <Head>
        <title>{`${player.name} upgrades | StatsConnect · Clash Royale statistics`}</title>
        <meta name="description" content={`Plan ${player.name}'s Clash Royale card upgrades and track the path to a maxed collection.`} />
      </Head>
      <div className={`profile-page ${styles.page}`}>
        <ArenaRouteHero
          title="Upgrade planner"
          summary={<>What <Link href={`/players/${profileTag}`} className={styles.heroLink}>{player.name}</Link> can upgrade today, what&rsquo;s close, and the road to a maxed collection.</>}
        />

        {!plans.length ? (
          <section className="profile-section empty-panel">
            <h2>No card collection available</h2>
            <p>The API did not return card levels for this player, so there is nothing to plan yet.</p>
          </section>
        ) : (
          <div className={styles.body}>
            <section className={styles.road} aria-label="Road to max">
              <div className={styles.ring} style={{ "--share": `${Math.round(maxedShare * 360)}deg` } as CSSProperties}>
                <div>
                  <strong>{maxed.length}</strong>
                  <span>of {known.length} at level {MAX_CARD_LEVEL}</span>
                </div>
              </div>
              <dl className={styles.totals}>
                <div>
                  <dt><Image src="/images/icons/gold.png" alt="" width={26} height={26} />Gold to max everything</dt>
                  <dd>{totals.gold.toLocaleString()}</dd>
                </div>
                <div>
                  <dt><Image src="/images/icons/cardsq.png" alt="" width={26} height={26} />Card copies still needed</dt>
                  <dd>{totals.cards.toLocaleString()}</dd>
                </div>
                <div>
                  <dt><Image src="/images/icons/checkmark.png" alt="" width={26} height={26} />Ready to upgrade now</dt>
                  <dd>{ready.length}<small>{ready.length ? `${readyGold.toLocaleString()} gold for all` : "keep collecting"}</small></dd>
                </div>
              </dl>
              <ul className={styles.rarityBars}>
                {RARITIES.map((item) => {
                  const group = known.filter((plan) => plan.rarity === item);
                  if (!group.length) return null;
                  const done = group.filter((plan) => plan.level === MAX_CARD_LEVEL).length;
                  return (
                    <li key={item} data-rarity={item}>
                      <span>{item}</span>
                      <i aria-hidden="true"><b style={{ width: `${(done / group.length) * 100}%` }} /></i>
                      <small>{done}/{group.length}</small>
                    </li>
                  );
                })}
              </ul>
            </section>

            {ready.length ? (
              <section className="profile-section">
                <div className="section-heading">
                  <h2>Ready to upgrade</h2>
                  <span>Cheapest first · {readyGold.toLocaleString()} gold total</span>
                </div>
                <ul className={styles.tiles}>
                  {(showAllReady ? ready : ready.slice(0, READY_PREVIEW)).map((plan) => <UpgradeTile key={plan.card.id ?? plan.card.name} plan={plan} />)}
                </ul>
                {ready.length > READY_PREVIEW ? (
                  <button type="button" className={`primary-button cr-button-blue ${styles.more}`} onClick={() => setShowAllReady((value) => !value)}>
                    {showAllReady ? "Show fewer" : `Show all ${ready.length}`}
                  </button>
                ) : null}
              </section>
            ) : null}

            {nextUp.length ? (
              <section className="profile-section">
                <div className="section-heading">
                  <h2>Almost there</h2>
                  <span>Closest to their next level</span>
                </div>
                <ul className={styles.tiles}>
                  {nextUp.map((plan) => <UpgradeTile key={plan.card.id ?? plan.card.name} plan={plan} />)}
                </ul>
              </section>
            ) : null}

            {!ready.length && !nextUp.length && known.length === maxed.length ? (
              <section className="profile-section empty-panel">
                <h2>Every card is maxed</h2>
                <p>{player.name} has every card at level {MAX_CARD_LEVEL}. Nothing left to upgrade.</p>
              </section>
            ) : null}

            <section className="profile-section">
              <div className="section-heading">
                <h2>Collection</h2>
                <span>{collection.length} of {plans.length} cards</span>
              </div>
              <div className={styles.toolbar}>
                <div className={styles.chips} role="group" aria-label="Rarity">
                  {(["All", ...RARITIES] as const).map((item) => (
                    <button key={item} type="button" className={styles.chip} aria-pressed={rarity === item} onClick={() => setRarity(item)}>
                      {item === "All" ? "All" : <><i className={styles.rarityDot} data-rarity={item} aria-hidden="true" />{item}</>}
                    </button>
                  ))}
                </div>
                <div className={styles.toolbarEnd}>
                  <label className={styles.toggle}>
                    <input type="checkbox" checked={hideMaxed} onChange={(event) => setHideMaxed(event.currentTarget.checked)} />
                    Hide maxed ({maxed.length})
                  </label>
                  <label className={styles.sort}>
                    <span>Sort</span>
                    <select value={sort} onChange={(event) => setSort(event.currentTarget.value as Sort)}>
                      {SORTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              {collection.length ? (
                <ul className={`${styles.tiles} ${styles.compact}`}>
                  {collection.map((plan) => <UpgradeTile key={plan.card.id ?? plan.card.name} plan={plan} compact />)}
                </ul>
              ) : (
                <p className={styles.note}>{hideMaxed && maxed.length ? "Every card here is maxed. Turn off “Hide maxed” to see them." : "No cards match this rarity."}</p>
              )}
              {known.length !== plans.length ? (
                <p className={styles.note}>{plans.length - known.length} card{plans.length - known.length === 1 ? " has" : "s have"} no level data and {plans.length - known.length === 1 ? "is" : "are"} left out of the totals.</p>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </Layout>
  );
}

/** How much of the next level's copies the player already holds, 0–1. */
function copiesShare(plan: CardUpgradePlan) {
  if (!plan.next || plan.next.cards <= 0) return 0;
  return Math.min(1, plan.count / plan.next.cards);
}

function UpgradeTile({ plan, compact = false }: { plan: CardUpgradePlan; compact?: boolean }) {
  const { card, next } = plan;
  const isMaxed = plan.level === MAX_CARD_LEVEL;
  const share = copiesShare(plan);
  return (
    <li>
      <Link href={`/cards/${cardSlug(card.name)}`} className={styles.tile} data-state={plan.ready ? "ready" : isMaxed ? "maxed" : "progress"}>
        <span className={styles.art}><GameCardArt card={card} size="library" /></span>
        {compact ? null : <strong className={styles.name}>{card.name}</strong>}
        {plan.level === undefined ? (
          <span className={styles.meta}>No level data</span>
        ) : isMaxed ? (
          <span className={styles.maxBadge}>Max</span>
        ) : next ? (
          <>
            <span className={styles.copies} aria-label={`${plan.count} of ${next.cards} copies`}>
              <i style={{ width: `${share * 100}%` }} />
              <b>{plan.count.toLocaleString()}/{next.cards.toLocaleString()}</b>
            </span>
            {plan.ready && !compact ? (
              <span className={styles.upgradeButton}>
                {next.gold > 0 ? <><Image src="/images/icons/gold.png" alt="" width={16} height={16} />{next.gold.toLocaleString()}</> : "Upgrade"}
              </span>
            ) : compact ? null : (
              <span className={styles.meta}>Level {plan.level} → {next.toLevel}</span>
            )}
          </>
        ) : null}
      </Link>
    </li>
  );
}
