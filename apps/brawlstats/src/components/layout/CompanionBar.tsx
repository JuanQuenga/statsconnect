import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, FlaskConical, Settings, Star } from "lucide-react";
import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, collection } from "@/lib/api";
import { localeLabels, useI18n } from "@/lib/i18n";
import { setLocale, supportedLocales, usePreferences, type Locale } from "@/lib/preferences";
import type { EventItem } from "@/lib/types";

const ROTATION_KEY = "brawlstats.rotation.v1";

function useRotationAlerts() {
  const { alertsEnabled } = usePreferences();
  const eventsQuery = useQuery({
    queryKey: ["events", "rotation-alerts"],
    enabled: alertsEnabled,
    queryFn: () => apiFetch("/api/events").then((payload) => collection<EventItem>(payload)),
    refetchInterval: alertsEnabled ? 5 * 60_000 : false,
  });

  useEffect(() => {
    if (!alertsEnabled || !eventsQuery.data?.length || typeof window === "undefined") return;
    const signature = eventsQuery.data
      .map((item) => `${item.event?.id || ""}:${item.event?.mode || ""}:${item.event?.map || ""}`)
      .sort()
      .join("|");
    const previous = window.localStorage.getItem(ROTATION_KEY);
    window.localStorage.setItem(ROTATION_KEY, signature);
    if (!previous || previous === signature || Notification.permission !== "granted") return;
    const first = eventsQuery.data[0];
    const title = "Brawl Stars rotation changed";
    const body = first?.event?.map
      ? `${first.event.map} · ${first.event.mode || "New event"}`
      : "New maps and modes are active.";
    navigator.serviceWorker?.ready
      .then((registration) => registration.showNotification(title, { body, icon: `${import.meta.env.BASE_URL}assets/img/bs-stats.png` }))
      .catch(() => new Notification(title, { body }));
  }, [alertsEnabled, eventsQuery.data]);
}

export function CompanionBar() {
  const preferences = usePreferences();
  const { locale, t } = useI18n();
  useRotationAlerts();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <div className="border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex min-h-11 max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2 md:px-6">
        <Link
          to="/assistant"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          <FlaskConical className="size-3.5" />
          {t("assistant")}
        </Link>
        {preferences.savedProfiles.length ? (
          <div className="flex items-center gap-1.5" aria-label={t("savedProfiles")}>
            <Star className="size-3.5 shrink-0 text-primary" />
            {preferences.savedProfiles.slice(0, 5).map((profile) => (
              <Link
                key={profile.tag}
                to="/players"
                search={{ tag: `#${profile.tag}` }}
                className="max-w-32 shrink-0 truncate rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:border-primary/70"
              >
                {profile.name || `#${profile.tag}`}
              </Link>
            ))}
          </div>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {preferences.alertsEnabled ? <Bell className="size-3.5 text-accent" aria-label={t("alerts")} /> : null}
          <Select value={locale} onValueChange={(value) => value && setLocale(value as Locale)}>
            <SelectTrigger size="sm" aria-label={t("language")}>
              <SelectValue>{localeLabels[locale]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {supportedLocales.map((item) => <SelectItem key={item} value={item}>{localeLabels[item]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Link to="/settings" className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground" aria-label={t("settings")}>
            <Settings className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
