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
import { clubBadgeUrl, profileIconUrl } from "@/lib/artwork";
import { brawlData } from "@/lib/game-data";
import { normalizeTag, readableMode, trophies } from "@/lib/format";
import { appPath } from "@/lib/paths";
import type {
  ClubActivityEvent,
  ClubActivityType,
  ClubCommunityResponse,
  ClubHistoryResponse,
} from "@/lib/types";
import { useI18n, type Translator } from "@/lib/i18n";

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

function formatDate(timestamp: number | undefined, locale: string, t: Translator) {
  return timestamp
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(timestamp)
    : t("common.notTracked");
}

function relativeAge(timestamp: number | undefined, t: Translator) {
  if (!timestamp) return t("common.notCrawled");
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days <= 0) return t("common.today");
  if (days === 1) return t("common.oneDayAgo");
  return t("common.daysAgo", { count: days });
}

function eventText(event: ClubActivityEvent, t: Translator) {
  if (event.type === "join") return t("club.joined", { role: readableMode(event.toRole || "member") });
  if (event.type === "leave") return t("club.left");
  if (event.type === "role_change") {
    return t("club.roleMoved", { from: readableMode(event.fromRole || "member"), to: readableMode(event.toRole || "member") });
  }
  return t((event.trophyDelta || 0) >= 0 ? "club.gained" : "club.lost", { count: trophies(Math.abs(event.trophyDelta || 0)) });
}

function eventIcon(type: ClubActivityType) {
  if (type === "join") return <UserPlus className="size-4 text-accent" />;
  if (type === "leave") return <UserMinus className="size-4 text-destructive" />;
  if (type === "role_change") return <ShieldCheck className="size-4 text-chart-3" />;
  return <Activity className="size-4 text-primary" />;
}

function HistoryChart({ history }: { history: ClubHistoryResponse }) {
  const { t, date } = useI18n();
  const snapshots = history.snapshots;
  if (snapshots.length < 2) {
    return (
      <EmptyState
        title={t("club.historyStarts")}
        detail={t("club.historyStartsDetail")}
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
          <h3 className="font-display text-2xl">{t("club.trajectory")}</h3>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span><i className="mr-1.5 inline-block size-2 rounded-full bg-primary" />{t("common.trophies")}</span>
          <span><i className="mr-1.5 inline-block size-2 rounded-full bg-accent" />{t("common.members")}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-label={t("club.historyAria")}>
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="stroke-border" />
        <polyline points={points} fill="none" className="stroke-primary" strokeWidth="4" strokeLinejoin="round" />
        <polyline points={memberPoints} fill="none" className="stroke-accent" strokeWidth="3" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{date(snapshots[0].recordedAt)}</span>
        <span>{trophies(min)}–{trophies(max)} {t("common.trophies").toLocaleLowerCase()}</span>
        <span>{date(snapshots.at(-1)!.recordedAt)}</span>
      </div>
    </Card>
  );
}

function CommunityActivity({ data }: { data?: ClubCommunityResponse }) {
  const { t } = useI18n();
  if (!data?.clubs.length) return null;
  return (
    <section>
      <div className="mb-4">
        <h2 className="font-display text-3xl">{t("club.recent")}</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.clubs.slice(0, 6).map((club) => (
          <Link key={club.tag} to="/clubs" search={{ tag: club.tag }} className="data-surface flex items-center gap-4 p-4 transition hover:border-primary/60">
            <img src={clubBadgeUrl(club.badgeId)} alt="" className="size-12" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{club.name}</p>
              <p className="text-xs text-muted-foreground">{club.memberCount}/30 · {trophies(club.trophies)} {t("common.trophies").toLocaleLowerCase()}</p>
            </div>
            <div className="text-right text-xs">
              <p className="text-accent">{t("club.changes", { count: club.activity7d })}</p>
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
  const { t, locale, date } = useI18n();
  const { tag: rawTag } = Route.useSearch();
  const [draft, setDraft] = useState(rawTag || "");
  const [rosterSearch, setRosterSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [rosterSort, setRosterSort] = useState<RosterSort>("trophies");
  const [eventFilter, setEventFilter] = useState<ClubActivityType | "all">("all");
  const tag = rawTag ? normalizeTag(rawTag) : null;

  const clubQuery = useQuery({
    ...brawlData.club(tag),
    enabled: Boolean(tag),
  });
  const historyQuery = useQuery({
    ...brawlData.clubHistory(tag),
    enabled: Boolean(tag && clubQuery.data),
  });
  const communityQuery = useQuery(brawlData.clubCommunity(20));

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const next = normalizeTag(draft);
    if (next) window.location.assign(appPath(`/clubs?tag=${encodeURIComponent(next)}`));
  }

  const club = clubQuery.data;
  const liveMembers = club?.members || [];
  const historyData = historyQuery.data;
  const historyRoster = historyData?.roster;
  const historyEvents = historyData?.events;
  const trackedByTag = useMemo(
    () => new Map((historyRoster || []).map((member) => [member.tag, member])),
    [historyRoster],
  );
  const trophyChangeByTag = useMemo(() => {
    const changes = new Map<string, number>();
    for (const event of historyEvents || []) {
      changes.set(event.playerTag, (changes.get(event.playerTag) || 0) + (event.trophyDelta || 0));
    }
    return changes;
  }, [historyEvents]);
  const roles = useMemo(
    () => [...new Set(liveMembers.map((member) => member.role || "member"))].sort(),
    [liveMembers],
  );
  const members = useMemo(
    () => liveMembers
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
      }),
    [liveMembers, roleFilter, rosterSearch, rosterSort, trophyChangeByTag, trackedByTag],
  );
  const history = historyData;
  const average = liveMembers.length
    ? Math.round(liveMembers.reduce((total, member) => total + member.trophies, 0) / liveMembers.length)
    : 0;
  const filteredEvents = useMemo(
    () => (historyEvents || []).filter((event) => eventFilter === "all" || event.type === eventFilter),
    [eventFilter, historyEvents],
  );

  function exportRoster() {
    downloadCsv(`${(club?.name || "club").replaceAll(" ", "-")}-roster.csv`, [
      [t("common.name"), t("common.tag"), t("common.role"), t("common.trophies"), t("club.trackedChange"), t("club.firstSeen"), t("club.lastProfile")],
      ...members.map((member) => {
        const tracked = trackedByTag.get(member.tag);
        return [member.name, member.tag, member.role, member.trophies, trophyChangeByTag.get(member.tag) || 0, formatDate(tracked?.firstSeenAt, locale, t), formatDate(tracked?.lastProfileAt, locale, t)];
      }),
    ]);
  }

  function exportActivity() {
    downloadCsv(`${(club?.name || "club").replaceAll(" ", "-")}-activity.csv`, [
      [t("common.date"), t("common.player"), t("common.tag"), t("common.event"), t("club.fromRole"), t("club.toRole"), t("club.fromTrophies"), t("club.toTrophies"), t("club.delta")],
      ...filteredEvents.map((event) => [formatDate(event.recordedAt, locale, t), event.playerName, event.playerTag, event.type, event.fromRole, event.toRole, event.fromTrophies, event.toTrophies, event.trophyDelta]),
    ]);
  }

  return (
    <div className="page-shell">
      <div className="page-intro">
        <h1 className="font-display text-4xl">{t("club.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("club.description")}</p>
        <form onSubmit={onSearch} className="mt-4 flex max-w-lg gap-2">
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="#CLUB_TAG" aria-label={t("club.enter")} className="h-10" />
          <Button type="submit">{t("common.load")}</Button>
        </form>
      </div>

      {!tag ? <EmptyState title={t("club.enter")} detail={t("club.enterDetail")} /> : null}
      {tag && clubQuery.isLoading ? <PageStatus tone="loading">{t("club.loading")}</PageStatus> : null}
      {clubQuery.error ? <PageStatus tone="error">{clubQuery.error instanceof Error ? clubQuery.error.message : t("club.loadFailed")}</PageStatus> : null}

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
                {history?.trackedSinceAt ? <Badge variant="outline"><Clock3 /> {t("club.trackingSince", { date: date(history.trackedSinceAt) })}</Badge> : null}
              </div>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{club.description || t("club.noDescription")}</p>
              <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-4">
                {[
                  [t("common.trophies"), trophies(club.trophies || 0)],
                  [t("common.required"), trophies(club.requiredTrophies || 0)],
                  [t("common.members"), `${liveMembers.length}/30`],
                  [t("common.average"), trophies(average)],
                ].map(([label, value]) => (
                  <div key={label} className="border-t border-border pt-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-2xl text-primary">{value}</p></div>
                ))}
              </div>
            </div>
          </Card>

          {historyQuery.isLoading ? <PageStatus tone="loading">{t("club.loadingActivity")}</PageStatus> : null}
          {historyQuery.error ? <PageStatus tone="error">{t("club.activityUnavailable")}</PageStatus> : null}

          {history ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                { Icon: Users, label: t("club.activeRoster"), value: history.summary.activeMembers, color: "text-chart-3" },
                { Icon: UserPlus, label: t("club.joins"), value: history.summary.joins, color: "text-accent" },
                { Icon: UserMinus, label: t("club.leaves"), value: history.summary.leaves, color: "text-destructive" },
                { Icon: ShieldCheck, label: t("club.roleMoves"), value: history.summary.roleChanges, color: "text-chart-3" },
                { Icon: history.summary.trophyChange >= 0 ? TrendingUp : TrendingDown, label: t("club.memberMovement"), value: `${history.summary.trophyChange >= 0 ? "+" : ""}${trophies(history.summary.trophyChange)}`, color: history.summary.trophyChange >= 0 ? "text-primary" : "text-destructive" },
              ].map(({ Icon, label, value, color }) => (
                <Card key={label} className="p-4"><Icon className={`mb-3 size-5 ${color}`} /><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-2xl">{value}</p></Card>
              ))}
            </div>
          ) : null}

          {history ? <HistoryChart history={history} /> : null}

          <Tabs defaultValue="roster">
            <TabsList>
              <TabsTrigger value="roster">{t("club.roster")}</TabsTrigger>
              <TabsTrigger value="activity">{t("club.activity")} {history?.events.length ? `(${history.events.length})` : ""}</TabsTrigger>
            </TabsList>
            <TabsContent value="roster" className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <Input value={rosterSearch} onChange={(event) => setRosterSearch(event.target.value)} placeholder={t("club.filterRoster")} aria-label={t("club.filterRoster")} className="lg:max-w-xs" />
                <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value || "all")}><SelectTrigger aria-label={t("club.allRoles")}><SelectValue placeholder={t("club.allRoles")} /></SelectTrigger><SelectContent><SelectItem value="all">{t("club.allRoles")}</SelectItem>{roles.map((role) => <SelectItem key={role} value={role}>{readableMode(role)}</SelectItem>)}</SelectContent></Select>
                <Select value={rosterSort} onValueChange={(value) => setRosterSort((value || "trophies") as RosterSort)}><SelectTrigger aria-label={t("club.sortTrophies")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="trophies">{t("club.sortTrophies")}</SelectItem><SelectItem value="change">{t("club.sortChange")}</SelectItem><SelectItem value="activity">{t("club.sortActivity")}</SelectItem><SelectItem value="name">{t("club.sortName")}</SelectItem><SelectItem value="role">{t("club.sortRole")}</SelectItem></SelectContent></Select>
                <Button type="button" variant="outline" className="lg:ml-auto" onClick={exportRoster}><Download /> {t("club.exportRoster")}</Button>
              </div>
              <div className="data-surface overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>{t("club.member")}</TableHead><TableHead>{t("common.role")}</TableHead><TableHead>{t("club.lastProfile")}</TableHead><TableHead className="text-right">{t("club.trackedChange")}</TableHead><TableHead className="text-right">{t("common.trophies")}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {members.map((member) => {
                      const tracked = trackedByTag.get(member.tag);
                      const change = trophyChangeByTag.get(member.tag) || 0;
                      const staleDays = tracked?.lastProfileAt ? Math.floor((Date.now() - tracked.lastProfileAt) / 86_400_000) : null;
                      return (
                        <TableRow key={member.tag}>
                          <TableCell><div className="flex items-center gap-3"><img src={profileIconUrl(member.icon?.id)} alt="" className="size-9 rounded-full" /><div><Link to="/players" search={{ tag: member.tag }} className="font-display hover:text-primary">{member.name}</Link><p className="text-xs text-muted-foreground">{member.tag}</p></div></div></TableCell>
                          <TableCell>{readableMode(member.role || "member")}</TableCell>
                          <TableCell><span className={staleDays !== null && staleDays >= 7 ? "text-destructive" : "text-muted-foreground"}>{relativeAge(tracked?.lastProfileAt, t)}</span>{staleDays !== null && staleDays >= 7 ? <Badge variant="destructive" className="ml-2">{t("club.inactive")}</Badge> : null}</TableCell>
                          <TableCell className={`text-right ${change > 0 ? "text-accent" : change < 0 ? "text-destructive" : "text-muted-foreground"}`}>{change > 0 ? "+" : ""}{trophies(change)}</TableCell>
                          <TableCell className="text-right font-display text-primary">{trophies(member.trophies)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {!members.length ? <EmptyState title={t("club.noMatches")} detail={t("club.noMatchesDetail")} /> : null}
              <p className="text-xs text-muted-foreground">{t("club.inactiveDetail")}</p>
            </TabsContent>
            <TabsContent value="activity" className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(["all", "join", "leave", "role_change", "trophy_change"] as const).map((type) => <Button key={type} type="button" variant={eventFilter === type ? "default" : "outline"} size="sm" onClick={() => setEventFilter(type)}>{type === "all" ? t("club.allChanges") : readableMode(type)}</Button>)}
                <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={exportActivity}><Download /> {t("club.exportActivity")}</Button>
              </div>
              <div className="space-y-2">
                {filteredEvents.map((event, index) => <div key={`${event.recordedAt}-${event.playerTag}-${event.type}-${index}`} className="data-surface flex gap-3 p-4"><div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">{eventIcon(event.type)}</div><div className="min-w-0 flex-1"><p><Link to="/players" search={{ tag: event.playerTag }} className="font-medium hover:text-primary">{event.playerName}</Link> <span className="text-muted-foreground">{eventText(event, t)}</span></p><p className="mt-1 text-xs text-muted-foreground">{formatDate(event.recordedAt, locale, t)} · {event.playerTag}</p></div></div>)}
              </div>
              {!filteredEvents.length ? <EmptyState title={t("club.noChanges")} detail={t("club.noChangesDetail")} /> : null}
            </TabsContent>
          </Tabs>
        </>
      ) : null}

      <CommunityActivity data={communityQuery.data} />
    </div>
  );
}
