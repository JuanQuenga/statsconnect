import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Clock3,
  Download,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageStatus } from "@/components/ui-helpers";
import { apiFetch, clubBadgeUrl, profileIconUrl } from "@/lib/api";
import { normalizeTag, readableMode, trophies } from "@/lib/format";
import { appPath } from "@/lib/paths";
import type {
  ClubActivityEvent,
  ClubActivityType,
  ClubCommunityResponse,
  ClubHistoryResponse,
  ClubProfile,
} from "@/lib/types";

type ClubSearch = { tag?: string };
type RosterSort = "trophies" | "name" | "role" | "activity" | "change";

export const Route = createFileRoute("/clubs")({
  validateSearch: (search: Record<string, unknown>): ClubSearch => ({
    tag: typeof search.tag === "string" ? search.tag : undefined,
  }),
  component: ClubsPage,
});

function csvCell(value: string | number | undefined): string {
  const text = value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename: string, rows: Array<Array<string | number | undefined>>) {
  const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDate(timestamp?: number) {
  return timestamp
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp)
    : "Not tracked yet";
}

function relativeAge(timestamp?: number) {
  if (!timestamp) return "Not crawled";
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function eventText(event: ClubActivityEvent) {
  if (event.type === "join") return `joined as ${readableMode(event.toRole || "member")}`;
  if (event.type === "leave") return "left the club";
  if (event.type === "role_change") {
    return `moved from ${readableMode(event.fromRole || "member")} to ${readableMode(event.toRole || "member")}`;
  }
  return `${(event.trophyDelta || 0) >= 0 ? "gained" : "lost"} ${trophies(Math.abs(event.trophyDelta || 0))} trophies`;
}

function eventIcon(type: ClubActivityType) {
  if (type === "join") return <UserPlus className="size-4 text-accent" />;
  if (type === "leave") return <UserMinus className="size-4 text-destructive" />;
  if (type === "role_change") return <ShieldCheck className="size-4 text-chart-3" />;
  return <Activity className="size-4 text-primary" />;
}

function HistoryChart({ history }: { history: ClubHistoryResponse }) {
  const snapshots = history.snapshots;
  if (snapshots.length < 2) {
    return (
      <EmptyState
        title="History starts now"
        detail="Return after future club observations to see trophy and membership trends."
      />
    );
  }
  const width = 720;
  const height = 190;
  const padding = 18;
  const trophyValues = snapshots.map((snapshot) => snapshot.trophies);
  const min = Math.min(...trophyValues);
  const max = Math.max(...trophyValues);
  const spread = Math.max(max - min, 1);
  const points = snapshots.map((snapshot, index) => {
    const x = padding + (index / Math.max(snapshots.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((snapshot.trophies - min) / spread) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");
  const memberPoints = snapshots.map((snapshot, index) => {
    const x = padding + (index / Math.max(snapshots.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (snapshot.memberCount / 30) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Prospective history</p>
          <h3 className="font-display text-2xl">Club trajectory</h3>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span><i className="mr-1.5 inline-block size-2 rounded-full bg-primary" />Trophies</span>
          <span><i className="mr-1.5 inline-block size-2 rounded-full bg-accent" />Members</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-label="Club trophy and member history">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="stroke-border" />
        <polyline points={points} fill="none" className="stroke-primary" strokeWidth="4" strokeLinejoin="round" />
        <polyline points={memberPoints} fill="none" className="stroke-accent" strokeWidth="3" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{new Date(snapshots[0].recordedAt).toLocaleDateString()}</span>
        <span>{trophies(min)}–{trophies(max)} trophies</span>
        <span>{new Date(snapshots.at(-1)!.recordedAt).toLocaleDateString()}</span>
      </div>
    </Card>
  );
}

function CommunityActivity({ data }: { data?: ClubCommunityResponse }) {
  if (!data?.clubs.length) return null;
  return (
    <section>
      <div className="mb-4">
        <p className="eyebrow">Tracked community</p>
        <h2 className="font-display text-3xl">Recently observed clubs</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.clubs.slice(0, 6).map((club) => (
          <Link key={club.tag} to="/clubs" search={{ tag: club.tag }} className="data-surface flex items-center gap-4 p-4 transition hover:border-primary/60">
            <img src={clubBadgeUrl(club.badgeId)} alt="" className="size-12" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{club.name}</p>
              <p className="text-xs text-muted-foreground">{club.memberCount}/30 · {trophies(club.trophies)} trophies</p>
            </div>
            <div className="text-right text-xs">
              <p className="text-accent">{club.activity7d} changes</p>
              <p className={club.trophyChange7d >= 0 ? "text-primary" : "text-destructive"}>
                {club.trophyChange7d >= 0 ? "+" : ""}{trophies(club.trophyChange7d)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ClubsPage() {
  const { tag: rawTag } = Route.useSearch();
  const [draft, setDraft] = useState(rawTag || "");
  const [rosterSearch, setRosterSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [rosterSort, setRosterSort] = useState<RosterSort>("trophies");
  const [eventFilter, setEventFilter] = useState<ClubActivityType | "all">("all");
  const tag = rawTag ? normalizeTag(rawTag) : null;

  const clubQuery = useQuery({
    queryKey: ["club", tag],
    enabled: Boolean(tag),
    queryFn: () => apiFetch<ClubProfile>(`/api/club?tag=${encodeURIComponent(tag!)}`),
  });
  const historyQuery = useQuery({
    queryKey: ["club-history", tag],
    enabled: Boolean(tag && clubQuery.data),
    queryFn: () => apiFetch<ClubHistoryResponse>(`/api/club-history?tag=${encodeURIComponent(tag!)}`),
  });
  const communityQuery = useQuery({
    queryKey: ["club-community"],
    queryFn: () => apiFetch<ClubCommunityResponse>("/api/clubs/activity?limit=20"),
  });

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const next = normalizeTag(draft);
    if (next) window.location.assign(appPath(`/clubs?tag=${encodeURIComponent(next)}`));
  }

  const club = clubQuery.data;
  const liveMembers = club?.members || [];
  const history = historyQuery.data;
  const trackedByTag = new Map((history?.roster || []).map((member) => [member.tag, member]));
  const trophyChangeByTag = useMemo(() => {
    const changes = new Map<string, number>();
    for (const event of history?.events || []) {
      changes.set(event.playerTag, (changes.get(event.playerTag) || 0) + (event.trophyDelta || 0));
    }
    return changes;
  }, [history?.events]);
  const roles = [...new Set(liveMembers.map((member) => member.role || "member"))].sort();
  const members = liveMembers
    .filter((member) => {
      const query = rosterSearch.trim().toLowerCase();
      return (!query || member.name.toLowerCase().includes(query) || member.tag.toLowerCase().includes(query))
        && (roleFilter === "all" || (member.role || "member") === roleFilter);
    })
    .sort((a, b) => {
      if (rosterSort === "name") return a.name.localeCompare(b.name);
      if (rosterSort === "role") return (a.role || "member").localeCompare(b.role || "member");
      if (rosterSort === "activity") return (trackedByTag.get(b.tag)?.lastProfileAt || 0) - (trackedByTag.get(a.tag)?.lastProfileAt || 0);
      if (rosterSort === "change") return (trophyChangeByTag.get(b.tag) || 0) - (trophyChangeByTag.get(a.tag) || 0);
      return b.trophies - a.trophies;
    });
  const average = liveMembers.length
    ? Math.round(liveMembers.reduce((total, member) => total + member.trophies, 0) / liveMembers.length)
    : 0;
  const filteredEvents = (history?.events || []).filter((event) => eventFilter === "all" || event.type === eventFilter);

  function exportRoster() {
    downloadCsv(`${(club?.name || "club").replaceAll(" ", "-")}-roster.csv`, [
      ["Name", "Tag", "Role", "Trophies", "Tracked trophy change", "First seen", "Last profile crawl"],
      ...members.map((member) => {
        const tracked = trackedByTag.get(member.tag);
        return [member.name, member.tag, member.role, member.trophies, trophyChangeByTag.get(member.tag) || 0, formatDate(tracked?.firstSeenAt), formatDate(tracked?.lastProfileAt)];
      }),
    ]);
  }

  function exportActivity() {
    downloadCsv(`${(club?.name || "club").replaceAll(" ", "-")}-activity.csv`, [
      ["Date", "Player", "Tag", "Event", "From role", "To role", "From trophies", "To trophies", "Delta"],
      ...filteredEvents.map((event) => [formatDate(event.recordedAt), event.playerName, event.playerTag, event.type, event.fromRole, event.toRole, event.fromTrophies, event.toTrophies, event.trophyDelta]),
    ]);
  }

  return (
    <div className="page-shell">
      <div>
        <p className="eyebrow">Club intelligence</p>
        <h1 className="font-display text-4xl">Clubs & activity</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Live rosters plus prospective trophy, membership, role, and member activity tracking.</p>
        <form onSubmit={onSearch} className="mt-4 flex max-w-lg gap-2">
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="#CLUB_TAG" className="h-10" />
          <Button type="submit">Load</Button>
        </form>
      </div>

      {!tag ? <EmptyState title="Enter a club tag" detail="Load its live roster and begin tracking changes from this observation forward." /> : null}
      {tag && clubQuery.isLoading ? <PageStatus tone="loading">Loading club profile…</PageStatus> : null}
      {clubQuery.error ? <PageStatus tone="error">{clubQuery.error instanceof Error ? clubQuery.error.message : "Failed to load club."}</PageStatus> : null}

      {club ? (
        <>
          <Card className="grid gap-6 p-6 py-6 md:grid-cols-[auto_1fr]">
            <img src={clubBadgeUrl(club.badgeId)} alt="" className="size-24" />
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-4xl">{club.name}</h2>
                  <p className="text-muted-foreground">{club.tag} · {readableMode(club.type || "unknown")}</p>
                </div>
                {history?.trackedSinceAt ? <Badge variant="outline"><Clock3 /> Tracking since {new Date(history.trackedSinceAt).toLocaleDateString()}</Badge> : null}
              </div>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{club.description || "No club description."}</p>
              <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-4">
                {[
                  ["Trophies", trophies(club.trophies || 0)],
                  ["Required", trophies(club.requiredTrophies || 0)],
                  ["Members", `${liveMembers.length}/30`],
                  ["Average", trophies(average)],
                ].map(([label, value]) => (
                  <div key={label} className="border-t border-border pt-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-2xl text-primary">{value}</p></div>
                ))}
              </div>
            </div>
          </Card>

          {historyQuery.isLoading ? <PageStatus tone="loading">Loading tracked club activity…</PageStatus> : null}
          {historyQuery.error ? <PageStatus tone="error">Live profile loaded, but tracked history is temporarily unavailable.</PageStatus> : null}

          {history ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                { Icon: Users, label: "Active roster", value: history.summary.activeMembers, color: "text-chart-3" },
                { Icon: UserPlus, label: "Joins", value: history.summary.joins, color: "text-accent" },
                { Icon: UserMinus, label: "Leaves", value: history.summary.leaves, color: "text-destructive" },
                { Icon: ShieldCheck, label: "Role moves", value: history.summary.roleChanges, color: "text-chart-3" },
                { Icon: history.summary.trophyChange >= 0 ? TrendingUp : TrendingDown, label: "Member movement", value: `${history.summary.trophyChange >= 0 ? "+" : ""}${trophies(history.summary.trophyChange)}`, color: history.summary.trophyChange >= 0 ? "text-primary" : "text-destructive" },
              ].map(({ Icon, label, value, color }) => (
                <Card key={label} className="p-4"><Icon className={`mb-3 size-5 ${color}`} /><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-2xl">{value}</p></Card>
              ))}
            </div>
          ) : null}

          {history ? <HistoryChart history={history} /> : null}

          <Tabs defaultValue="roster">
            <TabsList>
              <TabsTrigger value="roster">Roster</TabsTrigger>
              <TabsTrigger value="activity">Activity {history?.events.length ? `(${history.events.length})` : ""}</TabsTrigger>
            </TabsList>
            <TabsContent value="roster" className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <Input value={rosterSearch} onChange={(event) => setRosterSearch(event.target.value)} placeholder="Filter name or tag" className="lg:max-w-xs" />
                <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value || "all")}><SelectTrigger><SelectValue placeholder="All roles" /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem>{roles.map((role) => <SelectItem key={role} value={role}>{readableMode(role)}</SelectItem>)}</SelectContent></Select>
                <Select value={rosterSort} onValueChange={(value) => setRosterSort((value || "trophies") as RosterSort)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="trophies">Sort: trophies</SelectItem><SelectItem value="change">Sort: tracked change</SelectItem><SelectItem value="activity">Sort: last profile crawl</SelectItem><SelectItem value="name">Sort: name</SelectItem><SelectItem value="role">Sort: role</SelectItem></SelectContent></Select>
                <Button type="button" variant="outline" className="lg:ml-auto" onClick={exportRoster}><Download /> Export roster CSV</Button>
              </div>
              <div className="data-surface overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Role</TableHead><TableHead>Last tracked profile</TableHead><TableHead className="text-right">Tracked change</TableHead><TableHead className="text-right">Trophies</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {members.map((member) => {
                      const tracked = trackedByTag.get(member.tag);
                      const change = trophyChangeByTag.get(member.tag) || 0;
                      const staleDays = tracked?.lastProfileAt ? Math.floor((Date.now() - tracked.lastProfileAt) / 86_400_000) : null;
                      return (
                        <TableRow key={member.tag}>
                          <TableCell><div className="flex items-center gap-3"><img src={profileIconUrl(member.icon?.id)} alt="" className="size-9 rounded-full" /><div><Link to="/players" search={{ tag: member.tag }} className="font-medium hover:text-primary">{member.name}</Link><p className="text-xs text-muted-foreground">{member.tag}</p></div></div></TableCell>
                          <TableCell>{readableMode(member.role || "member")}</TableCell>
                          <TableCell><span className={staleDays !== null && staleDays >= 7 ? "text-destructive" : "text-muted-foreground"}>{relativeAge(tracked?.lastProfileAt)}</span>{staleDays !== null && staleDays >= 7 ? <Badge variant="destructive" className="ml-2">Inactive signal</Badge> : null}</TableCell>
                          <TableCell className={`text-right ${change > 0 ? "text-accent" : change < 0 ? "text-destructive" : "text-muted-foreground"}`}>{change > 0 ? "+" : ""}{trophies(change)}</TableCell>
                          <TableCell className="text-right text-primary">{trophies(member.trophies)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {!members.length ? <EmptyState title="No roster matches" detail="Adjust the name, tag, or role filters." /> : null}
              <p className="text-xs text-muted-foreground">“Inactive signal” means the member has no recent tracked profile snapshot; the official API does not expose a true last-online timestamp.</p>
            </TabsContent>
            <TabsContent value="activity" className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(["all", "join", "leave", "role_change", "trophy_change"] as const).map((type) => <Button key={type} type="button" variant={eventFilter === type ? "default" : "outline"} size="sm" onClick={() => setEventFilter(type)}>{type === "all" ? "All changes" : readableMode(type)}</Button>)}
                <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={exportActivity}><Download /> Export activity CSV</Button>
              </div>
              <div className="space-y-2">
                {filteredEvents.map((event, index) => <div key={`${event.recordedAt}-${event.playerTag}-${event.type}-${index}`} className="data-surface flex gap-3 p-4"><div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">{eventIcon(event.type)}</div><div className="min-w-0 flex-1"><p><Link to="/players" search={{ tag: event.playerTag }} className="font-medium hover:text-primary">{event.playerName}</Link> <span className="text-muted-foreground">{eventText(event)}</span></p><p className="mt-1 text-xs text-muted-foreground">{formatDate(event.recordedAt)} · {event.playerTag}</p></div></div>)}
              </div>
              {!filteredEvents.length ? <EmptyState title="No recorded changes yet" detail="This club has a baseline. Joins, leaves, role transitions, and trophy movement will appear after future observations." /> : null}
            </TabsContent>
          </Tabs>
        </>
      ) : null}

      <CommunityActivity data={communityQuery.data} />
    </div>
  );
}
