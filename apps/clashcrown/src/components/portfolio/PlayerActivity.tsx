import { CalendarDays, Database, LoaderCircle } from "lucide-react";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Player } from "@/lib/clash/domain";
import { isConvexConfigured } from "@/lib/convex";
import { playerActivityQuery, type PlayerActivityReport } from "@/lib/analytics";
import { useI18n } from "@/lib/i18n";

type ActivityDay = PlayerActivityReport["days"][number];

type CalendarDay = ActivityDay;

const WINDOW_DAYS = 90;

/**
 * Keep this query behind a separate component. The demo profile can render in
 * a standalone build without a Convex provider, while live profiles subscribe
 * to the same platform analytics function as the rest of the app.
 */
export function PlayerActivity({ player, isDemo = false }: { player: Player; isDemo?: boolean }) {
  if (isDemo || !isConvexConfigured) return <FallbackPlayerActivity player={player} isDemo={isDemo} />;
  return <LivePlayerActivity player={player} />;
}

function LivePlayerActivity({ player }: { player: Player }) {
  const report = useQuery(playerActivityQuery, { tag: player.tag });

  if (!report) {
    return (
      <ActivityFrame
        title="90-day battle activity"
        description="Loading the battles StatsConnect has observed for this player."
        badge={<Badge variant="outline"><LoaderCircle className="animate-spin" /> Loading</Badge>}
      >
        <div className="cr-activity-loading" aria-label="Loading activity calendar" role="status">
          {Array.from({ length: 14 }, (_, column) => (
            <span key={column} className="cr-activity-loading-column">
              {Array.from({ length: 7 }, (_, row) => <i key={row} />)}
            </span>
          ))}
        </div>
      </ActivityFrame>
    );
  }

  return <ActivityGrid report={report} source="observed" />;
}

function FallbackPlayerActivity({ player, isDemo }: { player: Player; isDemo: boolean }) {
  const report = fallbackReport(player);
  return <ActivityGrid report={report} source="battle-log" isDemo={isDemo} />;
}

function ActivityGrid({
  report,
  source,
  isDemo = false,
}: {
  report: PlayerActivityReport;
  source: "observed" | "battle-log";
  isDemo?: boolean;
}) {
  const { formatNumber, locale } = useI18n();
  const days = calendarDays(report.days);
  const weeks = activityWeeks(days);
  const monthLabels = monthLabelsFor(weeks, locale);
  const startDay = days[0]?.day ?? "";
  const endDay = days.at(-1)?.day ?? "";
  const rowsInWindow = report.days.filter((day) => day.day >= startDay && day.day <= endDay);
  const totalBattles = rowsInWindow.reduce((total, day) => total + day.battles, 0);
  const totalWins = rowsInWindow.reduce((total, day) => total + day.wins, 0);
  const totalLosses = rowsInWindow.reduce((total, day) => total + day.losses, 0);
  const totalDraws = rowsInWindow.reduce((total, day) => total + day.draws, 0);
  const activeDays = rowsInWindow.filter((day) => day.battles > 0).length;
  const winRate = totalBattles ? Math.round((totalWins / totalBattles) * 100) : 0;
  const observed = source === "observed";

  return (
    <ActivityFrame
      title="90-day battle activity"
      description={
        observed
          ? "Battles recorded by StatsConnect in UTC. A blank day means no battle was observed, not confirmed inactivity."
          : "A compact fallback from this profile’s current battle log. It is not a complete 90-day history."
      }
      badge={
        <Badge variant={observed ? "default" : "outline"}>
          {observed ? <Database /> : <CalendarDays />}
          {isDemo ? "Demo log" : observed ? "Observed" : "Battle log"}
        </Badge>
      }
    >
      <div className="cr-activity-layout">
        <div className="cr-activity-calendar-wrap">
          <div className="cr-activity-calendar" aria-label="90-day battle activity calendar">
            <div className="cr-activity-months" aria-hidden="true">
              {monthLabels.map((label, index) => <span key={`${label}-${index}`} className="cr-activity-month">{label}</span>)}
            </div>
            <div className="cr-activity-calendar-row">
              <div className="cr-activity-day-labels" aria-hidden="true">
                {(["", "Mon", "", "Wed", "", "Fri", ""] as const).map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
              </div>
              <div className="cr-activity-grid" role="grid" aria-label="Battles by UTC day">
                {weeks.flatMap((week, weekIndex) => week.map((day, dayIndex) => (
                  day ? (
                    <span
                      key={day.day}
                      role="gridcell"
                      aria-label={activityLabel(day, formatNumber)}
                      title={activityLabel(day, formatNumber)}
                      className={`cr-activity-cell cr-activity-level-${activityLevel(day.battles)}`}
                    />
                  ) : <span key={`empty-${weekIndex}-${dayIndex}`} className="cr-activity-cell cr-activity-empty" aria-hidden="true" />
                )))}
              </div>
            </div>
            <div className="cr-activity-legend" aria-hidden="true">
              <span>Fewer</span>
              {[0, 1, 3, 6, 10].map((battles) => <i key={battles} className={`cr-activity-cell cr-activity-level-${activityLevel(battles)}`} />)}
              <span>More</span>
            </div>
          </div>
        </div>

        <dl className="cr-activity-summary">
          <div><dt>Recorded battles</dt><dd>{formatNumber(totalBattles)}</dd></div>
          <div><dt>Active days</dt><dd>{formatNumber(activeDays)} <small>/ {WINDOW_DAYS}</small></dd></div>
          <div><dt>Win rate</dt><dd>{winRate}%</dd></div>
          <div><dt>Record</dt><dd>{totalWins}W · {totalLosses}L{totalDraws ? ` · ${totalDraws}D` : ""}</dd></div>
        </dl>
      </div>
      <p className="cr-activity-note">
        {observed
          ? `Coverage is limited to observed tracking${report.capped ? "; this window reached the 5,000-battle read cap" : ""}.`
          : "The official API battle log is limited and may omit older battles; connect tracking for an observed calendar."}
      </p>
    </ActivityFrame>
  );
}

function ActivityFrame({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description: string;
  badge: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="profile-section cr-activity-section" aria-labelledby="cr-activity-title">
      <Card className="cr-activity-card">
        <CardHeader className="cr-activity-header">
          <div>
            <CardTitle id="cr-activity-title">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {badge}
        </CardHeader>
        <CardContent className="cr-activity-content">{children}</CardContent>
      </Card>
    </section>
  );
}

function calendarDays(rows: ActivityDay[]): CalendarDay[] {
  const values = new Map(rows.map((row) => [row.day, row]));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: WINDOW_DAYS }, (_, index) => {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - (WINDOW_DAYS - 1 - index));
    const dayKey = day.toISOString().slice(0, 10);
    return values.get(dayKey) ?? { day: dayKey, battles: 0, wins: 0, losses: 0, draws: 0 };
  });
}

function activityWeeks(days: CalendarDay[]) {
  const firstWeekday = new Date(`${days[0]?.day}T00:00:00Z`).getUTCDay();
  const calendar: Array<CalendarDay | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...days,
  ];
  while (calendar.length % 7) calendar.push(null);
  return Array.from({ length: calendar.length / 7 }, (_, index) => calendar.slice(index * 7, index * 7 + 7));
}

function monthLabelsFor(weeks: Array<Array<CalendarDay | null>>, locale: string) {
  let previousMonth = "";
  return weeks.map((week) => {
    const day = week.find((item): item is CalendarDay => item !== null);
    if (!day) return "";
    const monthKey = day.day.slice(0, 7);
    if (monthKey === previousMonth) return "";
    previousMonth = monthKey;
    return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(`${day.day}T00:00:00Z`));
  });
}

function activityLevel(battles: number) {
  if (battles === 0) return 0;
  if (battles < 3) return 1;
  if (battles < 6) return 2;
  if (battles < 10) return 3;
  return 4;
}

function activityLabel(day: ActivityDay, formatNumber: (value: number) => string) {
  const battles = `${formatNumber(day.battles)} ${day.battles === 1 ? "battle" : "battles"}`;
  return `${day.day}: ${battles}, ${day.wins} wins, ${day.losses} losses${day.draws ? `, ${day.draws} draws` : ""}`;
}

function fallbackReport(player: Player): PlayerActivityReport {
  const days = new Map<string, ActivityDay>();
  for (const battle of player.battles) {
    const day = parseFallbackDay(battle.date);
    if (!day) continue;
    const current = days.get(day) ?? { day, battles: 0, wins: 0, losses: 0, draws: 0 };
    current.battles += 1;
    current.wins += battle.result === "Win" ? 1 : 0;
    current.losses += battle.result === "Loss" ? 1 : 0;
    current.draws += battle.result === "Draw" ? 1 : 0;
    days.set(day, current);
  }
  return { windowDays: WINDOW_DAYS, capped: false, days: [...days.values()].sort((left, right) => left.day.localeCompare(right.day)) };
}

function parseFallbackDay(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString().slice(0, 10);
}
