import Head from "@/components/Head";
import Link from "@/components/Link";
import { useRouter } from "@/lib/router";
import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { CardArt } from "@/components/portfolio/CardArt";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { Layout } from "@/components/portfolio/Layout";
import styles from "@/components/PlayerComparison.module.css";
import { cardSlug } from "@/lib/clash/cards";
import { errorMessage, isConvexConfigured, playerBundleAction } from "@/lib/convex";
import { mapPlayerBundle } from "@/lib/clash/mappers";
import { normalizeTag } from "@/lib/clash/tag";
import type { FavoriteProfile, RecentProfile } from "@/lib/recentProfiles";
import type { Card, Player } from "@/lib/mock-data";
import { usePersonalization } from "@/components/personalization/PersonalizationProvider";

export default function PlayerComparePage() {
  const router = useRouter();
  const personalization = usePersonalization();
  const [draftA, setDraftA] = useState("");
  const [draftB, setDraftB] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [formError, setFormError] = useState("");
  const favorites: FavoriteProfile[] = personalization.profiles
    .filter((profile) => profile.kind === "players")
    .map(({ tag, name, clan }) => ({ kind: "players" as const, tag, name, clan }));
  const recents = personalization.recents;

  useEffect(() => {
    if (!router.isReady || initialized) return;
    const available = uniqueProfiles([...favorites, ...recents.filter((profile) => profile.kind === "players")]);
    setDraftA(queryInput(router.query.a) || tagInput(available[0]?.tag));
    setDraftB(queryInput(router.query.b) || tagInput(available.find((profile) => profile.tag !== available[0]?.tag)?.tag));
    setInitialized(true);
  }, [favorites, initialized, recents, router.isReady, router.query.a, router.query.b]);

  const queryA = queryTag(router.query.a);
  const queryB = queryTag(router.query.b);
  const queryError = router.isReady ? queryValidationError(router.query.a, "First player") || queryValidationError(router.query.b, "Second player") : "";
  const queryPairError = queryA && queryB && queryA === queryB ? "Choose two different players to compare." : "";
  const visibleError = formError || queryError || queryPairError;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const a = validateTag(draftA, "First player");
    const b = validateTag(draftB, "Second player");
    if (a.error || b.error) {
      setFormError(a.error || b.error || "Enter two valid player tags.");
      return;
    }
    if (a.tag === b.tag) {
      setFormError("Choose two different players to compare.");
      return;
    }
    setFormError("");
    void router.replace({ pathname: "/players/compare", query: { a: a.tag, b: b.tag } }, undefined, { shallow: true });
  }

  return (
    <Layout>
      <Head>
        <title>Compare Players | Clash Crown</title>
        <meta name="description" content="Compare two Clash Royale players side by side." />
      </Head>
      <div className={`profile-page ${styles.workspace}`}>
        <section className="profile-section">
          <div className={styles.intro}>
            <span className="eyebrow">Duo workspace</span>
            <h1>Compare players</h1>
            <p>Put two profiles side by side and see where each player leads.</p>
          </div>
          <form className={styles.form} onSubmit={submit} noValidate>
            <label className={styles.field}>
              First player
              <input value={draftA} onChange={(event) => setDraftA(event.target.value)} placeholder="#PLAYER_TAG" list="player-suggestions" />
            </label>
            <label className={styles.field}>
              Second player
              <input value={draftB} onChange={(event) => setDraftB(event.target.value)} placeholder="#PLAYER_TAG" list="player-suggestions" />
            </label>
            <button type="submit" className="pink-button">
              Compare
            </button>
          </form>
          <datalist id="player-suggestions">
            {uniqueProfiles([...favorites, ...recents.filter((profile) => profile.kind === "players")]).map((profile) => (
              <option key={profile.tag} value={tagInput(profile.tag)} label={`${profile.name}${profile.clan ? ` · ${profile.clan}` : ""}`} />
            ))}
          </datalist>
          {visibleError ? <p className={styles.error} role="alert">{visibleError}</p> : null}
          {favorites.length || recents.length ? (
            <p className={styles.sourceNote}>Suggestions come from your <strong>favorites</strong> and recently viewed profiles.</p>
          ) : null}
        </section>

        {!isConvexConfigured ? <SetupState feature="player comparisons" /> : null}
        {isConvexConfigured && queryA && queryB && !visibleError ? <ComparisonResults tagA={queryA} tagB={queryB} /> : null}
        {isConvexConfigured && router.isReady && (!queryA || !queryB) && !visibleError ? (
          <section className="profile-section empty-panel">
            <h2>Choose two players</h2>
            <p>Enter two player tags above, or select profiles from your favorites and recents.</p>
          </section>
        ) : null}
      </div>
    </Layout>
  );
}

function ComparisonResults({ tagA, tagB }: { tagA: string; tagB: string }) {
  const getPlayerBundle = useAction(playerBundleAction);
  const first = useQuery({
    queryKey: ["player-compare", tagA],
    queryFn: async () => mapPlayerBundle(await getPlayerBundle({ tag: tagA })),
    retry: false
  });
  const second = useQuery({
    queryKey: ["player-compare", tagB],
    queryFn: async () => mapPlayerBundle(await getPlayerBundle({ tag: tagB })),
    retry: false
  });

  if (first.isLoading || second.isLoading) return <LoadingState label="player comparison" />;
  if (first.error || second.error) return <ErrorState message={errorMessage(first.error ?? second.error)} />;
  if (!first.data || !second.data) return <ErrorState message="No player data was returned." />;

  return <ComparisonView first={first.data} second={second.data} />;
}

function ComparisonView({ first, second }: { first: Player; second: Player }) {
  const metrics = comparisonMetrics(first, second);
  return (
    <div className={styles.comparison}>
      <section className={`profile-section ${styles.metricPanel}`}>
        <div className={styles.playerHeads}>
          <PlayerHead player={first} />
          <span className={styles.vs}>vs</span>
          <PlayerHead player={second} />
        </div>
        <h2>Profile comparison</h2>
        {metrics.map((metric) => (
          <div className={styles.comparisonRow} key={metric.label}>
            <div className={`${styles.value} ${metric.firstBetter ? styles.better : ""}`}>{metric.format(metric.first)}</div>
            <span className={styles.label}>{metric.label}</span>
            <div className={`${styles.value} ${metric.secondBetter ? styles.better : ""}`}>{metric.format(metric.second)}</div>
          </div>
        ))}
        <div className={styles.comparisonRow}>
          <div className={styles.value}>{first.clan}</div>
          <span className={styles.label}>Clan</span>
          <div className={styles.value}>{second.clan}</div>
        </div>
        <div className={styles.comparisonRow}>
          <div className={styles.value}>{first.arena}</div>
          <span className={styles.label}>Arena</span>
          <div className={styles.value}>{second.arena}</div>
        </div>
      </section>
      <DeckComparison first={first} second={second} />
    </div>
  );
}

function PlayerHead({ player }: { player: Player }) {
  return (
    <div className={styles.playerHead}>
      <h2><Link href={`/players/${player.tag}`}>{player.name}</Link></h2>
      <strong>#{player.tag}</strong>
      <span>{player.clan} · {player.arena}</span>
    </div>
  );
}

function DeckComparison({ first, second }: { first: Player; second: Player }) {
  const firstKeys = new Set(first.deck.map(cardKey));
  const shared = new Set(second.deck.map(cardKey).filter((key) => firstKeys.has(key)));
  return (
    <section className={`profile-section ${styles.deckPanel}`}>
      <h2>Current decks</h2>
      <div className={styles.deckHeads}>
        <div className={styles.deckHead}>{first.name}<span><Link href={`/players/${first.tag}`}>Full profile</Link></span></div>
        <div className={styles.deckHead}>{second.name}<span><Link href={`/players/${second.tag}`}>Full profile</Link></span></div>
      </div>
      <div className={styles.decks}>
        <DeckColumn cards={first.deck} shared={shared} />
        <DeckColumn cards={second.deck} shared={shared} />
      </div>
    </section>
  );
}

function DeckColumn({ cards, shared }: { cards: Card[]; shared: Set<string> }) {
  if (!cards.length) return <div className={styles.emptyDeck}>No current deck available.</div>;
  return (
    <div className={styles.deckColumn}>
      <div className={styles.cards}>
        {cards.map((card, index) => {
          const isShared = shared.has(cardKey(card));
          return (
            <Link
              href={`/cards/${cardSlug(card.name)}`}
              className={`${styles.card} ${isShared ? styles.shared : ""}`}
              key={`${cardKey(card)}-${index}`}
              aria-label={`${card.name}${isShared ? " — shared by both players" : ""}`}
            >
              {isShared ? <span className={styles.sharedBadge}>Shared</span> : null}
              <CardArt src={card.image} alt={card.name} width={82} height={100} />
              <strong>{card.name}</strong>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

type ComparisonMetric = {
  label: string;
  first: number;
  second: number;
  firstBetter: boolean;
  secondBetter: boolean;
  format: (value: number) => string;
};

function comparisonMetrics(first: Player, second: Player): ComparisonMetric[] {
  const firstStats = numericStats(first);
  const secondStats = numericStats(second);
  return [
    metric("Trophies", first.trophies, second.trophies),
    metric("Best trophies", first.bestTrophies, second.bestTrophies),
    metric("Wins", firstStats.wins, secondStats.wins),
    metric("Losses", firstStats.losses, secondStats.losses, "lower"),
    metric("Win rate", firstStats.winRate, secondStats.winRate, "higher", (value) => `${value.toFixed(1)}%`),
    metric("Three-crown wins", firstStats.threeCrownWins, secondStats.threeCrownWins),
    metric("King level", first.level, second.level),
    metric("Cards found", first.cards.length, second.cards.length),
    metric("Donations", firstStats.donations, secondStats.donations)
  ];
}

function metric(
  label: string,
  first: number,
  second: number,
  direction: "higher" | "lower" = "higher",
  format: (value: number) => string = (value) => value.toLocaleString()
): ComparisonMetric {
  return {
    label,
    first,
    second,
    firstBetter: first !== second && (direction === "higher" ? first > second : first < second),
    secondBetter: first !== second && (direction === "higher" ? second > first : second < first),
    format
  };
}

function numericStats(player: Player) {
  const wins = statNumber(player, "Wins");
  const losses = statNumber(player, "Losses");
  return {
    wins,
    losses,
    threeCrownWins: statNumber(player, "3 crown wins"),
    donations: statNumber(player, "Total donations"),
    winRate: wins + losses ? (wins / (wins + losses)) * 100 : 0
  };
}

function statNumber(player: Player, label: string) {
  const value = Number.parseInt(player.stats[label]?.replaceAll(",", "") ?? "0", 10);
  return Number.isFinite(value) ? value : 0;
}

function cardKey(card: Card) {
  return typeof card.id === "number" ? `id:${card.id}` : `name:${card.name.toLowerCase()}`;
}

function validateTag(input: string, label: string) {
  try {
    return { tag: normalizeTag(input), error: "" };
  } catch {
    return { tag: "", error: `${label}: enter a valid Clash Royale tag, such as #2PP or #P0LYQ.` };
  }
}

function queryTag(value: string | string[] | undefined) {
  if (typeof value !== "string") return "";
  try {
    return normalizeTag(value);
  } catch {
    return "";
  }
}

function queryValidationError(value: string | string[] | undefined, label: string) {
  if (typeof value !== "string" || !value) return "";
  try {
    normalizeTag(value);
    return "";
  } catch {
    return `${label}: enter a valid Clash Royale tag, such as #2PP or #P0LYQ.`;
  }
}

function queryInput(value: string | string[] | undefined) {
  if (typeof value !== "string") return "";
  return value ? tagInput(value) : "";
}

function tagInput(tag: string | undefined) {
  if (!tag) return "";
  try {
    return `#${normalizeTag(tag)}`;
  } catch {
    return tag;
  }
}

function uniqueProfiles(profiles: Array<FavoriteProfile | RecentProfile>) {
  return profiles.filter(
    (profile, index) =>
      profiles.findIndex((item) => item.kind === profile.kind && storedTag(item.tag) === storedTag(profile.tag)) === index
  );
}

function storedTag(tag: string) {
  return tag.replace(/^#/, "").toUpperCase();
}
