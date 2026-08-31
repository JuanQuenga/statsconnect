import Head from "@/components/Head";
import Link from "@/components/Link";
import { useRouter } from "@/lib/router";
import { useEffect, useMemo, useState } from "react";
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
const SORTS = ["Progress", "Level", "Name", "Rarity"] as const;
type Sort = (typeof SORTS)[number];
type RarityFilter = "All" | UpgradeRarity;

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
  const [sort, setSort] = useState<Sort>("Progress");
  const [onlyReady, setOnlyReady] = useState(false);
  const plans = useMemo(() => buildUpgradePlans(player.cards), [player.cards]);

  useEffect(() => {
    if (player.tag) void personalization.remember({ kind: "players", tag: player.tag, name: player.name, clan: player.clan }).catch(() => undefined);
  }, [player.tag, player.name, player.clan]);

  const filteredPlans = useMemo(() => {
    const filtered = plans.filter((plan) => (rarity === "All" || plan.rarity === rarity) && (!onlyReady || plan.ready));
    return [...filtered].sort((a, b) => {
      if (sort === "Progress") return b.progress - a.progress || a.card.name.localeCompare(b.card.name);
      if (sort === "Level") return (b.level ?? -1) - (a.level ?? -1) || a.card.name.localeCompare(b.card.name);
      if (sort === "Name") return a.card.name.localeCompare(b.card.name);
      return RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.card.name.localeCompare(b.card.name);
    });
  }, [plans, onlyReady, rarity, sort]);

  const readyPlans = plans.filter((plan) => plan.ready);
  const validPlans = plans.filter((plan) => plan.level !== undefined);
  const overallProgress = validPlans.length ? validPlans.reduce((total, plan) => total + plan.progress, 0) / validPlans.length : 0;
  const totals = useMemo(
    () => plans.reduce(
      (total, plan) => ({
        cards: total.cards + plan.cardsStillNeeded,
        gold: total.gold + plan.goldStillNeeded
      }),
      { cards: 0, gold: 0 }
    ),
    [plans]
  );
  const maxedCount = validPlans.filter((plan) => plan.level === MAX_CARD_LEVEL).length;
  const grouped = useMemo(() => RARITIES.map((item) => ({ rarity: item, plans: filteredPlans.filter((plan) => plan.rarity === item) })).filter((group) => group.plans.length), [filteredPlans]);

  return (
    <Layout>
      <Head>
        <title>{`${player.name} upgrades | StatsConnect · Clash Royale statistics`}</title>
        <meta name="description" content={`Plan ${player.name}'s Clash Royale card upgrades and track the path to a maxed collection.`} />
      </Head>
      <div className="profile-page upgrade-page">
        <ArenaRouteHero
          title={<>{player.name}&rsquo;s Upgrade Planner</>}
          summary={`See what can be upgraded today and how many card copies and gold remain before the collection reaches level ${MAX_CARD_LEVEL}.`}
        />

        {!plans.length ? <EmptyUpgradeState /> : null}
        {plans.length ? (
          <>
            <SummaryCards totals={totals} readyCount={readyPlans.length} cardCount={plans.length} maxedCount={maxedCount} />
            <OverallProgress value={overallProgress} knownCards={validPlans.length} totalCards={plans.length} />
            {readyPlans.length ? <ReadyUpgrades plans={readyPlans} /> : <EmptySection title="Ready to upgrade now" copy="No card has enough copies for its next upgrade yet." />}
            <section className="profile-section upgrade-collection-section">
              <div className="section-heading upgrade-heading"><span className="filter-button static">{filteredPlans.length} cards</span><h2>Collection overview</h2><span /></div>
              <div className="upgrade-toolbar">
                <label>
                  <span>Rarity</span>
                  <select value={rarity} onChange={(event) => setRarity(event.target.value as RarityFilter)}>
                    <option value="All">All rarities</option>
                    {RARITIES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  <span>Sort by</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
                    {SORTS.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <button type="button" className={onlyReady ? "upgrade-toggle upgrade-toggle-on" : "upgrade-toggle"} aria-pressed={onlyReady} onClick={() => setOnlyReady((value) => !value)}>
                  {onlyReady ? "Showing ready only" : "Show ready only"}
                </button>
              </div>
              {!filteredPlans.length ? <p className="empty-results">No cards match these filters.</p> : null}
              {grouped.map((group) => <RarityGroup key={group.rarity} rarity={group.rarity} plans={group.plans} />)}
              {validPlans.length !== plans.length ? <p className="upgrade-note">{plans.length - validPlans.length} card{plans.length - validPlans.length === 1 ? " has" : "s have"} incomplete level data, so it is excluded from the totals.</p> : null}
            </section>
          </>
        ) : null}
      </div>
    </Layout>
  );
}

function SummaryCards({ totals, readyCount, cardCount, maxedCount }: { totals: { cards: number; gold: number }; readyCount: number; cardCount: number; maxedCount: number }) {
  const items = [
    { label: "Gold still needed", value: totals.gold, note: `to reach level ${MAX_CARD_LEVEL}` },
    { label: "Cards still needed", value: totals.cards, note: "copies or Wild Cards" },
    { label: "Max-level cards", value: maxedCount, note: `at level ${MAX_CARD_LEVEL}` },
    { label: "Ready now", value: readyCount, note: `of ${cardCount} cards` }
  ];
  return <section className="upgrade-summary-grid" aria-label="Upgrade totals">{items.map((item) => <div className="upgrade-summary-card" key={item.label}><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong><small>{item.note}</small></div>)}</section>;
}

function OverallProgress({ value, knownCards, totalCards }: { value: number; knownCards: number; totalCards: number }) {
  return (
    <section className="overall-progress">
      <div className="overall-progress-heading"><h2>Overall collection progress</h2><strong>{Math.round(value * 100)}%</strong></div>
      <ProgressBar value={value} label="Overall collection progress" />
      <p>{knownCards} of {totalCards} cards have level data. Progress averages each card&rsquo;s path from its starting rarity level to max level {MAX_CARD_LEVEL}.</p>
    </section>
  );
}

function ReadyUpgrades({ plans }: { plans: CardUpgradePlan[] }) {
  return (
    <section className="profile-section ready-section">
      <div className="section-heading upgrade-heading"><span className="filter-button ready-filter">{plans.length} ready</span><h2>Ready to upgrade now</h2><span /></div>
      <div className="ready-grid">{plans.map((plan) => <ReadyCard key={plan.card.id ?? plan.card.name} plan={plan} />)}</div>
    </section>
  );
}

function ReadyCard({ plan }: { plan: CardUpgradePlan }) {
  const next = plan.next;
  if (!next) return null;
  return (
    <Link href={`/cards/${cardSlug(plan.card.name)}`} className="ready-card">
      <GameCardArt card={plan.card} size="mini" />
      <span className="ready-card-copy"><strong>{plan.card.name}</strong><small>{plan.rarity} · Level {plan.level} → {next.toLevel}</small></span>
      <span className="ready-cost"><b>{next.gold.toLocaleString()}</b><small>gold</small></span>
    </Link>
  );
}

function RarityGroup({ rarity, plans }: { rarity: UpgradeRarity; plans: CardUpgradePlan[] }) {
  const known = plans.filter((plan) => plan.level !== undefined);
  const progress = known.length ? known.reduce((total, plan) => total + plan.progress, 0) / known.length : 0;
  const remaining = plans.reduce((total, plan) => total + plan.cardsStillNeeded, 0);
  return (
    <section className="rarity-group">
      <div className="rarity-group-heading"><div><h3>{rarity}</h3><span>{plans.length} cards · {remaining.toLocaleString()} copies remaining</span></div><strong>{Math.round(progress * 100)}% maxed</strong></div>
      <ProgressBar value={progress} label={`${rarity} collection progress`} />
      <div className="upgrade-card-list">{plans.map((plan) => <UpgradeCard key={plan.card.id ?? plan.card.name} plan={plan} />)}</div>
    </section>
  );
}

function UpgradeCard({ plan }: { plan: CardUpgradePlan }) {
  const { card, next } = plan;
  const progressLabel = plan.level === undefined
    ? "Level data unavailable"
    : plan.level >= MAX_CARD_LEVEL
      ? `Maxed at level ${MAX_CARD_LEVEL}`
      : `${plan.count.toLocaleString()} / ${(next?.cards ?? 0).toLocaleString()} cards`;
  return (
    <Link href={`/cards/${cardSlug(card.name)}`} className="upgrade-card-row">
      <GameCardArt card={card} size="mini" />
      <span className="upgrade-card-name"><strong>{card.name}</strong><small>{card.rarity}{card.starLevel ? ` · ${card.starLevel}★` : ""}</small></span>
      <span className="upgrade-level">{plan.level === undefined ? "—" : `Lv ${plan.level}/${MAX_CARD_LEVEL}`}</span>
      <span className="upgrade-progress"><span className="upgrade-progress-label"><small>{progressLabel}</small><small>{Math.round(plan.progress * 100)}%</small></span><ProgressBar value={plan.progress} label={`${card.name} progress`} /></span>
      <span className={plan.ready ? "upgrade-status upgrade-status-ready" : "upgrade-status"}>{plan.ready ? "Ready" : plan.level === undefined ? "Missing" : plan.level >= MAX_CARD_LEVEL ? "Maxed" : `→ ${next?.toLevel ?? "—"}`}</span>
    </Link>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return <span className="upgrade-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}><i style={{ width: `${Math.round(value * 100)}%` }} /></span>;
}

function EmptyUpgradeState() {
  return <section className="profile-section empty-panel"><h2>No card collection available</h2><p>The API did not return card levels for this player, so there is nothing to plan yet.</p></section>;
}

function EmptySection({ title, copy }: { title: string; copy: string }) {
  return <section className="profile-section empty-panel upgrade-empty-section"><h2>{title}</h2><p>{copy}</p></section>;
}
