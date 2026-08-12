import Head from "@/components/Head";
import Link from "@/components/Link";
import { useRouter } from "@/lib/router";
import { Star } from "lucide-react";
import { useQuery } from "convex/react";
import { usePersonalization } from "@/components/personalization/PersonalizationProvider";
import { Layout } from "@/components/portfolio/Layout";
import { ProfileSearch } from "@/components/portfolio/ProfileSearch";
import { SetupState } from "@/components/portfolio/AsyncState";
import { EntityCell, TableShell, TrophyCell } from "@/components/portfolio/DataTable";
import favoriteStyles from "@/components/PlayerFavorites.module.css";
import { directorySizeQuery, isConvexConfigured, searchPlayersQuery } from "@/lib/convex";
import type { FavoriteProfile } from "@/lib/recentProfiles";

/**
 * Player lookup by name.
 *
 * The official API has no player search, so this reads the directory the
 * pipeline builds from leaderboards, clan rosters, battle logs and profiles
 * people open. That makes coverage broad but not total, and the page says so
 * rather than implying a miss means the player does not exist.
 */
export default function PlayerSearchPage() {
  const router = useRouter();
  const term = typeof router.query.q === "string" ? router.query.q.trim() : "";
  const personalization = usePersonalization();
  const favorites: FavoriteProfile[] = personalization.profiles
    .filter((profile) => profile.kind === "players")
    .map(({ tag, name, clan }) => ({ kind: "players" as const, tag, name, clan }));

  function onFavoriteToggle(profile: Omit<FavoriteProfile, "kind">) {
    const existing = favorites.some((favorite) => favorite.tag === profile.tag);
    void (existing
      ? personalization.untrack("players", profile.tag)
      : personalization.track({ kind: "players", ...profile }));
  }

  if (!isConvexConfigured) {
    return (
      <Layout>
        <div className="profile-page">
          <FavoritesSection favorites={favorites} onToggle={onFavoriteToggle} />
          <SetupState feature="player search" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Head>
        <title>{term ? `${term} | Player Search` : "Player Search"} | Royale Stats</title>
        <meta name="description" content="Find a Clash Royale player by name or by tag." />
      </Head>
      <div className="profile-page">
        <section className="decks-hero">
          <span className="eyebrow">Player lookup</span>
          <h1>Find a player</h1>
          <p>Search by name, or paste a player tag. Both land on the same profile.</p>
          <ProfileSearch />
          <Link href="/players/compare" className="pink-button">
            Compare two players
          </Link>
        </section>
        <FavoritesSection favorites={favorites} onToggle={onFavoriteToggle} />
        <Results term={term} favorites={favorites} onToggle={onFavoriteToggle} />
      </div>
    </Layout>
  );
}

function FavoritesSection({ favorites, onToggle }: { favorites: FavoriteProfile[]; onToggle: (profile: Omit<FavoriteProfile, "kind">) => void }) {
  return (
    <TableShell
      title="Favorites"
      head={["Player", "Clan", "Trophies", "Favorite", "Open"]}
      note={favorites.length ? "Tracked players are saved locally and sync across paired browsers when available." : "Track a player in the search results to keep them here."}
      empty={!favorites.length}
      emptyMessage="No favorites yet. Star a player in the results below."
    >
      {favorites.map((favorite) => (
        <PlayerRow
          key={favorite.tag}
          tag={favorite.tag}
          name={favorite.name}
          clanName={favorite.clan}
          favorite
          onToggle={() => onToggle(favorite)}
        />
      ))}
    </TableShell>
  );
}

function Results({
  term,
  favorites,
  onToggle
}: {
  term: string;
  favorites: FavoriteProfile[];
  onToggle: (profile: Omit<FavoriteProfile, "kind">) => void;
}) {
  const results = useQuery(searchPlayersQuery, term ? { query: term, limit: 25 } : "skip");
  const directorySize = useQuery(directorySizeQuery, {});

  const known = directorySize ? `${directorySize.toLocaleString()} players` : "the directory";

  if (!term) {
    return (
      <section className="profile-section">
        <h2>Search by name</h2>
        <p className="empty-results">
          Type a player name above. Names come from {known} Royale Stats has seen on leaderboards, in clan rosters and in
          battle logs — a tag always works, and using one adds that player to the directory.
        </p>
      </section>
    );
  }

  if (results === undefined) {
    return (
      <section className="profile-section">
        <h2>Results</h2>
        <p className="empty-results">Searching…</p>
      </section>
    );
  }

  if (!results.players.length) {
    return (
      <section className="profile-section">
        <div className="section-heading">
          <h2>Results</h2>
        </div>
        {results.tag ? (
          <p className="table-note">
            No player named “{term}” is in the directory, but that string is a valid tag.{" "}
            <Link href={`/players/${results.tag}`}>Open #{results.tag}</Link>.
          </p>
        ) : (
          <p className="empty-results">
            No player called “{term}” is in the directory yet. Open them once by tag and their name becomes searchable
            for everyone.
          </p>
        )}
      </section>
    );
  }

  return (
    <TableShell
      title={`Players matching “${term}”`}
      head={["Player", "Clan", "Trophies", "Favorite", "Open"]}
      note={
        <>
          Searching {known}. Names are not unique in Clash Royale — the players seen most often are listed first.
          {results.tag ? (
            <>
              {" "}
              “{term}” is also a valid tag: <Link href={`/players/${results.tag}`}>open #{results.tag}</Link>.
            </>
          ) : null}
        </>
      }
    >
      {results.players.map((hit) => (
        <PlayerRow
          key={hit.tag}
          tag={hit.tag}
          name={hit.name}
          clanName={hit.clanName}
          clanTag={hit.clanTag}
          trophies={hit.trophies}
          favorite={favorites.some((favorite) => favorite.tag === hit.tag)}
          onToggle={() => onToggle({ tag: hit.tag, name: hit.name, clan: hit.clanName })}
        />
      ))}
    </TableShell>
  );
}

function PlayerRow({
  tag,
  name,
  clanName,
  clanTag,
  trophies,
  favorite,
  onToggle
}: {
  tag: string;
  name: string;
  clanName?: string;
  clanTag?: string;
  trophies?: number;
  favorite: boolean;
  onToggle: () => void;
}) {
  return (
    <tr>
      <td>
        <EntityCell href={`/players/${tag}`} name={name} sub={`#${tag}`} />
      </td>
      <td>
        {clanName ? clanTag ? <Link href={`/clans/${clanTag}`}>{clanName}</Link> : clanName : "—"}
      </td>
      {trophies !== undefined ? <td><TrophyCell value={trophies} /></td> : <td>—</td>}
      <td>
        <button
          type="button"
          className={favoriteStyles.toggle}
          aria-label={`${favorite ? "Remove" : "Add"} ${name} ${favorite ? "from" : "to"} favorites`}
          aria-pressed={favorite}
          onClick={onToggle}
        >
          <Star size={18} fill={favorite ? "currentColor" : "none"} />
        </button>
      </td>
      <td>
        <Link href={`/players/${tag}`} className="pink-button">
          Open
        </Link>
      </td>
    </tr>
  );
}
