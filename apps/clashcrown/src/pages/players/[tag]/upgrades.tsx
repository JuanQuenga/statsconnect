import Head from "@/components/Head";
import Link from "@/components/Link";
import { useRouter } from "@/lib/router";
import { useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/portfolio/Layout";
import { CardArt } from "@/components/portfolio/CardArt";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { cardSlug } from "@/lib/clash/cards";
import { buildUpgradePlans, MAX_CARD_LEVEL, type CardUpgradePlan, type UpgradeRarity } from "@/lib/clash/upgradeCosts";
import { errorMessage, isConvexConfigured, playerBundleAction } from "@/lib/convex";
import { mapPlayerBundle } from "@/lib/clash/mappers";
import { player as mockPlayer, type Player } from "@/lib/mock-data";
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
  const getPlayerBundle = useAction(playerBundleAction);
  const query = useQuery({
    queryKey: ["player-upgrades", tag],
    queryFn: async () => mapPlayerBundle(await getPlayerBundle({ tag })),
    retry: false
  });

  if (query.isLoading) return <Layout><LoadingState label="player upgrades" /></Layout>;
  if (query.error) return <Layout><ErrorState message={errorMessage(query.error)} /></Layout>;
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
        <title>{`${player.name} upgrades | Royale Stats`}</title>
        <meta name="description" content={`Plan ${player.name}'s Clash Royale card upgrades and track the path to a maxed collection.`} />
      </Head>
      <div className="profile-page upgrade-page">
        <section className="decks-hero upgrade-hero">
          <span className="eyebrow">Collection progression · #{player.tag}</span>
          <h1>{player.name}&rsquo;s Upgrade Planner</h1>
          <p>See what can be upgraded today and how many card copies and gold remain before the collection reaches level {MAX_CARD_LEVEL}.</p>
        </section>

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
      <UpgradeStyles />
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
      <div className="overall-progress-heading"><div><span className="eyebrow">Account completion</span><h2>Overall collection progress</h2></div><strong>{Math.round(value * 100)}%</strong></div>
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
      <CardArt src={plan.card.image} alt={plan.card.name} width={58} height={72} />
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
      <CardArt src={card.image} alt={card.name} width={52} height={64} />
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

function UpgradeStyles() {
  return <style>{`
    .upgrade-page { padding-bottom: 70px; }
    .upgrade-hero { margin-bottom: 28px; }
    .upgrade-hero p { max-width: 680px; }
    .upgrade-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 0 0 42px; }
    .upgrade-summary-card { display: grid; gap: 6px; padding: 18px 20px; border: 1px solid rgba(62, 88, 128, .2); border-radius: 8px; background: rgba(8, 24, 44, .72); }
    .upgrade-summary-card span, .upgrade-summary-card small { color: #8ea2c4; font: 11px var(--font-ui); }
    .upgrade-summary-card strong { font-size: 26px; color: white; }
    .overall-progress { margin: -16px 0 42px; padding: 18px 20px; border: 1px solid rgba(62, 88, 128, .2); border-radius: 8px; background: rgba(8, 24, 44, .55); }
    .overall-progress-heading { display: flex; align-items: end; justify-content: space-between; gap: 18px; margin-bottom: 10px; }
    .overall-progress-heading .eyebrow { display: block; margin-bottom: 5px; }
    .overall-progress-heading h2 { margin: 0; font-size: 18px; }
    .overall-progress-heading > strong { color: #d8e4fa; font-size: 20px; }
    .overall-progress p { margin: 10px 0 0; color: #8ea2c4; font: 11px/1.5 var(--font-ui); }
    .ready-filter { background: rgba(31, 162, 104, .72); }
    .ready-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .ready-card { display: grid; grid-template-columns: 58px 1fr auto; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid rgba(62, 188, 126, .24); border-radius: 8px; background: rgba(8, 39, 47, .75); color: white; }
    .ready-card:hover { border-color: rgba(85, 216, 149, .7); transform: translateY(-1px); }
    .ready-card img { width: 58px; height: 72px; object-fit: contain; }
    .ready-card-copy, .ready-cost { display: grid; gap: 4px; }
    .ready-card-copy strong { font-size: 13px; }
    .ready-card-copy small, .ready-cost small { color: #8ea2c4; font: 10px var(--font-ui); }
    .ready-cost { text-align: right; }
    .ready-cost b { color: #ffd76a; font-size: 15px; }
    .upgrade-collection-section { padding-bottom: 0; border-bottom: 0; }
    .upgrade-heading { margin-bottom: 22px; }
    .upgrade-toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 26px; padding: 14px 16px; border: 1px solid rgba(62, 88, 128, .2); border-radius: 8px; background: rgba(8, 24, 44, .55); }
    .upgrade-toolbar label { display: grid; gap: 6px; min-width: 150px; }
    .upgrade-toolbar label span { color: #8ea2c4; font: 10px var(--font-ui); text-transform: uppercase; letter-spacing: .06em; }
    .upgrade-toolbar select { min-height: 36px; padding: 0 30px 0 11px; border: 1px solid rgba(62, 88, 128, .38); border-radius: 6px; color: #d8e4fa; background: rgba(8, 24, 44, .9); }
    .upgrade-toggle { min-height: 36px; padding: 0 14px; border: 1px solid rgba(62, 88, 128, .38); border-radius: 6px; color: #cbd8ef; background: rgba(8, 24, 44, .9); cursor: pointer; }
    .upgrade-toggle-on { border-color: transparent; color: white; background: var(--pink-bright); }
    .rarity-group { margin: 0 0 34px; }
    .rarity-group-heading { display: flex; align-items: end; justify-content: space-between; gap: 18px; margin-bottom: 9px; }
    .rarity-group-heading h3 { margin: 0 0 4px; font-size: 18px; }
    .rarity-group-heading span { color: #8ea2c4; font: 11px var(--font-ui); }
    .rarity-group-heading > strong { color: #cbd8ef; font-size: 14px; }
    .upgrade-progress-track { display: block; height: 6px; overflow: hidden; border-radius: 999px; background: rgba(47, 76, 113, .48); }
    .upgrade-progress-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #1b8cff, #bb4fd0); }
    .rarity-group > .upgrade-progress-track { margin-bottom: 12px; }
    .upgrade-card-list { display: grid; gap: 7px; }
    .upgrade-card-row { display: grid; grid-template-columns: 52px minmax(120px, 1fr) 72px minmax(190px, 2fr) 60px; align-items: center; gap: 14px; min-height: 78px; padding: 8px 14px; border: 1px solid rgba(62, 88, 128, .18); border-radius: 7px; background: rgba(8, 24, 44, .72); color: white; }
    .upgrade-card-row:hover { border-color: rgba(238, 102, 239, .55); background: rgba(87, 35, 105, .25); }
    .upgrade-card-row img { width: 52px; height: 64px; object-fit: contain; }
    .upgrade-card-name, .upgrade-progress { display: grid; gap: 6px; min-width: 0; }
    .upgrade-card-name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
    .upgrade-card-name small, .upgrade-level, .upgrade-progress-label small { color: #8ea2c4; font: 10px var(--font-ui); }
    .upgrade-level { color: #d8e4fa; }
    .upgrade-progress-label { display: flex; justify-content: space-between; gap: 12px; }
    .upgrade-status { justify-self: end; color: #8ea2c4; font: 700 10px var(--font-ui); text-transform: uppercase; letter-spacing: .04em; }
    .upgrade-status-ready { color: #55d895; }
    .upgrade-note { margin: 18px 0 0; color: #8ea2c4; font: 12px/1.5 var(--font-ui); }
    .upgrade-empty-section { margin-top: 14px; }
    @media (max-width: 900px) { .upgrade-summary-grid { grid-template-columns: repeat(2, 1fr); } .ready-grid { grid-template-columns: repeat(2, 1fr); } .upgrade-card-row { grid-template-columns: 52px minmax(110px, 1fr) 65px minmax(150px, 2fr) 55px; gap: 9px; } }
    @media (max-width: 640px) { .upgrade-summary-grid, .ready-grid { grid-template-columns: 1fr; } .upgrade-card-row { grid-template-columns: 46px 1fr auto; gap: 10px; } .upgrade-card-row img { width: 46px; height: 56px; } .upgrade-level { grid-column: 2; grid-row: 2; } .upgrade-progress { grid-column: 2 / -1; grid-row: 3; } .upgrade-status { grid-column: 3; grid-row: 1; } }
  `}</style>;
}
