import Head from "@/components/Head";
import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { Search } from "lucide-react";
import { Layout } from "@/components/portfolio/Layout";
import { ErrorState, LoadingState, SetupState } from "@/components/portfolio/AsyncState";
import { TableShell } from "@/components/portfolio/DataTable";
import { formatApiDate } from "@/lib/clash/format";
import type { ApiTournament } from "@/lib/clash/types";
import { errorMessage, globalTournamentsAction, isConvexConfigured, searchTournamentsAction } from "@/lib/convex";

export default function TournamentsPage() {
  if (!isConvexConfigured) {
    return (
      <Layout>
        <SetupState feature="tournaments" />
      </Layout>
    );
  }
  return <Tournaments />;
}

function Tournaments() {
  const getGlobal = useAction(globalTournamentsAction);
  const searchTournaments = useAction(searchTournamentsAction);
  const [draft, setDraft] = useState("");
  const [term, setTerm] = useState("");

  const globalQuery = useQuery({
    queryKey: ["global-tournaments"],
    queryFn: async () => (await getGlobal({})).tournaments.data.items ?? [],
    retry: false
  });

  const searchQuery = useQuery({
    queryKey: ["tournament-search", term],
    queryFn: async () => (await searchTournaments({ name: term, limit: 50 })).tournaments.data.items ?? [],
    enabled: term.length >= 3,
    retry: false
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTerm(draft.trim());
  }

  return (
    <Layout>
      <Head>
        <title>Tournaments | StatsConnect · Clash Royale statistics</title>
        <meta name="description" content="Live Global Tournaments and open community tournaments in Clash Royale." />
      </Head>
      <div className="profile-page">
        <section className="decks-hero">
          <h1>Tournaments</h1>
          <p>Supercell&rsquo;s Global Tournaments, plus open community tournaments you can search by name.</p>
        </section>

        {globalQuery.isLoading ? <LoadingState label="tournaments" /> : null}
        {globalQuery.error ? <ErrorState message={errorMessage(globalQuery.error)} /> : null}
        {globalQuery.data ? (
          <TournamentTable
            title="Global Tournaments"
            rows={globalQuery.data}
            note={globalQuery.data.length ? "Run by Supercell, roughly twice a month." : undefined}
            emptyMessage="No Global Tournament is running right now. Supercell starts one roughly twice a month — search below for a community tournament you can join in the meantime."
          />
        ) : null}

        <section className="profile-section">
          <h2>Search community tournaments</h2>
          <form className="search-filters" onSubmit={submit}>
            <label className="card-search">
              <Search size={18} />
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Tournament name (min 3 characters)"
                aria-label="Tournament name"
              />
            </label>
            <button type="submit" className="pink-button">
              Search
            </button>
          </form>
        </section>

        {searchQuery.isLoading && term.length >= 3 ? <LoadingState label="tournaments" /> : null}
        {searchQuery.error ? <ErrorState message={errorMessage(searchQuery.error)} /> : null}
        {searchQuery.data ? (
          <TournamentTable
            title="Search results"
            rows={searchQuery.data}
            emptyMessage={`No open tournament matches “${term}”. The API only returns tournaments that are still accepting players, so a full or finished one will not show up here.`}
          />
        ) : null}
      </div>
    </Layout>
  );
}

function TournamentTable({
  title,
  rows,
  note,
  emptyMessage
}: {
  title: string;
  rows: ApiTournament[];
  note?: string;
  emptyMessage?: string;
}) {
  return (
    <TableShell
      title={title}
      head={["Name", "Status", "Players", "Level cap", "Starts", "Prize"]}
      empty={!rows.length}
      note={note}
      emptyMessage={emptyMessage}
    >
      {rows.map((tournament) => (
        <tr key={tournament.tag}>
          <td>
            <strong>{tournament.name ?? tournament.tag}</strong>
          </td>
          <td>
            <span className={`status-chip status-${(tournament.status ?? "unknown").toLowerCase()}`}>
              {humanize(tournament.status)}
            </span>
          </td>
          <td>
            {tournament.capacity ?? 0} / {tournament.maxCapacity ?? 0}
          </td>
          <td>{tournament.levelCap ?? "—"}</td>
          <td>{tournament.startedTime ? formatApiDate(tournament.startedTime) : formatApiDate(tournament.createdTime)}</td>
          <td>{tournament.firstPlaceCardPrize ? `${tournament.firstPlaceCardPrize.toLocaleString()} cards` : "—"}</td>
        </tr>
      ))}
    </TableShell>
  );
}

function humanize(value?: string) {
  if (!value) return "Unknown";
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}
