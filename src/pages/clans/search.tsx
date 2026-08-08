import Head from "next/head";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { Search } from "lucide-react";
import { Layout } from "@/components/portfolio/Layout";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { EntityCell, TableShell, TrophyCell } from "@/components/portfolio/DataTable";
import { badgeImage, NO_CLAN_BADGE_IMAGE } from "@/lib/clash/assets";
import { errorMessage, isConvexConfigured, searchClansAction } from "@/lib/convex";

type Filters = { name: string; minMembers?: number; minScore?: number };

export default function ClanSearchPage() {
  if (!isConvexConfigured) {
    return (
      <Layout>
        <SetupState feature="clan search" />
      </Layout>
    );
  }
  return <ClanSearch />;
}

function ClanSearch() {
  const router = useRouter();
  const searchClans = useAction(searchClansAction);
  const [draft, setDraft] = useState<Filters>({ name: "" });
  const [submitted, setSubmitted] = useState<Filters | null>(null);

  // `/clans/search?name=…` is where the site-wide search box sends a clan name,
  // so arriving with one should run the search rather than just prefill it.
  const seed = typeof router.query.name === "string" ? router.query.name.trim() : "";
  useEffect(() => {
    if (!router.isReady || !seed) return;
    setDraft({ name: seed });
    setSubmitted({ name: seed });
  }, [router.isReady, seed]);

  const query = useQuery({
    queryKey: ["clan-search", submitted],
    queryFn: async () => {
      if (!submitted) return [];
      const payload = await searchClans({
        name: submitted.name || undefined,
        minMembers: submitted.minMembers,
        minScore: submitted.minScore,
        limit: 50
      });
      return payload.results.data.items ?? [];
    },
    enabled: Boolean(submitted),
    retry: false
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted({ ...draft });
  }

  return (
    <Layout>
      <Head>
        <title>Clan Search | Clash Crown</title>
        <meta name="description" content="Find Clash Royale clans by name, size and clan score." />
      </Head>
      <div className="profile-page">
        <section className="decks-hero">
          <span className="eyebrow">Official clan directory</span>
          <h1>Find a Clan</h1>
          <p>Search the live clan directory by name, then filter by size and score.</p>
        </section>

        <section className="profile-section">
          <form className="search-filters" onSubmit={submit}>
            <label className="card-search">
              <Search size={18} />
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Clan name (min 3 characters)"
                aria-label="Clan name"
              />
            </label>
            <label className="rarity-filter">
              <span className="sr-only">Minimum members</span>
              <select
                value={draft.minMembers ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, minMembers: event.target.value ? Number(event.target.value) : undefined }))
                }
              >
                <option value="">Any size</option>
                <option value="10">10+ members</option>
                <option value="25">25+ members</option>
                <option value="40">40+ members</option>
              </select>
            </label>
            <label className="rarity-filter">
              <span className="sr-only">Minimum clan score</span>
              <select
                value={draft.minScore ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, minScore: event.target.value ? Number(event.target.value) : undefined }))
                }
              >
                <option value="">Any score</option>
                <option value="20000">20,000+</option>
                <option value="40000">40,000+</option>
                <option value="60000">60,000+</option>
              </select>
            </label>
            <button type="submit" className="pink-button">
              Search
            </button>
          </form>
          <p className="table-note">
            Searches the live directory the game itself uses, so a clan created a minute ago is already findable. Looking
            for a person instead? <Link href="/players">Find a player</Link>.
          </p>
        </section>

        {query.isLoading && submitted ? <LoadingState label="clans" /> : null}
        {query.error ? <ErrorState message={errorMessage(query.error)} /> : null}
        {query.data ? (
          <TableShell
            title="Results"
            head={["Clan", "Members", "Score", "Required", "War Trophies"]}
            empty={!query.data.length}
            note={query.data.length ? `${query.data.length} clans found.` : undefined}
            emptyMessage={`No clan matches “${submitted?.name ?? ""}” with those filters. Clan names must match at least three characters, and the size and score filters are applied on top of the name.`}
          >
            {query.data.map((clan) => (
              <tr key={clan.tag}>
                <td>
                  <EntityCell
                    href={`/clans/${clan.tag.replace(/^#/, "")}`}
                    name={clan.name}
                    badge={badgeImage(clan.badgeId, clan.badgeUrls)}
                    badgeFallback={NO_CLAN_BADGE_IMAGE}
                    sub={clan.location?.name}
                  />
                </td>
                <td>{clan.members ?? "—"} / 50</td>
                <td>
                  <TrophyCell value={clan.clanScore} />
                </td>
                <td>{(clan.requiredTrophies ?? 0).toLocaleString()}</td>
                <td>{(clan.clanWarTrophies ?? 0).toLocaleString()}</td>
              </tr>
            ))}
          </TableShell>
        ) : null}
      </div>
    </Layout>
  );
}
