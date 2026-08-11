import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { apiFetch, clubBadgeUrl, profileIconUrl } from "@/lib/api";
import { normalizeTag, readableMode, trophies } from "@/lib/format";
import type { ClubProfile } from "@/lib/types";

type ClubSearch = { tag?: string };

export const Route = createFileRoute("/clubs")({
  validateSearch: (search: Record<string, unknown>): ClubSearch => ({
    tag: typeof search.tag === "string" ? search.tag : undefined,
  }),
  component: ClubsPage,
});

function ClubsPage() {
  const { tag: rawTag } = Route.useSearch();
  const [draft, setDraft] = useState(rawTag || "");
  const tag = rawTag ? normalizeTag(rawTag) : null;

  const clubQuery = useQuery({
    queryKey: ["club", tag],
    enabled: Boolean(tag),
    queryFn: () => apiFetch<ClubProfile>(`/api/club?tag=${encodeURIComponent(tag!)}`),
  });

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const next = normalizeTag(draft);
    if (!next) return;
    window.location.assign(`/clubs?tag=${encodeURIComponent(next)}`);
  }

  const club = clubQuery.data;
  const members = [...(club?.members || [])].sort((a, b) => b.trophies - a.trophies);
  const average = members.length
    ? Math.round(members.reduce((total, member) => total + member.trophies, 0) / members.length)
    : 0;
  const buckets = [
    ["50k+ trophies", members.filter((m) => m.trophies >= 50000).length],
    ["30k–49k trophies", members.filter((m) => m.trophies >= 30000 && m.trophies < 50000).length],
    ["Under 30k trophies", members.filter((m) => m.trophies < 30000).length],
  ] as const;

  return (
    <div className="page-shell">
      <div>
        <p className="eyebrow">Club profile</p>
        <h1 className="font-display text-4xl">Clubs & bands</h1>
        <form onSubmit={onSearch} className="mt-4 flex max-w-lg gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="#CLUB_TAG" className="h-10" />
          <Button type="submit">Load</Button>
        </form>
      </div>

      {!tag ? <EmptyState title="Enter a club tag" detail="Load a live club roster from the official API." /> : null}
      {tag && clubQuery.isLoading ? <PageStatus tone="loading">Loading club profile…</PageStatus> : null}
      {clubQuery.error ? (
        <PageStatus tone="error">{clubQuery.error instanceof Error ? clubQuery.error.message : "Failed to load club."}</PageStatus>
      ) : null}

      {club ? (
        <>
          <Card className="grid gap-6 p-6 py-6 md:grid-cols-[auto_1fr]">
            <img src={clubBadgeUrl(club.badgeId)} alt="" className="size-24" />
            <div>
              <h2 className="font-display text-4xl">{club.name}</h2>
              <p className="text-muted-foreground">
                {club.tag} · {readableMode(club.type || "unknown")}
              </p>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{club.description || "No club description."}</p>
              <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-4">
                {[
                  ["Trophies", trophies(club.trophies || 0)],
                  ["Required", trophies(club.requiredTrophies || 0)],
                  ["Members", `${members.length}/30`],
                  ["Average", trophies(average)],
                ].map(([label, value]) => (
                  <div key={label} className="border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-display text-2xl text-primary">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 font-display text-2xl">Top members</h3>
              <div className="space-y-2">
                {members.slice(0, 3).map((member) => (
                  <div key={member.tag} className="data-surface px-4 py-3">
                    <p className="font-medium">{member.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {trophies(member.trophies)} trophies · {readableMode(member.role)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-3 font-display text-2xl">Trophy distribution</h3>
              <div className="space-y-3">
                {buckets.map(([label, count]) => (
                  <div key={label}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{label}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${members.length ? Math.round((count / members.length) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-4 font-display text-2xl">Roster</h3>
            <div className="data-surface overflow-hidden">
              <Table>
                <TableBody>
                  {members.map((member, index) => (
                    <TableRow key={member.tag}>
                      <TableCell className="w-10 px-3 text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="w-12 px-0">
                        <img src={profileIconUrl(member.icon?.id)} alt="" className="size-8 rounded-full" />
                      </TableCell>
                      <TableCell>
                        <Link to="/players" search={{ tag: member.tag }} className="font-medium hover:text-primary">
                          {member.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {readableMode(member.role)} · {member.tag}
                        </p>
                      </TableCell>
                      <TableCell className="px-3 text-right text-primary">{trophies(member.trophies)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
